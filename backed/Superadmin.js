/* ============================================================================
   School_admin.js   mounted at  /api/schooladmin

   The SCHOOL admin's own dashboard API (not the super admin, not a teacher or
   student). A school admin signs in at POST /api/schools/login (register.js);
   that hands back a JWT shaped like { role: "schoolAdmin", schoolId, email }.
   Every route re-checks that token and scopes every query to req.school.id.

   Approval flow
   -------------
   Teachers and students sign up through classroom.js, which saves them with
   status = 'pending'. They cannot sign in until this file approves them:
     GET  /approvals                 pending sign-ups for this school
     POST /approvals/:id/approve     -> status 'active' (+ class / subjects)
     POST /approvals/:id/reject      -> deletes the pending request
   /teachers and /students only ever list NON-pending people.

   Realtime: the dashboard joins the "school:<id>" room on the "/classroom"
   Socket.IO namespace and is told about member:registered, member:approved,
   member:rejected, member:updated, member:removed, member:classChosen,
   class:created, class:deleted and announcement:new / :deleted.
   ============================================================================ */

const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const cls = require("./classroom");

const { httpError, wrap, rooms, emit, requireReady } = cls;
const router = express.Router();

router.use(requireReady);

/* --------------------------------- schema ------------------------------------ */

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

/* ---------------------------------- auth ------------------------------------- */

function getSecret() {
  if (!process.env.JWT_SECRET) throw httpError(500, "Server is missing JWT_SECRET in its .env file.");
  return process.env.JWT_SECRET;
}

function readCookies(req) {
  return String(req.headers.cookie || "").split(";").reduce((all, item) => {
    const at = item.indexOf("=");
    if (at > -1) {
      const name = item.slice(0, at).trim();
      const value = item.slice(at + 1).trim();
      try { all[name] = decodeURIComponent(value); } catch { all[name] = value; }
    }
    return all;
  }, {});
}

async function requireSchoolAdmin(req, res, next) {
  try {
    const header = String(req.headers.authorization || "").trim();
    const cookies = readCookies(req);
    const token = /^Bearer\s+/i.test(header)
      ? header.replace(/^Bearer\s+/i, "").trim()
      : (cookies.schoolAdminToken || "");
    if (!token) throw httpError(401, "Please sign in.");

    // Expired tokens are rejected (the old ignoreExpiration made a 7-day token
    // valid forever). The dashboard sends the admin back to sign in on a 401.
    let payload;
    try {
      payload = jwt.verify(token, getSecret());
    } catch (err) {
      if (err.status) throw err;
      throw httpError(401, err.name === "TokenExpiredError"
        ? "Your session expired. Please sign in again."
        : "Your session is invalid. Please sign in again.");
    }

    const role = String(payload.role || "").replace(/[_-]/g, "").toLowerCase();
    const schoolId = payload.schoolId || payload.school_id;
    if (role !== "schooladmin" || !schoolId) throw httpError(403, "Not allowed.");

    const r = await pool.query("SELECT * FROM schools WHERE id = $1", [schoolId]);
    if (r.rowCount === 0) throw httpError(401, "This school no longer exists.");
    const school = r.rows[0];
    if (school.status !== "active") throw httpError(403, "This school is not active. Please contact support.");

    req.school = school;
    res.set("Cache-Control", "no-store");
    next();
  } catch (err) {
    res.status(err.status || 401).json({ success: false, message: err.message, error: err.message });
  }
}

router.use(requireSchoolAdmin);

/* --------------------------------- helpers ----------------------------------- */

function parseId(value, what = "id") {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, `Invalid ${what}.`);
  return id;
}

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

const serializeSchool = (s) => ({
  id: s.id, name: s.name, email: s.email, phone: s.phone,
  code: s.school_code, logoUrl: s.logo_url, createdAt: s.created_at,
});

