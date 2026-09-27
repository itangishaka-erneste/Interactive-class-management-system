const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const pool = require("./db");

const router = express.Router();

/* ============================================================================
   CONFIG  (all of this comes from your .env)

     GOOGLE_CLIENT_ID   your Google OAuth client id
     JWT_SECRET         any long random string
     SUPERADMIN_EMAIL   the ONE Google account allowed to be super admin
     APP_URL            your frontend URL (shown in the emailed instructions)

   EMAIL - set ONE of these (they are tried in this order):

     1) Resend  (HTTPS, works on Render)
          RESEND_API_KEY=re_xxx
          MAIL_FROM="Easy ClassWork <noreply@yourdomain.com>"
        NOTE: MAIL_FROM must be on a domain you verified in Resend.
        Without a verified domain Resend only delivers to your own account
        email, so approvals to other schools will fail.

     2) Brevo   (HTTPS, works on Render, no domain needed - verify ONE sender
        email inside Brevo)
          BREVO_API_KEY=xkeysib-xxx
          MAIL_FROM="Easy ClassWork <the-email-you-verified-in-brevo@gmail.com>"

     3) SMTP    (Gmail etc.)  -> DOES NOT WORK on Render free web services,
        because outbound SMTP ports (25/465/587) are blocked there. It works
        on your own computer and on hosts that allow SMTP.
          SMTP_HOST=smtp.gmail.com
          SMTP_PORT=587
          SMTP_USER=you@gmail.com
          SMTP_PASS=your-16-letter-gmail-app-password
          MAIL_FROM="Easy ClassWork <you@gmail.com>"
   ============================================================================ */

// FIX: this used to be read once, eagerly, at module-load time:
//   const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
//   const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);
// That's inconsistent with JWT_SECRET/SUPERADMIN_EMAIL below, which are read
// lazily through getSecret()/getSuperAdminEmail() specifically to avoid
// load-order problems. If dotenv.config() (or Render's own env injection)
// hadn't finished by the moment this file was first require()'d, this
// constant froze as undefined for the entire lifetime of the process --
// every /config and /login request would fail with "Server is missing
// GOOGLE_CLIENT_ID", even once the variable was actually set, until the next
// restart. Reading it fresh on every call fixes that.
function getGoogleClientId() {
  const id = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!id) {
    throw httpError(500, "Server is missing GOOGLE_CLIENT_ID in its .env file.");
  }
  return id;
}

// The OAuth2Client itself is cheap to construct, but we still only build it
// once we know we have a client id, and we rebuild it if the id ever changes
// (e.g. you update the env var and redeploy without a full restart).
let _oauthClient = null;
let _oauthClientId = null;
function getOAuthClient() {
  const id = getGoogleClientId();
  if (!_oauthClient || _oauthClientId !== id) {
    _oauthClient = new OAuth2Client(id);
    _oauthClientId = id;
  }
  return _oauthClient;
}

// Reusable SMTP transporter (only created when SMTP settings exist).
let smtpTransporter = null;
if (process.env.SMTP_HOST || process.env.SMTP_USER) {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);

  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true only for 465, false for 587 (STARTTLS)
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // Fail fast instead of hanging for 2 minutes when the port is blocked.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

if (!process.env.SUPERADMIN_EMAIL) {
  console.warn(
    "[superadmin] SUPERADMIN_EMAIL is not set. Super admin login is disabled until you add it to .env."
  );
}

const STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REJECTED: "rejected",
};

/* ------------------------------- small helpers ------------------------------ */

const httpError = (status, message) => Object.assign(new Error(message), { status });

function getSuperAdminEmail() {
  const email = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) {
    throw httpError(500, "Server is missing SUPERADMIN_EMAIL in its .env file.");
  }
  return email;
}

function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw httpError(500, "Server is missing JWT_SECRET in its .env file.");
  }
  return process.env.JWT_SECRET;
}

