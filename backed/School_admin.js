/* ============================================================================
   School_admin.js   mounted at  /api/schooladmin

   This is the SCHOOL admin's own dashboard API - not the platform super admin
   (Superadmin.js) and not a teacher/student (classroom.js). A school admin
   signs in at POST /api/schools/login (see register.js) with the Google
   account the school registered with; that route hands back a JWT shaped
   like { role: "schoolAdmin", schoolId, email }. Every route below re-checks
   that token and scopes every query to req.school.id, so one school admin can
   never see another school's data.

   Realtime: the school admin dashboard connects to the SAME Socket.IO
   namespace teachers/students use ("/classroom", set up in classroom.js). It
   authenticates with its schoolAdmin JWT and only ever joins the
   "school:<id>" room, so it live-updates whenever:
     - a teacher or student registers under the school (classroom.js emits
       "member:registered")
     - a teacher creates a new class (teacher.js emits "class:created")
     - a student picks/changes their class (student.js emits "member:classChosen")
     - the school admin posts an announcement (this file emits "announcement:new")
   No page in this dashboard needs a manual refresh button.
   ============================================================================ */

const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const cls = require("./classroom");

const { httpError, wrap, rooms, emit, requireReady } = cls;
const router = express.Router();

router.use(requireReady);

/* --------------------------------- schema ------------------------------------
   Announcements are a school-admin-only concept, so this file owns the table
   instead of classroom.js. Same "create if missing, give up fast" pattern
   used everywhere else in this codebase.
-------------------------------------------------------------------------- */

const ready = (async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query("SET lock_timeout = '10s'");
    await client.query(`
      CREATE TABLE IF NOT EXISTS ecw_announcements (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        audience TEXT NOT NULL DEFAULT 'everyone' CHECK (audience IN ('everyone', 'teachers', 'students')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ecw_announcements_school_idx ON ecw_announcements (school_id, created_at DESC);
    `);
    console.log("[schooladmin] Tables are ready.");
  } finally {
    if (client) {
      try { await client.query("RESET lock_timeout"); } catch { /* ignore */ }
      client.release();
    }
  }
})();
ready.catch((err) => console.error("[schooladmin] Could not create tables:", err.message));

router.use((req, res, next) => {
  ready.then(() => next(), (err) => res.status(500).json({ success: false, message: `Announcements table is not ready: ${err.message}` }));
});

/* ---------------------------------- auth -------------------------------------
   Not classroom.js's requireMember - a school admin has no ecw_members row.
   The token comes from POST /api/schools/login and is signed with the same
   JWT_SECRET every other role uses (see Superadmin.js signToken / classroom.js
   signMemberToken), so we just verify it here with the same secret.
-------------------------------------------------------------------------- */

function getSecret() {
  if (!process.env.JWT_SECRET) throw httpError(500, "Server is missing JWT_SECRET in its .env file.");
  return process.env.JWT_SECRET;
}

async function requireSchoolAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw httpError(401, "Please sign in.");

    let payload;
    try {
      payload = jwt.verify(token, getSecret());
    } catch {
      throw httpError(401, "Your session expired. Please sign in again.");
    }
    if (payload.role !== "schoolAdmin" || !payload.schoolId) throw httpError(403, "Not allowed.");

    const r = await pool.query("SELECT * FROM schools WHERE id = $1", [payload.schoolId]);
    if (r.rowCount === 0) throw httpError(401, "This school no longer exists.");
    const school = r.rows[0];
    if (school.status !== "active") throw httpError(403, "This school is not active. Please contact support.");

    req.school = school;
    next();
  } catch (err) {
    res.status(err.status || 401).json({ success: false, message: err.message, error: err.message });
  }
}

router.use(requireSchoolAdmin);

/* --------------------------------- helpers ------------------------------------ */

function parseId(value, what = "id") {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, `Invalid ${what}.`);
  return id;
}

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

const serializeSchool = (s) => ({
  id: s.id,
  name: s.name,
  email: s.email,
  phone: s.phone,
  code: s.school_code,
  logoUrl: s.logo_url,
  createdAt: s.created_at,
});

const serializeMemberRow = (m) => ({
  id: m.id,
  fullName: m.full_name,
  email: m.email,
  status: m.status,
  classId: m.class_id || null,
  className: m.class_name || null,
  createdAt: m.created_at,
});

/* ------------------------------------ me -------------------------------------- */

