/* ============================================================================
   student.js   mounted at  /api/student

   Mirrors teacher.js's structure and shares classroom.js for auth/realtime.
   Matches the API contract that student.jsx already expects:
     GET  /me
     GET  /classes                (only useful before a class is chosen)
     POST /class                  { classId }
     GET  /notes
     GET  /quizzes
     POST /quizzes/:id/start
     POST /quizzes/:id/answer     { questionId, optionId }
     POST /quizzes/:id/submit
     POST /quizzes/:id/penalty    { seconds }   <- NEW: reports time spent away
     POST /quizzes/:id/returned                  <- NEW: tells the teacher the
                                                     student came back
   ============================================================================ */

const express = require("express");
const pool = require("./db");
const cls = require("./classroom");

const { httpError, wrap, rooms, emit, emitToTeachersOfClass } = cls;
const router = express.Router();

router.use(cls.requireReady);

const auth = cls.authHandlers("student");
router.post("/register", auth.register);
router.post("/login", auth.login);

router.use(cls.requireMember("student"));

/* ------------------------------ database safety ------------------------------ */
// ecw_quiz_reopens (backs the "give this one student another chance"
// feature) now lives in classroom.js's central schema (see the FIX comment
// there) instead of being created here -- this used to race with teacher.js's
// identical copy of this block at every startup, producing a harmless but
// alarming "duplicate key value violates unique constraint
// pg_type_typname_nsp_index" error. router.use(cls.requireReady) above
// already guarantees the table exists before any route below can run.

/* --------------------------------- helpers ---------------------------------- */

function parseId(value, what = "id") {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, `Invalid ${what}.`);
  return id;
}

async function requireClass(req) {
  if (!req.member.class_id) throw httpError(400, "Choose your class first.");
  return req.member.class_id;
}

/* ----------------------------------- me / classes ---------------------------- */

router.get(
  "/me",
  wrap(async (req, res) => {
    const m = req.member;
    res.json({
      success: true,
      student: {
        id: m.id,
        full_name: m.full_name,
        fullName: m.full_name,
        email: m.email,
        schoolName: m.school_name,
        classId: m.class_id || null,
        className: m.class_name || null,
      },
    });
  })
);

// Only useful while the student has no class yet - lets them pick one.
router.get(
  "/classes",
  wrap(async (req, res) => {
    const r = await pool.query("SELECT id, name FROM ecw_classes WHERE school_id = $1 ORDER BY name", [req.member.school_id]);
    res.json({ success: true, classes: r.rows });
  })
);

router.post(
  "/class",
  wrap(async (req, res) => {
    const m = req.member;
    const classId = parseId(req.body && req.body.classId, "class");
    const c = await pool.query("SELECT id, name FROM ecw_classes WHERE id = $1 AND school_id = $2", [classId, m.school_id]);
    if (c.rowCount === 0) throw httpError(400, "That class does not belong to your school.");

    const oldClassId = m.class_id;
    await pool.query("UPDATE ecw_members SET class_id = $1 WHERE id = $2", [classId, m.id]);
    cls.moveStudentToClass(m.id, oldClassId, classId);

    const info = { id: m.id, fullName: m.full_name, email: m.email, classId, className: c.rows[0].name };
    try {
      await emitToTeachersOfClass(classId, "student:joined", info);
      emit(rooms.school(m.school_id), "member:classChosen", info);
    } catch { /* realtime is best-effort */ }

    res.json({ success: true, student: { id: m.id, classId, className: c.rows[0].name } });
  })
);

/* ----------------------------------- notes ------------------------------------ */

router.get(
  "/notes",
  wrap(async (req, res) => {
    const classId = await requireClass(req);
    const r = await pool.query(
      `SELECT n.*, t.full_name AS author_name
       FROM ecw_notes n JOIN ecw_members t ON t.id = n.teacher_id
       WHERE n.class_id = $1 AND n.status = 'published'
       ORDER BY n.updated_at DESC`,
      [classId]
    );
    res.json({
      success: true,
      notes: r.rows.map((n) => ({
        id: n.id,
        subject: n.subject,
        title: n.title,
        content: n.content,
        fileUrl: n.file_url || "",
        fileType: n.file_type || "",
        fileName: n.file_name || "",
        authorName: n.author_name,
        createdAt: n.created_at,
        updatedAt: n.updated_at,
      })),
    });
  })
);