function signToken(payload, expiresIn = "12h") {
  return jwt.sign(payload, getSecret(), { expiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (err) {
    if (err.status) throw err;
    throw httpError(401, "Your session expired. Please sign in again.");
  }
}

async function verifyGoogleCredential(credential) {
  const clientId = getGoogleClientId();
  const client = getOAuthClient();

  let ticket;
  try {
    ticket = await Promise.race([
      client.verifyIdToken({ idToken: credential, audience: clientId }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Google verification timed out")), 15000)
      ),
    ]);
  } catch (err) {
    console.error("[superadmin] Google verification failed:", err.message);
    throw httpError(401, "Google verification failed. Please choose your account again.");
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.email) throw httpError(401, "Google token had no email.");
  if (!payload.email_verified) throw httpError(401, "Google email is not verified.");

  return { email: payload.email, name: payload.name || "", picture: payload.picture || "" };
}

function serializeSchool(r) {
  const logo = r.logo_url || null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    code: r.school_code,
    status: r.status,
    paymentStatus: !!r.payment_status,
    // A base64 logo can be huge; don't push it through every list/socket event.
    logoUrl: logo && !String(logo).startsWith("data:") ? logo : null,
    createdAt: r.created_at,
    codeSentAt: r.code_sent_at || null,
  };
}

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message, error: message });

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error("[superadmin] Unexpected error:", err);
    sendError(res, status, err.message || "Something went wrong.");
  }
};

/* ------------------------------ database safety ------------------------------ */

// The email feature needs the code_sent_at column. We only ALTER the table when
// the column is really missing, and we give up after 5 seconds if the table is
// locked. (A waiting ALTER TABLE makes every other query on "schools" queue
// behind it, which looks like registration / sign-in / sending "never ends".)
(async () => {
  let client;
  try {
    client = await pool.connect();
    const has = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'code_sent_at' LIMIT 1"
    );
    if (has.rowCount === 0) {
      await client.query("SET lock_timeout = '5s'");
      await client.query("ALTER TABLE schools ADD COLUMN code_sent_at TIMESTAMPTZ");
      console.log("[superadmin] Added missing column schools.code_sent_at");
    }
  } catch (err) {
    console.error("[superadmin] Could not ensure code_sent_at column:", err.message);
  } finally {
    if (client) {
      try { await client.query("RESET lock_timeout"); } catch { /* ignore */ }
      client.release();
    }
  }
})();

/* ---------------------------------- realtime --------------------------------- */

// Kept on globalThis so realtime still works even if this file gets loaded twice
// (that happens when one file requires "./superadmin" and another "./Superadmin":
// on Windows/macOS the two spellings are treated as two different modules).
const NS_KEY = "__ecwSuperadminNamespace";

// Call this ONCE from your server entry file with the socket.io Server.
function setupSocket(io) {
  const ns = io.of("/superadmin");
  globalThis[NS_KEY] = ns;

  ns.use((socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth && socket.handshake.auth.token);
      if (payload.role !== "superadmin") throw new Error("not super admin");
      socket.data.admin = payload;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  ns.on("connection", (socket) => {
    console.log(`[superadmin] realtime connected: ${socket.data.admin.email}`);
    socket.emit("ready", { email: socket.data.admin.email });
  });

  return ns;
}

// Used by other routes too, e.g. broadcast("school:registered", serializeSchool(row)).
function broadcast(event, payload) {
  const ns = globalThis[NS_KEY];
  if (ns) ns.emit(event, payload);
  else console.warn(`[superadmin] broadcast("${event}") skipped: setupSocket(io) was never called.`);
}

/* ----------------------------------- email ----------------------------------- */

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// "Name <a@b.com>"  ->  { name, email }
function parseAddress(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || "");
  if (m) return { name: m[1].replace(/^"|"$/g, "").trim() || "Easy ClassWork Records", email: m[2].trim() };
  return { name: "Easy ClassWork Records", email: String(from || "").trim() };
}

function requireFetch() {
  if (typeof fetch !== "function") {
    throw new Error("This server's Node.js is too old for fetch(). Use Node 18 or newer.");
  }
}

