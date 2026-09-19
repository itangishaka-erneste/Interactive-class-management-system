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
     JWT_SECRET        any long random string
     SUPERADMIN_EMAIL   the ONE Google account allowed to be super admin
     APP_URL            your frontend URL (shown in the emailed instructions)

   Email (pick ONE):
     RESEND_API_KEY + MAIL_FROM                          -> sends over HTTPS (works on Render)
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM  -> sends through SMTP
   ============================================================================ */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Create reusable Nodemailer transporter instance if SMTP credentials exist
let smtpTransporter = null;
if (process.env.SMTP_HOST || process.env.SMTP_USER) {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);

  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true only for 465, false for 587
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    tls: {
      rejectUnauthorized: false, // Prevents local network/firewall handshake blocks
    },
    pool: true, // Reuse connections for speed and efficiency
  });
}

function getSuperAdminEmail() {
  const email = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) {
    throw httpError(500, "Server is missing SUPERADMIN_EMAIL in its .env file.");
  }
  return email;
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
  if (!GOOGLE_CLIENT_ID) {
    throw httpError(500, "Server is missing GOOGLE_CLIENT_ID in its .env file.");
  }

  let ticket;
  try {
    ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch {
    throw httpError(401, "Google verification failed. Please choose your account again.");
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.email) throw httpError(401, "Google token had no email.");
  if (!payload.email_verified) throw httpError(401, "Google email is not verified.");

  return { email: payload.email, name: payload.name || "", picture: payload.picture || "" };
}

function serializeSchool(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    code: r.school_code,
    status: r.status,
    paymentStatus: !!r.payment_status,
    logoUrl: r.logo_url,
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

/* ---------------------------------- realtime --------------------------------- */

let ns = null;

function setupSocket(io) {
  ns = io.of("/superadmin");

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
    socket.emit("ready", { email: socket.data.admin.email });
  });

  return ns;
}

function broadcast(event, payload) {
  if (ns) ns.emit(event, payload);
}

/* ----------------------------------- email ----------------------------------- */

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || process.env.SUPERADMIN_EMAIL;
  if (!from) {
    throw new Error("Email is not configured. Set MAIL_FROM or SMTP_USER in the server .env.");
  }

  // Option A: Send via Resend HTTP API
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`The email provider rejected the message (${res.status}). ${body}`.trim());
    }
    return;
  }

  // Option B: Send via Nodemailer (SMTP / Gmail)
  if (smtpTransporter) {
    await smtpTransporter.sendMail({ from, to, subject, text, html });
    return;
  }

  throw new Error("Email is not configured. Set RESEND_API_KEY or SMTP_HOST/SMTP_USER in the server .env.");
}

async function sendSchoolCode(school) {
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
router.get("/config", (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return sendError(res, 500, "Server is missing GOOGLE_CLIENT_ID in its .env file.");
  }
  res.json({ success: true, googleClientId: GOOGLE_CLIENT_ID });
});

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
        const marked = await pool.query("UPDATE schools SET code_sent_at = NOW() WHERE id = $1 RETURNING *", [id]);
        row = marked.rows[0];
        emailSent = true;
      } catch (err) {
        emailError = err.message;
        console.error("[superadmin] Could not email school code:", err);
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
      console.error("[superadmin] Could not email school code:", err);
      throw httpError(502, `Could not send the email: ${err.message}`);
    }

    const marked = await pool.query("UPDATE schools SET code_sent_at = NOW() WHERE id = $1 RETURNING *", [id]);
    const school = serializeSchool(marked.rows[0]);
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

module.exports = {
  router,
  setupSocket,
  broadcast,
  serializeSchool,
  verifyGoogleCredential,
  signToken,
  STATUS,
};