/* ---------------------------------- quizzes ------------------------------------
   A quiz's status, from the student's point of view:
     upcoming    - not started, has a future startsAt
     available   - not started, can be started now
     in_progress - an attempt exists but has not been submitted
     completed   - the attempt was submitted
     closed      - never attempted and the window has passed
-------------------------------------------------------------------------- */

function computeStatus(quiz, attempt) {
  if (attempt && attempt.submitted_at) return "completed";
  if (attempt) return "in_progress";
  const now = Date.now();
  if (quiz.starts_at && now < new Date(quiz.starts_at).getTime()) return "upcoming";
  if (quiz.ends_at && now > new Date(quiz.ends_at).getTime()) return "closed";
  return "available";
}

router.get(
  "/quizzes",
  wrap(async (req, res) => {
    const classId = await requireClass(req);
    const m = req.member;

    const quizzes = await pool.query(
      `SELECT z.*, (SELECT COUNT(*) FROM ecw_quiz_questions q WHERE q.quiz_id = z.id)::int AS question_count
       FROM ecw_quizzes z WHERE z.class_id = $1 AND z.status = 'published' ORDER BY z.created_at DESC`,
      [classId]
    );
    if (quizzes.rowCount === 0) return res.json({ success: true, quizzes: [] });

    const ids = quizzes.rows.map((r) => r.id);
    const attempts = await pool.query(
      "SELECT * FROM ecw_quiz_attempts WHERE quiz_id = ANY($1::int[]) AND student_id = $2",
      [ids, m.id]
    );
    const attemptByQuiz = new Map(attempts.rows.map((a) => [a.quiz_id, a]));

    // A student whose teacher granted them a reopen should see the quiz as
    // available again even though the class-wide window has closed.
    const reopens = await pool.query(
      "SELECT quiz_id, deadline_at FROM ecw_quiz_reopens WHERE quiz_id = ANY($1::int[]) AND student_id = $2 AND deadline_at > NOW()",
      [ids, m.id]
    );
    const reopenByQuiz = new Map(reopens.rows.map((r) => [r.quiz_id, r.deadline_at]));

    res.json({
      success: true,
      quizzes: quizzes.rows.map((z) => {
        const attempt = attemptByQuiz.get(z.id) || null;
        let status = computeStatus(z, attempt);
        if (status === "closed" && reopenByQuiz.has(z.id)) status = "available";
        return {
          id: z.id,
          title: z.title,
          subject: z.subject,
          questionCount: z.question_count,
          timeLimitMinutes: z.time_limit_minutes,
          startsAt: z.starts_at,
          endsAt: z.ends_at,
          status,
          reopened: status === "available" && reopenByQuiz.has(z.id),
          attempt: attempt
            ? {
                deadlineAt: attempt.deadline_at,
                penaltyMarks: attempt.penalty_marks,
                finalScore: attempt.final_score,
                scorePercent: attempt.score_percent,
                completedAt: attempt.submitted_at,
              }
            : null,
        };
      }),
    });
  })
);

async function getPublishedQuiz(classId, quizId) {
  const r = await pool.query("SELECT * FROM ecw_quizzes WHERE id = $1 AND class_id = $2 AND status = 'published'", [quizId, classId]);
  if (r.rowCount === 0) throw httpError(404, "Quiz not found.");
  return r.rows[0];
}

async function getQuestionsWithOptions(quizId, revealAnswers) {
  const qs = await pool.query("SELECT * FROM ecw_quiz_questions WHERE quiz_id = $1 ORDER BY position, id", [quizId]);
  const qIds = qs.rows.map((q) => q.id);
  const os = qIds.length
    ? await pool.query("SELECT * FROM ecw_quiz_options WHERE question_id = ANY($1::int[]) ORDER BY position, id", [qIds])
    : { rows: [] };
  const byQuestion = new Map();
  for (const o of os.rows) {
    if (!byQuestion.has(o.question_id)) byQuestion.set(o.question_id, []);
    byQuestion.get(o.question_id).push({ id: o.id, optionText: o.option_text, isCorrect: revealAnswers ? o.is_correct : undefined });
  }
  // FIX: `SELECT *` already pulls `marks` out of the row (see the migration
  // in classroom.js), but it was being dropped right here instead of passed
  // on to the student -- so there was no way to show "worth N marks" while
  // taking or reviewing a quiz, and no way to weight scoring by it either
  // (see the /submit route below).
  return qs.rows.map((q) => ({ id: q.id, question: q.question, marks: q.marks, options: byQuestion.get(q.id) || [] }));
}