async function readProviderError(res) {
  const raw = await res.text().catch(() => "");
  try {
    const j = JSON.parse(raw);
    return j.message || j.error || (j.errors && JSON.stringify(j.errors)) || raw;
  } catch {
    return raw;
  }
}

async function sendViaResend({ to, subject, text, html }) {
  requireFetch();
  const from = process.env.MAIL_FROM || "Easy ClassWork Records <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await readProviderError(res);
    let hint = "";
    if (res.status === 401 || res.status === 403) {
      hint = " (Check RESEND_API_KEY, and that MAIL_FROM is on a domain verified in Resend. Without a verified domain Resend only sends to your own account email.)";
    }
    throw new Error(`Resend rejected the message (${res.status}): ${detail}${hint}`);
  }
}

async function sendViaBrevo({ to, subject, text, html }) {
  requireFetch();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error("MAIL_FROM is not set (it must be a sender you verified in Brevo).");
  const sender = parseAddress(from);

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await readProviderError(res);
    throw new Error(`Brevo rejected the message (${res.status}): ${detail}`);
  }
}

async function sendViaSmtp({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error("MAIL_FROM or SMTP_USER must be set.");
  try {
    await smtpTransporter.sendMail({ from, to, subject, text, html });
  } catch (err) {
    let hint = "";
    if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED"].includes(err.code)) {
      hint = " (Could not connect to the SMTP server. Hosts like Render block SMTP ports; use RESEND_API_KEY or BREVO_API_KEY instead.)";
    } else if (err.code === "EAUTH") {
      hint = " (Login rejected. For Gmail use a 16-letter App Password, not your normal password.)";
    }
    throw new Error(`${err.message}${hint}`);
  }
}