const serializeMemberRow = (m) => ({
  id: m.id,
  fullName: m.full_name,
  email: m.email,
  imageUrl: m.image_url || m.avatar_url || m.photo_url || m.picture || null,
  avatarUrl: m.avatar_url || m.image_url || m.photo_url || m.picture || null,
  status: m.status,
  classId: m.class_id || null,
  className: m.class_name || null,
  createdAt: m.created_at,
});

// A class must belong to THIS school (works with the pool or a transaction client).
async function assertClass(db, classId, schoolId) {
  const c = await db.query("SELECT id FROM ecw_classes WHERE id = $1 AND school_id = $2", [classId, schoolId]);
  if (c.rowCount === 0) throw httpError(400, "That class does not belong to your school.");
}

const MEMBER_WITH_CLASS = `
  SELECT m.*, c.name AS class_name
  FROM ecw_members m LEFT JOIN ecw_classes c ON c.id = m.class_id`;

/* ------------------------------------ me ------------------------------------- */

router.get(
  "/me",
  wrap(async (req, res) => {
    const schoolId = req.school.id;
    const [teachers, students, pending, classes, notes, quizzes] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_members WHERE role = 'teacher' AND school_id = $1 AND status <> 'pending'", [schoolId]),
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_members WHERE role = 'student' AND school_id = $1 AND status <> 'pending'", [schoolId]),
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_members WHERE school_id = $1 AND status = 'pending'", [schoolId]),
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_classes WHERE school_id = $1", [schoolId]),
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_notes n JOIN ecw_classes c ON c.id = n.class_id WHERE c.school_id = $1 AND n.status = 'published'", [schoolId]),
      pool.query("SELECT COUNT(*)::int AS n FROM ecw_quizzes z JOIN ecw_classes c ON c.id = z.class_id WHERE c.school_id = $1 AND z.status = 'published'", [schoolId]),
    ]);
    res.json({
      success: true,
      school: serializeSchool(req.school),
      counts: {
        teachers: teachers.rows[0].n,
        students: students.rows[0].n,
        pendingApprovals: pending.rows[0].n,
        classes: classes.rows[0].n,
        publishedNotes: notes.rows[0].n,
        publishedQuizzes: quizzes.rows[0].n,
      },
    });
  })
);

/* --------------------------------- classes ----------------------------------- */

router.get(
  "/classes",
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT c.id, c.name, c.created_at,
         (SELECT COUNT(*) FROM ecw_members m WHERE m.role = 'student' AND m.class_id = c.id AND m.status <> 'pending')::int AS student_count,
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

/* -------------------------------- approvals ---------------------------------- */

router.get(
  "/approvals",
  wrap(async (req, res) => {
    const r = await pool.query(
      `${MEMBER_WITH_CLASS}
       WHERE m.school_id = $1 AND m.role IN ('teacher', 'student') AND m.status = 'pending'
       ORDER BY m.created_at`,
      [req.school.id]
    );
    res.json({ success: true, approvals: r.rows.map((m) => ({ ...serializeMemberRow(m), role: m.role })) });
  })
);

router.post(
  "/approvals/:id/approve",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "request");
    const found = await pool.query(
      "SELECT * FROM ecw_members WHERE id = $1 AND school_id = $2 AND status = 'pending'",
      [id, req.school.id]
    );
    if (found.rowCount === 0) throw httpError(404, "Request not found or already handled.");
    const member = found.rows[0];
    let newClassId = null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (member.role === "student") {
        // Class is optional: a student without one picks it themselves after signing in.
        if (req.body && req.body.classId) {
          newClassId = parseId(req.body.classId, "class");
          await assertClass(client, newClassId, req.school.id);
        }
        await client.query("UPDATE ecw_members SET status = 'active', class_id = $1 WHERE id = $2", [newClassId, id]);
      } else {
        // Subjects are optional too: teachers can add their own in Settings.
        const list = Array.isArray(req.body && req.body.assignments) ? req.body.assignments : [];
        for (const item of list) {
          const classId = parseId(item && item.classId, "class");
          const subject = clean(item && item.subject, 80);
          if (!subject) throw httpError(400, "Every class needs a subject.");
          await assertClass(client, classId, req.school.id);
          await client.query(
            "INSERT INTO ecw_teacher_assignments (teacher_id, class_id, subject) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            [id, classId, subject]
          );
        }
        await client.query("UPDATE ecw_members SET status = 'active' WHERE id = $1", [id]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    if (newClassId) cls.moveStudentToClass(id, null, newClassId);
    emit(rooms.school(req.school.id), "member:approved", { id, role: member.role, fullName: member.full_name });
    res.json({ success: true });
  })
);