router.post(
  "/quizzes/:id/start",
  wrap(async (req, res) => {
    const classId = await requireClass(req);
    const m = req.member;
    const quizId = parseId(req.params.id, "quiz");
    const quiz = await getPublishedQuiz(classId, quizId);

    const now = Date.now();
    if (quiz.starts_at && now < new Date(quiz.starts_at).getTime()) throw httpError(400, "This quiz has not opened yet.");

    let attempt;
    let isFreshAttempt = false;
    const existing = await pool.query("SELECT * FROM ecw_quiz_attempts WHERE quiz_id = $1 AND student_id = $2", [quizId, m.id]);
    if (existing.rowCount > 0) {
      attempt = existing.rows[0];
      if (attempt.submitted_at) throw httpError(409, "You have already submitted this quiz.");
    } else {
      let reopenDeadline = null;
      if (quiz.ends_at && now > new Date(quiz.ends_at).getTime()) {
        // FIX (new feature): the class-wide window is closed. Only let this
        // student in if their teacher specifically granted them a reopen
        // (see POST /api/teacher/quizzes/:id/students/:studentId/reopen in
        // teacher.js), and only while that grant is still valid.
        const reopen = await pool.query(
          "SELECT deadline_at FROM ecw_quiz_reopens WHERE quiz_id = $1 AND student_id = $2 AND deadline_at > NOW()",
          [quizId, m.id]
        );
        if (reopen.rowCount === 0) throw httpError(400, "This quiz has closed.");
        reopenDeadline = reopen.rows[0].deadline_at;
      }
      let deadline = reopenDeadline || quiz.ends_at || null;
      if (quiz.time_limit_minutes) {
        const byTimeLimit = new Date(now + quiz.time_limit_minutes * 60000).toISOString();
        deadline = deadline ? (new Date(byTimeLimit) < new Date(deadline) ? byTimeLimit : deadline) : byTimeLimit;
      }
      const ins = await pool.query(
        "INSERT INTO ecw_quiz_attempts (quiz_id, student_id, deadline_at) VALUES ($1, $2, $3) RETURNING *",
        [quizId, m.id, deadline]
      );
      attempt = ins.rows[0];
      isFreshAttempt = true;
    }

    const questions = await getQuestionsWithOptions(quizId, false);
    const savedAnswers = await pool.query("SELECT question_id, option_id FROM ecw_quiz_answers WHERE attempt_id = $1", [attempt.id]);

    // Let the teacher watch, live, as students actually begin the quiz.
    if (isFreshAttempt) {
      try {
        emit(rooms.member(quiz.teacher_id), "quiz:studentStarted", {
          quizId, quizTitle: quiz.title, studentId: m.id, studentName: m.full_name,
        });
      } catch { /* realtime is best-effort */ }
    }

    res.json({
      success: true,
      quiz: { id: quiz.id, title: quiz.title, questions },
      attempt: { id: attempt.id, deadlineAt: attempt.deadline_at, penaltyMarks: attempt.penalty_marks },
      answers: savedAnswers.rows.map((a) => ({ questionId: a.question_id, optionId: a.option_id })),
    });
  })
);