router.get(
  "/me",
  wrap(async (req, res) => {
    const schoolId = req.school.id;
    const [teachers, students, classes, notes, quizzes] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_members WHERE role = 'teacher' AND school_id = $1", [schoolId]),
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_members WHERE role = 'student' AND school_id = $1", [schoolId]),
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_classes WHERE school_id = $1", [schoolId]),
      pool.query(
        "SELECT COUNT(*)::int AS n FROM ecw_notes n JOIN ecw_classes c ON c.id = n.class_id WHERE c.school_id = $1 AND n.status = 'published'",
        [schoolId]
      ),
      pool.query(
        "SELECT COUNT(*)::int AS n FROM ecw_quizzes z JOIN ecw_classes c ON c.id = z.class_id WHERE c.school_id = $1 AND z.status = 'published'",
        [schoolId]
      ),
    ]);

    res.json({
      success: true,
      school: serializeSchool(req.school),
      counts: {
        teachers: teachers.rows[0].n,
        students: students.rows[0].n,
        classes: classes.rows[0].n,
        publishedNotes: notes.rows[0].n,
        publishedQuizzes: quizzes.rows[0].n,
      },
    });
  })
);

/* --------------------------------- classes ------------------------------------- */

router.get(
  "/classes",
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT c.id, c.name, c.created_at,
         (SELECT COUNT(*) FROM ecw_members m WHERE m.role = 'student' AND m.class_id = c.id)::int AS student_count,
         (SELECT COUNT(DISTINCT teacher_id) FROM ecw_teacher_assignments a WHERE a.class_id = c.id)::int AS teacher_count
       FROM ecw_classes c WHERE c.school_id = $1 ORDER BY c.name`,
      [req.school.id]
    );
    res.json({
      success: true,
      classes: r.rows.map((c) => ({ id: c.id, name: c.name, createdAt: c.created_at, studentCount: c.student_count, teacherCount: c.teacher_count })),
    });
  })
);

router.post(
  "/classes",
  wrap(async (req, res) => {
    const name = clean(req.body && req.body.name, 60);
    if (!name) throw httpError(400, "Enter a class name.");
    const existing = await pool.query("SELECT id FROM ecw_classes WHERE school_id = $1 AND LOWER(name) = LOWER($2)", [req.school.id, name]);
    if (existing.rowCount > 0) throw httpError(409, "A class with this name already exists.");
    const ins = await pool.query("INSERT INTO ecw_classes (school_id, name) VALUES ($1, $2) RETURNING id, name, created_at", [req.school.id, name]);
    const created = ins.rows[0];
    emit(rooms.school(req.school.id), "class:created", { id: created.id, name: created.name });
    res.status(201).json({ success: true, class: { id: created.id, name: created.name, createdAt: created.created_at, studentCount: 0, teacherCount: 0 } });
  })
);

router.delete(
  "/classes/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "class");
    const r = await pool.query("DELETE FROM ecw_classes WHERE id = $1 AND school_id = $2 RETURNING id, name", [id, req.school.id]);
    if (r.rowCount === 0) throw httpError(404, "Class not found.");
    emit(rooms.school(req.school.id), "class:deleted", { id, name: r.rows[0].name });
    res.json({ success: true });
  })
);

/* --------------------------------- teachers ------------------------------------ */

router.get(
  "/teachers",
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT m.*, NULL::text AS class_name,
         (SELECT COUNT(*) FROM ecw_teacher_assignments a WHERE a.teacher_id = m.id)::int AS assignment_count
       FROM ecw_members m WHERE m.role = 'teacher' AND m.school_id = $1 ORDER BY m.full_name`,
      [req.school.id]
    );
    res.json({ success: true, teachers: r.rows.map((m) => ({ ...serializeMemberRow(m), assignmentCount: m.assignment_count })) });
  })
);

router.patch(
  "/teachers/:id/status",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "teacher");
    const status = req.body && req.body.status === "suspended" ? "suspended" : "active";
    const r = await pool.query(
      "UPDATE ecw_members SET status = $1 WHERE id = $2 AND role = 'teacher' AND school_id = $3 RETURNING *",
      [status, id, req.school.id]
    );
    if (r.rowCount === 0) throw httpError(404, "Teacher not found.");
    res.json({ success: true, teacher: serializeMemberRow(r.rows[0]) });
  })
);

router.delete(
  "/teachers/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "teacher");
    const r = await pool.query("DELETE FROM ecw_members WHERE id = $1 AND role = 'teacher' AND school_id = $2 RETURNING id", [id, req.school.id]);
    if (r.rowCount === 0) throw httpError(404, "Teacher not found.");
    res.json({ success: true });
  })
);

/* --------------------------------- students ------------------------------------ */

