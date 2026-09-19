require("dotenv").config(); // loads your .env (SUPERADMIN_EMAIL, JWT_SECRET, etc.). Must be first.

const express = require("express");
const cors = require("cors");
const pool = require("./db");
const registerRoute = require("./register");

// File name is case-sensitive on hosts like Render: Superadmin.js -> "./Superadmin"
const { router: superadminRouter } = require("./Superadmin");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/schools", registerRoute);
app.use("/api/superadmin", superadminRouter);
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});