router.post(
  "/quizzes/:id/answer",
  wrap(async (req, res) => {
    const m = req.member;
    const quizId = parseId(req.params.id, "quiz");
    const questionId = parseId(req.body && req.body.questionId, "question");
    const optionId = parseId(req.body && req.body.optionId, "option");

    const attemptR = await pool.query("SELECT * FROM ecw_quiz_attempts WHERE quiz_id = $1 AND student_id = $2", [quizId, m.id]);
    if (attemptR.rowCount === 0) throw httpError(400, "Start the quiz before answering.");
    const attempt = attemptR.rows[0];
    if (attempt.submitted_at) throw httpError(409, "This quiz has already been submitted.");
    if (attempt.deadline_at && Date.now() > new Date(attempt.deadline_at).getTime()) throw httpError(400, "Time is up for this quiz.");

    const q = await pool.query("SELECT id FROM ecw_quiz_questions WHERE id = $1 AND quiz_id = $2", [questionId, quizId]);
    if (q.rowCount === 0) throw httpError(400, "That question does not belong to this quiz.");
    const o = await pool.query("SELECT id FROM ecw_quiz_options WHERE id = $1 AND question_id = $2", [optionId, questionId]);
    if (o.rowCount === 0) throw httpError(400, "That option does not belong to this question.");

    await pool.query(
      `INSERT INTO ecw_quiz_answers (attempt_id, question_id, option_id) VALUES ($1, $2, $3)
       ON CONFLICT (attempt_id, question_id) DO UPDATE SET option_id = EXCLUDED.option_id`,
      [attempt.id, questionId, optionId]
    );
    res.json({ success: true });
  })
);

// FIX (new feature): the client reports how many seconds the student spent
// away from the quiz tab (it pings this once per second while the tab is
// hidden). Each report adds that many penalty marks to their attempt and
// tells the teacher live, so the "leaving costs a mark a second, and the
// teacher can see it happening" behaviour actually exists.
router.post(
  "/quizzes/:id/penalty",
  wrap(async (req, res) => {
    const m = req.member;
    const quizId = parseId(req.params.id, "quiz");
    const seconds = Math.max(1, Math.min(60, Number.parseInt(req.body && req.body.seconds, 10) || 1));

    const quizR = await pool.query("SELECT teacher_id, title FROM ecw_quizzes WHERE id = $1", [quizId]);
    if (quizR.rowCount === 0) throw httpError(404, "Quiz not found.");
    const quiz = quizR.rows[0];

    const attemptR = await pool.query("SELECT * FROM ecw_quiz_attempts WHERE quiz_id = $1 AND student_id = $2", [quizId, m.id]);
    if (attemptR.rowCount === 0) throw httpError(400, "Start the quiz first.");
    const attempt = attemptR.rows[0];
    if (attempt.submitted_at) return res.json({ success: true, penaltyMarks: attempt.penalty_marks });

    const upd = await pool.query(
      "UPDATE ecw_quiz_attempts SET penalty_marks = penalty_marks + $1 WHERE id = $2 RETURNING penalty_marks",
      [seconds, attempt.id]
    );
    const penaltyMarks = upd.rows[0].penalty_marks;

    try {
      emit(rooms.member(quiz.teacher_id), "quiz:studentAway", {
        quizId, quizTitle: quiz.title, studentId: m.id, studentName: m.full_name, penaltyMarks, secondsAway: seconds,
      });
    } catch { /* realtime is best-effort */ }

    res.json({ success: true, penaltyMarks });
  })
);

// FIX (new feature): tells the teacher the student came back to the quiz tab.
router.post(
  "/quizzes/:id/returned",
  wrap(async (req, res) => {
    const m = req.member;
    const quizId = parseId(req.params.id, "quiz");
    const quizR = await pool.query("SELECT teacher_id, title FROM ecw_quizzes WHERE id = $1", [quizId]);
    if (quizR.rowCount === 0) return res.json({ success: true });
    const quiz = quizR.rows[0];
    try {
      emit(rooms.member(quiz.teacher_id), "quiz:studentReturned", {
        quizId, quizTitle: quiz.title, studentId: m.id, studentName: m.full_name,
      });
    } catch { /* realtime is best-effort */ }
    res.json({ success: true });
  })
);

