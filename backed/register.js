const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pool = require("./db");
// Spelling must match the real file name AND the require in server.js exactly
// (Superadmin.js). A different capital letter loads the file a second time on
// Windows/macOS and breaks live updates; on Render/Linux it crashes the server.
const {
  serializeSchool,
  verifyGoogleCredential,
  signToken,
  broadcast,
  STATUS,
} = require("./Superadmin");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "uploads", "logos");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const httpError = (status, message) => Object.assign(new Error(message), { status });

/* ------------------------------- phone helpers ------------------------------ */

function normalizeRwandaPhone(raw) {
  let v = (raw || "").replace(/[\s-]/g, "");
  if (v.startsWith("+250")) v = "0" + v.slice(4);
  else if (v.startsWith("250")) v = "0" + v.slice(3);
  return v;
}

function isValidRwandaPhone(raw) {
  return /^07[0-9]{8}$/.test(normalizeRwandaPhone(raw));
}

/* ---------------------------------- school code ----------------------------- */

// The code is created at registration but is NEVER sent back to the registering
// school. Only the super admin can see it, and it is emailed to the school after
// approval.
function generateSchoolCode() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `ECR-${n}`;
}

async function generateUniqueSchoolCode(client) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateSchoolCode();
    const existing = await client.query("SELECT 1 FROM schools WHERE school_code = $1", [code]);
    if (existing.rowCount === 0) return code;
  }
  throw httpError(500, "Could not generate a unique school code.");
}

/* ------------------------------------ logo ---------------------------------- */

const ALLOWED_LOGO_TYPES = { png: "png", jpeg: "jpg", jpg: "jpg", webp: "webp", gif: "gif" };

// Writes an uploaded logo to disk and returns its public path.
// Returns { logoUrl, savedFile } so the file can be deleted again if the
// database insert fails afterwards (no orphan files).
function saveLogo(logoInput) {
  if (!logoInput) return { logoUrl: null, savedFile: null };

  if (logoInput.startsWith("data:")) {
    const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(logoInput);
    if (!match) {
      throw httpError(400, "Logo must be a PNG, JPG, WEBP or GIF image.");
    }
    const ext = ALLOWED_LOGO_TYPES[match[1]];
    const buffer = Buffer.from(match[2], "base64");

    const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
    if (buffer.length > MAX_BYTES) {
      throw httpError(400, "Logo file is too large (max 3MB).");
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const fullPath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    return { logoUrl: `/uploads/logos/${filename}`, savedFile: fullPath };
  }

  try {
    const u = new URL(logoInput);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
  } catch {
    throw httpError(400, "Logo link is not a valid URL.");
  }

  return { logoUrl: logoInput, savedFile: null };
}

/* --------------------------------- tiny rate limit -------------------------- */

const attempts = new Map();
setInterval(() => attempts.clear(), 10 * 60 * 1000).unref();

function tooManyAttempts(key, max = 10, windowMs = 60 * 1000) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > max;
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error("[schools] Unexpected error:", err);
    res.status(status).json({ success: false, error: err.message || "Something went wrong." });
  }
};

/* ============================================================================
   POST /api/schools/register
   Saves the school as PENDING, tells every open super admin dashboard right
   away (WebSocket), and returns NO school code.
   ============================================================================ */