router.post(
  "/approvals/:id/reject",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "request");
    const r = await pool.query(
      "DELETE FROM ecw_members WHERE id = $1 AND school_id = $2 AND status = 'pending' RETURNING role, full_name",
      [id, req.school.id]
    );
    if (r.rowCount === 0) throw httpError(404, "Request not found or already handled.");
    emit(rooms.school(req.school.id), "member:rejected", { id, role: r.rows[0].role, fullName: r.rows[0].full_name });
    res.json({ success: true });
  })
);

/* --------------------------------- teachers ---------------------------------- */

router.get(
  "/teachers",
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT m.*, NULL::text AS class_name FROM ecw_members m
       WHERE m.role = 'teacher' AND m.school_id = $1 AND m.status <> 'pending'
       ORDER BY m.full_name`,
      [req.school.id]
    );
    const ids = r.rows.map((m) => m.id);
    const a = ids.length
      ? await pool.query(
          `SELECT a.id, a.teacher_id, a.class_id, a.subject, c.name AS class_name
           FROM ecw_teacher_assignments a JOIN ecw_classes c ON c.id = a.class_id
           WHERE a.teacher_id = ANY($1::int[]) ORDER BY c.name, a.subject`,
          [ids]
        )
      : { rows: [] };
    res.json({
      success: true,
      teachers: r.rows.map((m) => ({
        ...serializeMemberRow(m),
        assignments: a.rows
          .filter((x) => x.teacher_id === m.id)
          .map((x) => ({ id: x.id, classId: x.class_id, className: x.class_name, subject: x.subject })),
      })),
    });
  })
);

router.patch(
  "/teachers/:id/status",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "teacher");
    const status = req.body && req.body.status === "suspended" ? "suspended" : "active";
    const r = await pool.query(
      "UPDATE ecw_members SET status = $1 WHERE id = $2 AND role = 'teacher' AND school_id = $3 AND status <> 'pending' RETURNING *",
      [status, id, req.school.id]
    );
    if (r.rowCount === 0) throw httpError(404, "Teacher not found.");
    emit(rooms.school(req.school.id), "member:updated", { id, role: "teacher", status });
    res.json({ success: true, teacher: serializeMemberRow(r.rows[0]) });
  })
);

router.post(
  "/teachers/:id/assignments",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "teacher");
    const classId = parseId(req.body && req.body.classId, "class");
    const subject = clean(req.body && req.body.subject, 80);
    if (!subject) throw httpError(400, "Enter a subject.");
    const t = await pool.query(
      "SELECT id FROM ecw_members WHERE id = $1 AND role = 'teacher' AND school_id = $2 AND status <> 'pending'",
      [id, req.school.id]
    );
    if (t.rowCount === 0) throw httpError(404, "Teacher not found.");
    await assertClass(pool, classId, req.school.id);
    await pool.query(
      "INSERT INTO ecw_teacher_assignments (teacher_id, class_id, subject) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [id, classId, subject]
    );
    emit(rooms.member(id), "assignments:changed", { teacherId: id });
    emit(rooms.school(req.school.id), "member:updated", { id, role: "teacher" });
    res.json({ success: true });
  })
);

router.delete(
  "/teachers/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "teacher");
    const r = await pool.query("DELETE FROM ecw_members WHERE id = $1 AND role = 'teacher' AND school_id = $2 RETURNING id", [id, req.school.id]);
    if (r.rowCount === 0) throw httpError(404, "Teacher not found.");
    emit(rooms.school(req.school.id), "member:removed", { id, role: "teacher" });
    res.json({ success: true });
  })
);

/* --------------------------------- students ---------------------------------- */

router.get(
  "/students",
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT m.*, c.name AS class_name,
         (SELECT COUNT(*) FROM ecw_quiz_attempts a WHERE a.student_id = m.id AND a.submitted_at IS NOT NULL)::int AS quizzes_done,
         (SELECT ROUND(AVG(a.score_percent)) FROM ecw_quiz_attempts a WHERE a.student_id = m.id AND a.submitted_at IS NOT NULL)::int AS average_score
       FROM ecw_members m LEFT JOIN ecw_classes c ON c.id = m.class_id
       WHERE m.role = 'student' AND m.school_id = $1 AND m.status <> 'pending'
       ORDER BY m.full_name`,
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
      "UPDATE ecw_members SET status = $1 WHERE id = $2 AND role = 'student' AND school_id = $3 AND status <> 'pending' RETURNING *",
      [status, id, req.school.id]
    );
    if (r.rowCount === 0) throw httpError(404, "Student not found.");
    emit(rooms.school(req.school.id), "member:updated", { id, role: "student", status });
    res.json({ success: true, student: serializeMemberRow(r.rows[0]) });
  })
);