// FIX (new): the "Review" button on a completed quiz used to call
// POST /quizzes/:id/start again, which this router correctly rejects for an
// already-submitted attempt ("You have already submitted this quiz.") — so
// review never actually worked; it just showed that error and closed. This
// is the missing read-only endpoint: once an attempt is submitted, the
// student can always see each question, what they picked, and the correct
// answer (getQuestionsWithOptions's revealAnswers flag, already used
// elsewhere, is exactly what makes this safe to expose only now).
router.get(
  "/quizzes/:id/review",
  wrap(async (req, res) => {
    const classId = await requireClass(req);
    const m = req.member;
    const quizId = parseId(req.params.id, "quiz");

    const quizR = await pool.query("SELECT id, title FROM ecw_quizzes WHERE id = $1 AND class_id = $2", [quizId, classId]);
    if (quizR.rowCount === 0) throw httpError(404, "Quiz not found.");
    const quiz = quizR.rows[0];

    const attemptR = await pool.query("SELECT * FROM ecw_quiz_attempts WHERE quiz_id = $1 AND student_id = $2", [quizId, m.id]);
    if (attemptR.rowCount === 0) throw httpError(400, "You have not taken this quiz yet.");
    const attempt = attemptR.rows[0];
    if (!attempt.submitted_at) throw httpError(400, "Submit the quiz before reviewing it.");

    const questions = await getQuestionsWithOptions(quizId, true);
    const answers = await pool.query("SELECT question_id, option_id FROM ecw_quiz_answers WHERE attempt_id = $1", [attempt.id]);
    const answerByQuestion = new Map(answers.rows.map((a) => [a.question_id, a.option_id]));

    res.json({
      success: true,
      quiz: { id: quiz.id, title: quiz.title },
      result: {
        rawScore: attempt.raw_score,
        penaltyMarks: attempt.penalty_marks,
        finalScore: attempt.final_score,
        total: attempt.total,
        scorePercent: attempt.score_percent,
        completedAt: attempt.submitted_at,
      },
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        marks: q.marks,
        selectedOptionId: answerByQuestion.get(q.id) || null,
        options: q.options,
      })),
    });
  })
);

router.post(
  "/quizzes/:id/submit",
  wrap(async (req, res) => {
    const m = req.member;
    const quizId = parseId(req.params.id, "quiz");

    const quizR = await pool.query("SELECT * FROM ecw_quizzes WHERE id = $1", [quizId]);
    if (quizR.rowCount === 0) throw httpError(404, "Quiz not found.");
    const quiz = quizR.rows[0];

    const attemptR = await pool.query("SELECT * FROM ecw_quiz_attempts WHERE quiz_id = $1 AND student_id = $2", [quizId, m.id]);
    if (attemptR.rowCount === 0) throw httpError(400, "Start the quiz before submitting.");
    const attempt = attemptR.rows[0];
    if (attempt.submitted_at) throw httpError(409, "This quiz has already been submitted.");

    // FIX: this used to COUNT(*) questions/correct-answers, which is the
    // same as treating every question as worth exactly 1 mark -- the
    // `marks` column a teacher can set per question (see writeQuestions in
    // teacher.js) was never actually consulted, so weighting a hard
    // question higher had no effect on the score. SUM(marks) instead of
    // COUNT(*) gives the same numbers as before for any quiz that never
    // touched marks (they all default to 1), and weighted numbers for one
    // that does.
    const totalR = await pool.query("SELECT COALESCE(SUM(marks), 0)::int AS n FROM ecw_quiz_questions WHERE quiz_id = $1", [quizId]);
    const total = totalR.rows[0].n;

    const correctR = await pool.query(
      `SELECT COALESCE(SUM(q.marks), 0)::int AS n FROM ecw_quiz_answers a
       JOIN ecw_quiz_options o ON o.id = a.option_id
       JOIN ecw_quiz_questions q ON q.id = a.question_id
       WHERE a.attempt_id = $1 AND o.is_correct`,
      [attempt.id]
    );
    const rawScore = correctR.rows[0].n;
    const finalScore = Math.max(0, rawScore - attempt.penalty_marks);
    const scorePercent = total > 0 ? Math.round((finalScore / total) * 100) : 0;

    const upd = await pool.query(
      `UPDATE ecw_quiz_attempts SET submitted_at = NOW(), total = $1, raw_score = $2, final_score = $3, score_percent = $4
       WHERE id = $5 RETURNING *`,
      [total, rawScore, finalScore, scorePercent, attempt.id]
    );
    const done = upd.rows[0];

    try {
      emit(rooms.member(quiz.teacher_id), "quiz:submission", {
        quizId, quizTitle: quiz.title, studentId: m.id, studentName: m.full_name, scorePercent,
      });
    } catch { /* realtime is best-effort */ }

    res.json({
      success: true,
      result: { scorePercent, rawScore: finalScore, totalQuestions: total, completedAt: done.submitted_at },
    });
  })
);

module.exports = router;