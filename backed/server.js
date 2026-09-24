require("dotenv").config(); // loads your .env (SUPERADMIN_EMAIL, JWT_SECRET, etc.). Must be first.

const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const pool = require("./db");
const registerRoute = require("./register");

// File name is case-sensitive on hosts like Render: Superadmin.js -> "./Superadmin"
const { router: superadminRouter, setupSocket } = require("./Superadmin");
const { setupClassroomSocket } = require("./classroom");
const teacherRouter = require("./teacher");
const schoolAdminRouter = require("./School_admin");
const studentRouter = require("./student");

const app = express();

// Socket.IO must be attached to a plain http server, so we create one here
// and use server.listen(...) at the bottom instead of app.listen(...).
const server = http.createServer(app);

// Optional: restrict to your sites, e.g. CLIENT_URLS=http://localhost:5173,https://your-site.vercel.app
// If CLIENT_URLS is not set, every origin is allowed (same as your old cors()).
const allowedOrigins = (process.env.CLIENT_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const corsOrigin = allowedOrigins.length ? allowedOrigins : true;

// PATCH must be listed: the school admin dashboard uses PATCH for status/class
// changes, and it is not one of the default simple methods for CORS preflight.
app.use(cors({ origin: corsOrigin, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));

// The register form sends the logo as a base64 string. The default 100kb limit
// rejects most logos, so registration failed with "PayloadTooLargeError".
app.use(express.json({ limit: "5mb" }));

// Request log: shows every request and how long it took. If a request hangs,
// you will see a "[slow]" line in this terminal naming exactly which one.
app.use((req, res, next) => {
  const start = Date.now();
  const label = `${req.method} ${req.originalUrl}`;
  const slowTimer = setTimeout(() => console.warn(`[slow] ${label} still running after 10s`), 10000);
  res.on("finish", () => {
    clearTimeout(slowTimer);
    console.log(`${label} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  res.on("close", () => clearTimeout(slowTimer));
  next();
});

// Realtime channels: /superadmin (super admin dashboard) and /classroom
// (teachers, students and the school admin dashboard).
const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});
setupSocket(io);
setupClassroomSocket(io);

app.use("/api/schools", registerRoute);
app.use("/api/superadmin", superadminRouter);
app.use("/api/teacher", teacherRouter);
app.use("/api/schooladmin", schoolAdminRouter);
app.use("/api/student", studentRouter);
app.use("/uploads", express.static(__dirname + "/uploads"));

app.get("/", (req, res) => {
  res.json({
    message: "Easy Class Records API is running",
  });
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    console.log("Database connected successfully!");

    res.json({
      connected: true,
      message: "Database connected successfully",
      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);

    res.status(500).json({
      connected: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Render (and other hosts) provide PORT; locally it falls back to 5000.
const PORT = process.env.PORT || 5000;

// IMPORTANT: server.listen, not app.listen, otherwise Socket.IO never starts.
server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});