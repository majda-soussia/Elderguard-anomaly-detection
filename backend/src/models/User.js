const pool = require("../config/db");

// ─── Create users table if it doesn't exist ───────────────
const createUsersTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(100)        NOT NULL,
      email      VARCHAR(150) UNIQUE NOT NULL,
      password   VARCHAR(255)        NOT NULL,
      role       VARCHAR(20)         NOT NULL DEFAULT 'caregiver'
                   CHECK (role IN ('caregiver', 'doctor')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("✅ Users table ready");
};

// ─── Queries ──────────────────────────────────────────────
const findByEmail = async (email) => {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0] || null;
};

const findById = async (id) => {
  const result = await pool.query(
    "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
};

const createUser = async (name, email, hashedPassword, role = "caregiver") => {
  const result = await pool.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email, hashedPassword, role]
  );
  return result.rows[0];
};

module.exports = { createUsersTable, findByEmail, findById, createUser };