router.post("/register", async (req, res) => {
  const { schoolName, phone, logo, googleCredential } = req.body || {};

  if (!schoolName || !schoolName.trim()) {
    return res.status(400).json({ success: false, error: "School name is required." });
  }
  if (!phone || !isValidRwandaPhone(phone)) {
    return res.status(400).json({ success: false, error: "Enter a valid Rwandan phone number." });
  }
  if (!logo) {
    return res.status(400).json({ success: false, error: "A school logo is required." });
  }
  if (!googleCredential) {
    return res.status(400).json({ success: false, error: "Google verification is required." });
  }

  let client;
  let savedFile = null;
  let committed = false;

  try {
    // Verify with Google BEFORE taking a database connection, so a slow Google
    // call can never hold a connection from the pool.
    const google = await verifyGoogleCredential(googleCredential);
    const normalizedPhone = normalizeRwandaPhone(phone);

    client = await pool.connect();
    await client.query("BEGIN");

    const existingSchool = await client.query(
      "SELECT id, status FROM schools WHERE LOWER(email) = LOWER($1)",
      [google.email]
    );
    if (existingSchool.rowCount > 0) {
      await client.query("ROLLBACK");
      const waiting = existingSchool.rows[0].status === STATUS.PENDING;
      return res.status(409).json({
        success: false,
        error: waiting
          ? "This email already has a registration waiting for review. We will call you on the number you gave."
          : "A school is already registered with this email.",
      });
    }

    const logoResult = saveLogo(logo);
    savedFile = logoResult.savedFile;
    const schoolCode = await generateUniqueSchoolCode(client);

    const schoolResult = await client.query(
      `INSERT INTO schools (name, email, phone, logo_url, school_code, status, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING *`,
      [schoolName.trim(), google.email, normalizedPhone, logoResult.logoUrl, schoolCode, STATUS.PENDING]
    );
    const school = schoolResult.rows[0];

    // A users row for the school's admin account. Login itself is by Google
    // (matched on schools.email), so this row just keeps the account on file.
    await client.query(
      `INSERT INTO users (school_id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [school.id, google.name || schoolName.trim(), google.email, crypto.randomBytes(32).toString("hex")]
    );

    await client.query("COMMIT");
    committed = true;

    // Live update for the super admin dashboard (no refresh needed there).
    // Wrapped so a realtime problem can never turn a saved registration into
    // an error for the school.
    try {
      broadcast("school:registered", serializeSchool(school));
      console.log(`[register] "${school.name}" saved and broadcast to the super admin dashboard.`);
    } catch (err) {
      console.error("[register] Saved, but the live update failed:", err.message);
    }

    return res.status(201).json({
      success: true,
      email: google.email,
      message: "Registration received. Our team will call you and email your school code once approved.",
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    // Nothing was saved, so don't leave the uploaded logo behind.
    if (!committed && savedFile) fs.unlink(savedFile, () => {});

    const status = err.status || 500;
    if (status === 500) console.error("[register] Unexpected error:", err);
    return res.status(status).json({ success: false, error: err.message || "Registration failed." });
  } finally {
    if (client) client.release();
  }
});

/* ============================================================================
   POST /api/schools/login   { credential }
   School admin sign-in: Google only. The Google email must be the one the
   school registered with, and the school must have been approved.
   ============================================================================ */

router.post(
  "/login",
  wrap(async (req, res) => {
    const { credential } = req.body || {};
    if (!credential) throw httpError(400, "Google credential is required.");

    const google = await verifyGoogleCredential(credential);

    const r = await pool.query("SELECT * FROM schools WHERE LOWER(email) = LOWER($1)", [google.email]);
    if (r.rowCount === 0) {
      throw httpError(404, "No school is registered with this Google account. Register your school first.");
    }

    const school = r.rows[0];

    if (school.status === STATUS.PENDING) {
      throw httpError(
        403,
        "Your school is still waiting for approval. Our team will call you, then email your school code once it is approved."
      );
    }
    if (school.status === STATUS.SUSPENDED) {
      throw httpError(403, "This school has been suspended. Please contact support.");
    }
    if (school.status === STATUS.REJECTED) {
      throw httpError(403, "This registration was not approved. Please contact support.");
    }
    if (school.status !== STATUS.ACTIVE) {
      throw httpError(403, "This school is not active yet.");
    }

    const token = signToken({ role: "schoolAdmin", schoolId: school.id, email: school.email }, "7d");

    res.json({
      success: true,
      token,
      school: {
        id: school.id,
        name: school.name,
        email: school.email,
        code: school.school_code,
        logoUrl: school.logo_url,
      },
    });
  })
);

/* ============================================================================
   GET /api/schools/public
   Approved schools only, for the student / teacher sign-up dropdown.
   Never includes codes or contact details.
   ============================================================================ */

router.get(
  "/public",
  wrap(async (req, res) => {
    const r = await pool.query("SELECT id, name FROM schools WHERE status = $1 ORDER BY name ASC", [STATUS.ACTIVE]);
    res.json({ success: true, schools: r.rows });
  })
);

/* ============================================================================
   POST /api/schools/verify-code   { schoolId, schoolCode }
   Lets a student / teacher prove they were given the school's code.
   ============================================================================ */

router.post(
  "/verify-code",
  wrap(async (req, res) => {
    if (tooManyAttempts(req.ip)) {
      throw httpError(429, "Too many attempts. Please wait a minute and try again.");
    }

    const schoolId = Number.parseInt(req.body && req.body.schoolId, 10);
    const schoolCode = String((req.body && req.body.schoolCode) || "").trim();
    if (!Number.isInteger(schoolId) || !schoolCode) {
      throw httpError(400, "Choose your school and enter its code.");
    }

    const r = await pool.query(
      "SELECT id, name FROM schools WHERE id = $1 AND UPPER(school_code) = UPPER($2) AND status = $3",
      [schoolId, schoolCode, STATUS.ACTIVE]
    );
    if (r.rowCount === 0) {
      throw httpError(400, "That school code doesn't match the selected school.");
    }

    res.json({ success: true, school: r.rows[0] });
  })
);

module.exports = router;