// Tries every configured provider in order until one works.
async function sendEmail(message) {
  const attempts = [];
  if (process.env.RESEND_API_KEY) attempts.push(["Resend", sendViaResend]);
  if (process.env.BREVO_API_KEY) attempts.push(["Brevo", sendViaBrevo]);
  if (smtpTransporter) attempts.push(["SMTP", sendViaSmtp]);

  if (attempts.length === 0) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY, BREVO_API_KEY or SMTP_HOST/SMTP_USER in the server .env."
    );
  }

  const errors = [];
  for (const [name, fn] of attempts) {
    try {
      await fn(message);
      console.log(`[superadmin] Email sent to ${message.to} via ${name}.`);
      return;
    } catch (err) {
      console.error(`[superadmin] ${name} email failed:`, err.message);
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

async function sendSchoolCode(school) {
  if (!school.school_code) {
    throw new Error("This school has no school code saved, so there is nothing to email.");
  }

  const loginUrl = process.env.APP_URL || "";
  const name = escapeHtml(school.name);
  const code = escapeHtml(school.school_code);
  const email = escapeHtml(school.email);

  const text = [
    "Hello,",
    "",
    `Good news: ${school.name} has been approved on Easy ClassWork Records.`,
    "",
    `Your school code: ${school.school_code}`,
    "",
    "How to get started:",
    `1. Sign in as school admin with the Google account ${school.email}${loginUrl ? ` at ${loginUrl}` : ""}.`,
    "2. Share the school code with your teachers and students so they can sign up.",
    "",
    "Please keep this code private to your school.",
    "",
    "Easy ClassWork Records",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#111827;line-height:1.55">
      <h2 style="margin:0 0 8px;color:rgb(22,32,111)">${name} is approved</h2>
      <p style="margin:0 0 16px">Your school is now active on Easy ClassWork Records.</p>
      <div style="background:#ECFDF5;border:1px solid #10B981;border-radius:10px;padding:16px;text-align:center;margin:0 0 16px">
        <div style="font-size:12px;color:#6B7280;margin-bottom:4px">Your school code</div>
        <div style="font-size:26px;font-weight:800;letter-spacing:3px;color:rgb(22,32,111)">${code}</div>
      </div>
      <ol style="padding-left:18px;margin:0 0 16px">
        <li>Sign in as <b>school admin</b> with the Google account <b>${email}</b>${
          loginUrl ? ` at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a>` : ""
        }.</li>
        <li>Share the school code with your teachers and students so they can sign up.</li>
      </ol>
      <p style="font-size:12px;color:#6B7280;margin:0">Please keep this code private to your school.</p>
    </div>`;

  await sendEmail({
    to: school.email,
    subject: `${String(school.name).replace(/[\r\n]+/g, " ")} is approved - your school code`,
    text,
    html,
  });
}

/* ------------------------------ public routes -------------------------------- */

// GET /api/superadmin/config
router.get(
  "/config",
  wrap(async (req, res) => {
    // Wrapped (rather than the old inline `if (!GOOGLE_CLIENT_ID) ...`) so
    // this benefits from the same lazy re-check as everything else, and so a
    // thrown error always comes back as a consistent { success, message }
    // JSON body instead of risking an unhandled shape.
    const googleClientId = getGoogleClientId();
    res.json({ success: true, googleClientId });
  })
);

// POST /api/superadmin/login
router.post(
  "/login",
  wrap(async (req, res) => {
    const { credential } = req.body || {};
    if (!credential) throw httpError(400, "Google credential is required.");

    const allowedEmail = getSuperAdminEmail();
    const google = await verifyGoogleCredential(credential);

    if (google.email.trim().toLowerCase() !== allowedEmail) {
      throw httpError(403, "This Google account is not authorized for super admin access.");
    }

    const token = signToken({ role: "superadmin", email: google.email });
    res.json({ success: true, token, email: google.email, name: google.name });
  })
);

/* --------------------------- everything below needs login -------------------- */

function requireSuperAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw httpError(401, "Please sign in.");
    const payload = verifyToken(token);
    if (payload.role !== "superadmin") throw httpError(403, "Not allowed.");
    req.admin = payload;
    next();
  } catch (err) {
    sendError(res, err.status || 401, err.message);
  }
}

router.use(requireSuperAdmin);

function parseId(req) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, "Invalid school id.");
  return id;
}

async function getSchoolRow(id) {
  const r = await pool.query("SELECT * FROM schools WHERE id = $1", [id]);
  if (r.rowCount === 0) throw httpError(404, "School not found.");
  return r.rows[0];
}

async function setStatus(id, status) {
  const r = await pool.query("UPDATE schools SET status = $1 WHERE id = $2 RETURNING *", [status, id]);
  if (r.rowCount === 0) throw httpError(404, "School not found.");
  const school = serializeSchool(r.rows[0]);
  broadcast("school:updated", school);
  return school;
}

// POST /api/superadmin/test-email   (body: { to?: string })
// Lets you check your email setup from the dashboard without approving a school.
router.post(
  "/test-email",
  wrap(async (req, res) => {
    const to = String((req.body && req.body.to) || req.admin.email).trim();
    try {
      await sendEmail({
        to,
        subject: "Easy ClassWork Records - test email",
        text: "This is a test email. If you can read it, school code emails will work.",
        html: "<p>This is a test email from <b>Easy ClassWork Records</b>. If you can read it, school code emails will work.</p>",
      });
    } catch (err) {
      throw httpError(502, err.message);
    }
    res.json({ success: true, to });
  })
);

// GET /api/superadmin/schools
router.get(
  "/schools",
  wrap(async (req, res) => {
    const r = await pool.query("SELECT * FROM schools ORDER BY created_at DESC, id DESC");
    res.json({ success: true, schools: r.rows.map(serializeSchool) });
  })
);

// PATCH /api/superadmin/schools/:id/payment
router.patch(
  "/schools/:id/payment",
  wrap(async (req, res) => {
    const id = parseId(req);
    const paid = req.body && req.body.paid;
    if (typeof paid !== "boolean") throw httpError(400, "'paid' must be true or false.");

    const r = await pool.query("UPDATE schools SET payment_status = $1 WHERE id = $2 RETURNING *", [paid, id]);
    if (r.rowCount === 0) throw httpError(404, "School not found.");

    const school = serializeSchool(r.rows[0]);
    broadcast("school:updated", school);
    res.json({ success: true, school });
  })
);

// POST /api/superadmin/schools/:id/approve
router.post(
  "/schools/:id/approve",
  wrap(async (req, res) => {
    const id = parseId(req);
    const existing = await getSchoolRow(id);

    if (!existing.payment_status) {
      throw httpError(400, "Mark this school as paid before approving it.");
    }

    const updated = await pool.query("UPDATE schools SET status = $1 WHERE id = $2 RETURNING *", [STATUS.ACTIVE, id]);
    let row = updated.rows[0];
    let emailSent = false;
    let emailError = null;

    if (!row.code_sent_at) {
      try {
        await sendSchoolCode(row);
        emailSent = true;
      } catch (err) {
        emailError = err.message;
        console.error("[superadmin] Could not email school code:", err.message);
      }

      // Recording "sent" is separate so a database problem here is never
      // reported as an email failure (the email itself already went out).
      if (emailSent) {
        try {
          const marked = await pool.query("UPDATE schools SET code_sent_at = NOW() WHERE id = $1 RETURNING *", [id]);
          row = marked.rows[0];
        } catch (err) {
          console.error("[superadmin] Email sent, but could not record code_sent_at:", err.message);
        }
      }
    }

    const school = serializeSchool(row);
    broadcast("school:updated", school);
    res.json({ success: true, school, emailSent, emailError });
  })
);

// POST /api/superadmin/schools/:id/send-code
router.post(
  "/schools/:id/send-code",
  wrap(async (req, res) => {
    const id = parseId(req);
    const row = await getSchoolRow(id);

    if (row.status !== STATUS.ACTIVE) {
      throw httpError(400, "Approve the school before emailing its code.");
    }

    try {
      await sendSchoolCode(row);
    } catch (err) {
      console.error("[superadmin] Could not email school code:", err.message);
      throw httpError(502, `Could not send the email: ${err.message}`);
    }

    let latest = row;
    try {
      const marked = await pool.query("UPDATE schools SET code_sent_at = NOW() WHERE id = $1 RETURNING *", [id]);
      latest = marked.rows[0];
    } catch (err) {
      console.error("[superadmin] Email sent, but could not record code_sent_at:", err.message);
    }

    const school = serializeSchool(latest);
    broadcast("school:updated", school);
    res.json({ success: true, school });
  })
);

// POST /api/superadmin/schools/:id/suspend
router.post(
  "/schools/:id/suspend",
  wrap(async (req, res) => {
    const id = parseId(req);
    const row = await getSchoolRow(id);
    if (row.status !== STATUS.ACTIVE) throw httpError(400, "Only active schools can be suspended.");
    res.json({ success: true, school: await setStatus(id, STATUS.SUSPENDED) });
  })
);

// POST /api/superadmin/schools/:id/reject
router.post(
  "/schools/:id/reject",
  wrap(async (req, res) => {
    const id = parseId(req);
    const row = await getSchoolRow(id);
    if (row.status === STATUS.ACTIVE) throw httpError(400, "Suspend an active school instead of rejecting it.");
    res.json({ success: true, school: await setStatus(id, STATUS.REJECTED) });
  })
);

// DELETE /api/superadmin/schools/:id
router.delete(
  "/schools/:id",
  wrap(async (req, res) => {
    const id = parseId(req);
    const row = await getSchoolRow(id);

    await pool.query("DELETE FROM schools WHERE id = $1", [id]);

    if (row.logo_url && row.logo_url.startsWith("/uploads/logos/")) {
      const file = path.join(__dirname, "uploads", "logos", path.basename(row.logo_url));
      fs.unlink(file, () => {});
    }

    broadcast("school:deleted", { id });
    res.json({ success: true });
  })
);

/* ----------------------------- school admin API ---------------------------- */

// These routes intentionally use the same JWT as the school-admin frontend.
// A school id may be issued as either school_id or schoolId by the login route.
function requireSchoolAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw httpError(401, "Please sign in.");
    const payload = verifyToken(token);
    if (!["school_admin", "school-admin", "schooladmin"].includes(payload.role)) {
      throw httpError(403, "School admin access required.");
    }
    const schoolId = Number(payload.school_id || payload.schoolId);
    if (!Number.isInteger(schoolId) || schoolId < 1) throw httpError(403, "Your account is not linked to a school.");
    req.schoolAdmin = { ...payload, schoolId };
    next();
  } catch (err) {
    sendError(res, err.status || 401, err.message);
  }
}

function bodyId(value, name) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, `${name} is required.`);
  return id;
}

const schoolAdmin = express.Router();
schoolAdmin.use(requireSchoolAdmin);

// Only registered users belonging to the admin's school are returned.
schoolAdmin.get("/teachers", wrap(async (req, res) => {
  const r = await pool.query(
    "SELECT id, name, email, role FROM users WHERE school_id = $1 AND role IN ('teacher', 'teacher_admin') ORDER BY name, id",
    [req.schoolAdmin.schoolId]
  );
  res.json({ success: true, teachers: r.rows });
}));

schoolAdmin.get("/students", wrap(async (req, res) => {
  const r = await pool.query(
    "SELECT id, name, email, role FROM users WHERE school_id = $1 AND role = 'student' ORDER BY name, id",
    [req.schoolAdmin.schoolId]
  );
  res.json({ success: true, students: r.rows });
}));

schoolAdmin.get("/classes", wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT c.*, COALESCE(json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'email', t.email))
       FILTER (WHERE t.id IS NOT NULL), '[]') AS teachers,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'email', s.email))
       FILTER (WHERE s.id IS NOT NULL), '[]') AS students
     FROM classes c
     LEFT JOIN class_teachers ct ON ct.class_id = c.id
     LEFT JOIN users t ON t.id = ct.teacher_id
     LEFT JOIN class_students cs ON cs.class_id = c.id
     LEFT JOIN users s ON s.id = cs.student_id
     WHERE c.school_id = $1 GROUP BY c.id ORDER BY c.id DESC`,
    [req.schoolAdmin.schoolId]
  );
  res.json({ success: true, classes: r.rows });
}));

