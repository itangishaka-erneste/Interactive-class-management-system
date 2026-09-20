/* ============================================================================
   classroom.js  -  shared pieces for teacher.js, student.js and School_admin.js

   - creates the classroom tables (ecw_*) if they do not exist yet
   - student / teacher accounts (Google sign-in, school code check)
   - member auth middleware (JWT)
   - realtime (Socket.IO namespace /classroom)

   Rooms used by the realtime layer:
     member:<id>   every socket of one person (multi-tab / multi-device sync)
     class:<id>    every student of one class
     school:<id>   everybody in one school (students, teachers AND the school
                   admin dashboard - see setupClassroomSocket below)
   ============================================================================ */

const jwt = require("jsonwebtoken");
const pool = require("./db");
// Same spelling as server.js on purpose (see the note about "./Superadmin").
const { verifyGoogleCredential } = require("./Superadmin");

const httpError = (status, message) => Object.assign(new Error(message), { status });

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message, error: message });

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error("[classroom] Unexpected error:", err);
    sendError(res, status, err.message || "Something went wrong.");
  }
};

/* -------------------------------- database ---------------------------------- */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ecw_classes (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ecw_classes_school_name_uq ON ecw_classes (school_id, LOWER(name));

CREATE TABLE IF NOT EXISTS ecw_members (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  class_id INTEGER REFERENCES ecw_classes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ecw_members_role_email_uq ON ecw_members (role, LOWER(email));

CREATE TABLE IF NOT EXISTS ecw_teacher_assignments (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES ecw_members(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES ecw_classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  UNIQUE (teacher_id, class_id, subject)
);

CREATE TABLE IF NOT EXISTS ecw_notes (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES ecw_members(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES ecw_classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  file_url TEXT,
  file_type TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ecw_notes_class_idx ON ecw_notes (class_id, status);

CREATE TABLE IF NOT EXISTS ecw_quizzes (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES ecw_members(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES ecw_classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  time_limit_minutes INTEGER,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ecw_quizzes_class_idx ON ecw_quizzes (class_id, status);

CREATE TABLE IF NOT EXISTS ecw_quiz_questions (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES ecw_quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  question TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ecw_quiz_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES ecw_quiz_questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS ecw_quiz_attempts (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES ecw_quizzes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES ecw_members(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  total INTEGER,
  raw_score INTEGER,
  penalty_marks INTEGER NOT NULL DEFAULT 0,
  final_score INTEGER,
  score_percent INTEGER,
  UNIQUE (quiz_id, student_id)
);

CREATE TABLE IF NOT EXISTS ecw_quiz_answers (
  attempt_id INTEGER NOT NULL REFERENCES ecw_quiz_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES ecw_quiz_questions(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES ecw_quiz_options(id) ON DELETE CASCADE,
  PRIMARY KEY (attempt_id, question_id)
);
`;

// Runs once at startup. lock_timeout means a locked table can never make the
// server hang forever waiting.
const ready = (async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query("SET lock_timeout = '10s'");
    await client.query(SCHEMA_SQL);
    console.log("[classroom] Tables are ready.");
  } finally {
    if (client) {
      try { await client.query("RESET lock_timeout"); } catch { /* ignore */ }
      client.release();
    }
  }
})();
ready.catch((err) => console.error("[classroom] Could not create tables:", err.message));

function requireReady(req, res, next) {
  ready.then(
    () => next(),
    (err) => sendError(res, 500, `Classroom database is not ready: ${err.message}`)
  );
}

/* ---------------------------------- members --------------------------------- */

const MEMBER_SELECT = `
  SELECT m.*, s.name AS school_name, s.status AS school_status, c.name AS class_name
  FROM ecw_members m
  JOIN schools s ON s.id = m.school_id
  LEFT JOIN ecw_classes c ON c.id = m.class_id`;

async function loadMember(id) {
  const r = await pool.query(`${MEMBER_SELECT} WHERE m.id = $1`, [id]);
  return r.rows[0] || null;
}

function serializeMember(m) {
  return {
    id: m.id,
    role: m.role,
    fullName: m.full_name,
    email: m.email,
    schoolId: m.school_id,
    schoolName: m.school_name,
    classId: m.class_id || null,
    className: m.class_name || null,
  };
}

function getSecret() {
  if (!process.env.JWT_SECRET) throw httpError(500, "Server is missing JWT_SECRET in its .env file.");
  return process.env.JWT_SECRET;
}

function signMemberToken(m) {
  return jwt.sign(
    { role: m.role, memberId: m.id, schoolId: m.school_id, email: m.email },
    getSecret(),
    { expiresIn: "7d" }
  );
}

function readBearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

async function memberFromToken(token, role) {
  if (!token) throw httpError(401, "Please sign in.");
  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch (err) {
    if (err.status) throw err;
    throw httpError(401, "Your session expired. Please sign in again.");
  }
  if (payload.role !== role) throw httpError(401, `Please sign in again as a ${role}.`);
  const m = await loadMember(payload.memberId);
  if (!m || m.role !== role) throw httpError(401, "This account no longer exists. Please sign in again.");
  if (m.status !== "active") throw httpError(403, "This account is not active.");
  if (m.school_status !== "active") throw httpError(403, "Your school is not active. Please contact your school admin.");
  return m;
}

function requireMember(role) {
  return async (req, res, next) => {
    try {
      req.member = await memberFromToken(readBearer(req), role);
      next();
    } catch (err) {
      sendError(res, err.status || 401, err.message);
    }
  };
}

/* tiny in-memory rate limit for sign-up / sign-in */
const attempts = new Map();
setInterval(() => attempts.clear(), 10 * 60 * 1000).unref();
function tooManyAttempts(key, max = 15, windowMs = 60 * 1000) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > max;
}

// POST /register and POST /login for one role ("teacher" or "student").
function authHandlers(role) {
  return {
    register: wrap(async (req, res) => {
      if (tooManyAttempts(`reg:${req.ip}`)) throw httpError(429, "Too many attempts. Please wait a minute and try again.");

      const { credential, fullName, schoolId, schoolCode } = req.body || {};
      if (!credential) throw httpError(400, "Google verification is required.");
      const name = String(fullName || "").trim();
      if (name.length < 2 || name.length > 120) throw httpError(400, "Please enter your full name.");
      const sid = Number.parseInt(schoolId, 10);
      const code = String(schoolCode || "").trim();
      if (!Number.isInteger(sid) || !code) throw httpError(400, "Choose your school and enter its code.");

      const google = await verifyGoogleCredential(credential);

      const s = await pool.query(
        "SELECT id, name, status FROM schools WHERE id = $1 AND UPPER(school_code) = UPPER($2)",
        [sid, code]
      );
      if (s.rowCount === 0) throw httpError(400, "That school code doesn't match the selected school.");
      if (s.rows[0].status !== "active") throw httpError(403, "This school is not active yet.");

      const existing = await pool.query(
        "SELECT id FROM ecw_members WHERE role = $1 AND LOWER(email) = LOWER($2)",
        [role, google.email]
      );
      if (existing.rowCount > 0) throw httpError(409, "An account already exists for this email. Please sign in instead.");

      try {
        await pool.query(
          "INSERT INTO ecw_members (role, school_id, email, full_name) VALUES ($1, $2, $3, $4)",
          [role, sid, google.email, name]
        );
      } catch (err) {
        if (err.code === "23505") throw httpError(409, "An account already exists for this email. Please sign in instead.");
        throw err;
      }

      // Let an open school-admin dashboard know a new teacher/student just joined,
      // without it having to refresh or poll.
      try {
        emit(rooms.school(sid), "member:registered", { role, fullName: name, email: google.email });
      } catch { /* realtime is best-effort */ }

      res.status(201).json({ success: true, message: "Account created. You can sign in now." });
    }),

    login: wrap(async (req, res) => {
      if (tooManyAttempts(`login:${req.ip}`, 30)) throw httpError(429, "Too many attempts. Please wait a minute and try again.");

      const { credential } = req.body || {};
      if (!credential) throw httpError(400, "Google credential is required.");
      const google = await verifyGoogleCredential(credential);

      const r = await pool.query(
        `${MEMBER_SELECT} WHERE m.role = $1 AND LOWER(m.email) = LOWER($2)`,
        [role, google.email]
      );
      if (r.rowCount === 0) throw httpError(404, "No account found for this email. Please register first.");
      const m = r.rows[0];
      if (m.status !== "active") throw httpError(403, "This account is not active.");
      if (m.school_status !== "active") throw httpError(403, "Your school is not active. Please contact your school admin.");

      res.json({ success: true, token: signMemberToken(m), user: serializeMember(m) });
    }),
  };
}

/* ---------------------------------- realtime -------------------------------- */

const NS_KEY = "__ecwClassroomNamespace"; // on globalThis, so a double-loaded file still works

const rooms = {
  member: (id) => `member:${id}`,
  class: (id) => `class:${id}`,
  school: (id) => `school:${id}`,
};

function emit(room, event, payload) {
  const ns = globalThis[NS_KEY];
  if (ns) ns.to(room).emit(event, payload);
  else console.warn(`[classroom] emit("${event}") skipped: setupClassroomSocket(io) was never called.`);
}

// Tell every teacher who teaches this class (e.g. "a new student joined").
async function emitToTeachersOfClass(classId, event, payload) {
  const r = await pool.query("SELECT DISTINCT teacher_id FROM ecw_teacher_assignments WHERE class_id = $1", [classId]);
  for (const row of r.rows) emit(rooms.member(row.teacher_id), event, payload);
}

// Called after a student picks a class, so their open tabs start receiving it.
function moveStudentToClass(memberId, oldClassId, newClassId) {
  const ns = globalThis[NS_KEY];
  if (!ns) return;
  if (oldClassId) ns.in(rooms.member(memberId)).socketsLeave(rooms.class(oldClassId));
  if (newClassId) ns.in(rooms.member(memberId)).socketsJoin(rooms.class(newClassId));
}

// A school admin's own dashboard doesn't have an ecw_members row (it's the
// `schools` row itself), so it is authenticated differently from teacher /
// student sockets, but shares the same namespace and "school:<id>" room so
// one realtime channel covers every role.
async function schoolAdminFromToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch {
    throw httpError(401, "Your session expired. Please sign in again.");
  }
  if (payload.role !== "schoolAdmin" || !payload.schoolId) throw httpError(401, "Please sign in again.");
  const r = await pool.query("SELECT id, name, status FROM schools WHERE id = $1", [payload.schoolId]);
  if (r.rowCount === 0) throw httpError(401, "This school no longer exists.");
  if (r.rows[0].status !== "active") throw httpError(403, "This school is not active.");
  return { schoolId: r.rows[0].id, schoolName: r.rows[0].name, email: payload.email };
}

function setupClassroomSocket(io) {
  const ns = io.of("/classroom");
  globalThis[NS_KEY] = ns;

  ns.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      const payload = jwt.verify(token, getSecret());

      if (payload.role === "schoolAdmin") {
        socket.data.schoolAdmin = await schoolAdminFromToken(token);
        return next();
      }
      if (payload.role !== "teacher" && payload.role !== "student") throw new Error("bad role");
      socket.data.member = await memberFromToken(token, payload.role);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  ns.on("connection", (socket) => {
    if (socket.data.schoolAdmin) {
      const { schoolId, email } = socket.data.schoolAdmin;
      socket.join(rooms.school(schoolId));
      console.log(`[classroom] realtime connected: schoolAdmin ${email}`);
      socket.emit("ready", { role: "schoolAdmin" });
      return;
    }

    const m = socket.data.member;
    socket.join(rooms.member(m.id));
    socket.join(rooms.school(m.school_id));
    if (m.role === "student" && m.class_id) socket.join(rooms.class(m.class_id));
    console.log(`[classroom] realtime connected: ${m.role} ${m.email}`);
    socket.emit("ready", { role: m.role });
  });

  return ns;
}

module.exports = {
  httpError,
  sendError,
  wrap,
  ready,
  requireReady,
  requireMember,
  authHandlers,
  serializeMember,
  loadMember,
  rooms,
  emit,
  emitToTeachersOfClass,
  moveStudentToClass,
  setupClassroomSocket,
};