router.patch(
  "/students/:id/class",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "student");
    const classId = req.body && req.body.classId ? parseId(req.body.classId, "class") : null;

    const before = await pool.query(
      "SELECT * FROM ecw_members WHERE id = $1 AND role = 'student' AND school_id = $2 AND status <> 'pending'",
      [id, req.school.id]
    );
    if (before.rowCount === 0) throw httpError(404, "Student not found.");
    if (classId) await assertClass(pool, classId, req.school.id);

    await pool.query("UPDATE ecw_members SET class_id = $1 WHERE id = $2", [classId, id]);
    cls.moveStudentToClass(id, before.rows[0].class_id, classId);

    const full = await pool.query(`${MEMBER_WITH_CLASS} WHERE m.id = $1`, [id]);
    emit(rooms.school(req.school.id), "member:updated", { id, role: "student" });
    res.json({ success: true, student: serializeMemberRow(full.rows[0]) });
  })
);

router.post(
  "/promote-students",
  wrap(async (req, res) => {
    const ids = (Array.isArray(req.body && req.body.studentIds) ? req.body.studentIds : []).map((v) => parseId(v, "student"));
    const toClassId = parseId(req.body && req.body.toClassId, "class");
    if (ids.length === 0) throw httpError(400, "Select at least one student.");
    await assertClass(pool, toClassId, req.school.id);

    const before = await pool.query(
      "SELECT id, class_id FROM ecw_members WHERE id = ANY($1::int[]) AND role = 'student' AND school_id = $2 AND status <> 'pending'",
      [ids, req.school.id]
    );
    if (before.rowCount === 0) throw httpError(404, "None of those students were found.");
    await pool.query(
      "UPDATE ecw_members SET class_id = $1 WHERE id = ANY($2::int[]) AND school_id = $3",
      [toClassId, before.rows.map((s) => s.id), req.school.id]
    );
    before.rows.forEach((s) => cls.moveStudentToClass(s.id, s.class_id, toClassId));
    emit(rooms.school(req.school.id), "member:updated", { role: "student", promoted: before.rowCount });
    res.json({ success: true, moved: before.rowCount });
  })
);

router.delete(
  "/students/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id, "student");
    const r = await pool.query("DELETE FROM ecw_members WHERE id = $1 AND role = 'student' AND school_id = $2 RETURNING id", [id, req.school.id]);
    if (r.rowCount === 0) throw httpError(404, "Student not found.");
    emit(rooms.school(req.school.id), "member:removed", { id, role: "student" });
    res.json({ success: true });
  })
);

/* ------------------------------- announcements ------------------------------- */

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