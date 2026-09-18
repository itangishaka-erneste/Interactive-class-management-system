const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'easy_class_work',
  password: 'your_password',
  port: 5432,
});

const JWT_SECRET = 'your_jwt_secret_key';
const googleClient = new OAuth2Client('YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com');

// Socket.IO Connection & Events
io.on('connection', (socket) => {
  // Join role-based or session rooms
  socket.on('join_room', (room) => {
    socket.join(room);
  });

  // Real-time Notes Broadcast
  socket.on('teacher_create_note', (newNote) => {
    io.to(`class_${newNote.class_id}`).emit('note_added', newNote);
  });

  // Start Real-time Quiz Session
  socket.on('start_live_quiz', (quizData) => {
    io.to(`class_${quizData.class_id}`).emit('quiz_started', quizData);
  });

  // Real-time Quiz Answer Submission (Student -> Teacher Live Sync)
  socket.on('submit_quiz_answer', async (data) => {
    const { quiz_id, student_id, question_id, selected_option, is_correct, class_id } = data;
    
    await pool.query(
      `INSERT INTO quiz_progress (quiz_id, student_id, question_id, selected_option, is_correct)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (quiz_id, student_id, question_id)
       DO UPDATE SET selected_option = $4, is_correct = $5, updated_at = NOW()`,
      [quiz_id, student_id, question_id, selected_option, is_correct]
    );

    // Broadcast update directly to teacher monitoring interface
    io.to(`teacher_monitor_${quiz_id}`).emit('student_progress_updated', {
      student_id,
      question_id,
      selected_option,
      is_correct
    });
  });

  // Real-time Chat
  socket.on('send_message', async (data) => {
    const { sender_id, receiver_id, content } = data;
    const res = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
      [sender_id, receiver_id, content]
    );
    io.to(`user_${receiver_id}`).emit('receive_message', res.rows[0]);
  });
});

// Auth Route: Google Sign-In
app.post('/api/auth/google', async (req, res) => {
  const { credential, role, school_code } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    });
    const { sub, email, name } = ticket.getPayload();

    let school_id = null;
    if (school_code) {
      const schoolRes = await pool.query('SELECT id FROM schools WHERE school_code = $1', [school_code]);
      if (schoolRes.rows.length === 0) return res.status(400).json({ error: 'Invalid School Code' });
      school_id = schoolRes.rows[0].id;
    }

    let user = await pool.query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [sub, email]);

    if (user.rows.length === 0) {
      const newUser = await pool.query(
        'INSERT INTO users (full_name, email, google_id, role, school_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, email, sub, role || 'student', school_id]
      );
      user = newUser;
    }

    const token = jwt.sign({ id: user.rows[0].id, role: user.rows[0].role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: user.rows[0] });
  } catch (err) {
    res.status(400).json({ error: 'Google Authentication Failed' });
  }
});

// Fetch Persistent Session
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await pool.query('SELECT id, full_name, email, role, school_id FROM users WHERE id = $1', [decoded.id]);
    res.json(user.rows[0]);
  } catch (err) {
    res.status(401).json({ error: 'Invalid Token' });
  }
});

server.listen(5000, () => console.log('Server listening on port 5000'));