schoolAdmin.post("/classes", wrap(async (req, res) => {
  const name = String((req.body || {}).name || "").trim();
  if (!name) throw httpError(400, "Class name is required.");
  const r = await pool.query("INSERT INTO classes (school_id, name) VALUES ($1, $2) RETURNING *", [req.schoolAdmin.schoolId, name]);
  res.status(201).json({ success: true, class: r.rows[0] });
}));

schoolAdmin.post("/classes/:id/assign", wrap(async (req, res) => {
  const classId = bodyId(req.params.id, "Class id");
  const teacherIds = Array.isArray(req.body && req.body.teacherIds) ? req.body.teacherIds : [];
  const studentIds = Array.isArray(req.body && req.body.studentIds) ? req.body.studentIds : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const own = await client.query("SELECT id FROM classes WHERE id = $1 AND school_id = $2", [classId, req.schoolAdmin.schoolId]);
    if (!own.rowCount) throw httpError(404, "Class not found.");
    await client.query("DELETE FROM class_teachers WHERE class_id = $1", [classId]);
    await client.query("DELETE FROM class_students WHERE class_id = $1", [classId]);
    for (const id of teacherIds) await client.query("INSERT INTO class_teachers (class_id, teacher_id) SELECT $1, id FROM users WHERE id = $2 AND school_id = $3 AND role IN ('teacher', 'teacher_admin') ON CONFLICT DO NOTHING", [classId, bodyId(id, "Teacher id"), req.schoolAdmin.schoolId]);
    for (const id of studentIds) await client.query("INSERT INTO class_students (class_id, student_id) SELECT $1, id FROM users WHERE id = $2 AND school_id = $3 AND role = 'student' ON CONFLICT DO NOTHING", [classId, bodyId(id, "Student id"), req.schoolAdmin.schoolId]);
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) { await client.query("ROLLBACK"); throw err; } finally { client.release(); }
}));

router.use("/school-admin", schoolAdmin);

module.exports = {
  router,
  setupSocket,
  broadcast,
  serializeSchool,
  verifyGoogleCredential,
  signToken,
  sendEmail,
  STATUS,
};