router.get(
  "/students",
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT m.*, c.name AS class_name,
         (SELECT COUNT(*) FROM ecw_quiz_attempts a WHERE a.student_id = m.id AND a.submitted_at IS NOT NULL)::int AS quizzes_done,
         (SELECT ROUND(AVG(a.score_percent)) FROM ecw_quiz_attempts a WHERE a.student_id = m.id AND a.submitted_at IS NOT NULL)::int AS average_score
       FROM ecw_members m LEFT JOIN ecw_classes c ON c.id = m.class_id
       WHERE m.role = 'student' AND m.school_id = $1 ORDER BY m.full_name`,
      [req.school.id]
    );
    res.json({
      success: true,
      students: r.rows.map((m) => ({ ...serializeMemberRow(m), quizzesDone: m.quizzes_done || 0, averageScore: m.average_score })),
    });
  })
);

router.patch(
  "/students/:id/status",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "student");
    const status = req.body && req.body.status === "suspended" ? "suspended" : "active";
    const r = await pool.query(
      "UPDATE ecw_members SET status = $1 WHERE id = $2 AND role = 'student' AND school_id = $3 RETURNING *",
      [status, id, req.school.id]
    );
    if (r.rowCount === 0) throw httpError(404, "Student not found.");
    res.json({ success: true, student: serializeMemberRow(r.rows[0]) });
  })
);

router.patch(
  "/students/:id/class",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "student");
    const classId = req.body && req.body.classId ? parseId(req.body.classId, "class") : null;

    const before = await pool.query("SELECT * FROM ecw_members WHERE id = $1 AND role = 'student' AND school_id = $2", [id, req.school.id]);
    if (before.rowCount === 0) throw httpError(404, "Student not found.");

    if (classId) {
      const c = await pool.query("SELECT id, name FROM ecw_classes WHERE id = $1 AND school_id = $2", [classId, req.school.id]);
      if (c.rowCount === 0) throw httpError(400, "That class does not belong to your school.");
    }

    const r = await pool.query(
      "UPDATE ecw_members SET class_id = $1 WHERE id = $2 RETURNING *",
      [classId, id]
    );
    const oldClassId = before.rows[0].class_id;
    cls.moveStudentToClass(id, oldClassId, classId);

    const full = await pool.query(
      "SELECT m.*, c.name AS class_name FROM ecw_members m LEFT JOIN ecw_classes c ON c.id = m.class_id WHERE m.id = $1",
      [id]
    );
    res.json({ success: true, student: serializeMemberRow(full.rows[0]) });
  })
);

router.delete(
  "/students/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "student");
    const r = await pool.query("DELETE FROM ecw_members WHERE id = $1 AND role = 'student' AND school_id = $2 RETURNING id", [id, req.school.id]);
    if (r.rowCount === 0) throw httpError(404, "Student not found.");
    res.json({ success: true });
  })
);

/* ------------------------------- announcements --------------------------------- */

const serializeAnnouncement = (a) => ({ id: a.id, title: a.title, body: a.body, audience: a.audience, createdAt: a.created_at });

router.get(
  "/announcements",
  wrap(async (req, res) => {
    const r = await pool.query("SELECT * FROM ecw_announcements WHERE school_id = $1 ORDER BY created_at DESC LIMIT 100", [req.school.id]);
    res.json({ success: true, announcements: r.rows.map(serializeAnnouncement) });
  })
);

router.post(
  "/announcements",
  wrap(async (req, res) => {
    const title = clean(req.body && req.body.title, 200);
    const body = clean(req.body && req.body.body, 4000);
    const audience = ["everyone", "teachers", "students"].includes(req.body && req.body.audience) ? req.body.audience : "everyone";
    if (!title || !body) throw httpError(400, "Give the announcement a title and a message.");

    const ins = await pool.query(
      "INSERT INTO ecw_announcements (school_id, title, body, audience) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.school.id, title, body, audience]
    );
    const announcement = serializeAnnouncement(ins.rows[0]);
    emit(rooms.school(req.school.id), "announcement:new", announcement);
    res.status(201).json({ success: true, announcement });
  })
);

router.delete(
  "/announcements/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "announcement");
    const r = await pool.query("DELETE FROM ecw_announcements WHERE id = $1 AND school_id = $2 RETURNING id", [id, req.school.id]);
    if (r.rowCount === 0) throw httpError(404, "Announcement not found.");
    emit(rooms.school(req.school.id), "announcement:deleted", { id });
    res.json({ success: true });
  })
);

module.exports = router;