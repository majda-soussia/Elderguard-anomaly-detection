// src/api/models/Message.js
const pool = require("../config/db");

// ── Create table + run safe migrations ───────────────────
async function createTable() {
  // Base table (created if it doesn't exist at all)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id                  SERIAL PRIMARY KEY,
      sender_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
      analysis_result_id  INTEGER REFERENCES analysis_results(id) ON DELETE CASCADE,
      body                TEXT NOT NULL,
      recipient_type      VARCHAR(20) DEFAULT 'doctor',
      recipient_email     TEXT,
      recipient_name      TEXT,
      is_read             BOOLEAN DEFAULT FALSE,
      sent_at             TIMESTAMP DEFAULT NOW(),
      created_at          TIMESTAMP DEFAULT NOW()
    );
  `);

  // ── Safe migrations for tables created with the OLD schema ──
  // These are idempotent: they do nothing if the column already exists.
  const migrations = [
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(20) DEFAULT 'doctor'`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_email TEXT`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_name TEXT`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (e) {
      // Ignore "already exists" errors — shouldn't happen with IF NOT EXISTS but just in case
      console.warn("[Message] migration skipped:", e.message);
    }
  }

  console.log("✅ Messages table ready");
}

// ── Save a message (works for both caregiver→doctor and doctor→caregiver) ───
async function create({ sender_id, analysis_result_id, body, recipient_type, recipient_email, recipient_name }) {
  const { rows } = await pool.query(
    `INSERT INTO messages
       (sender_id, analysis_result_id, body, recipient_type, recipient_email, recipient_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      sender_id,
      analysis_result_id,
      body,
      recipient_type  || "doctor",
      recipient_email || null,
      recipient_name  || null,
    ]
  );
  return rows[0];
}

// ── Get full thread for one result ───────────────────────
async function getThread(analysis_result_id) {
  const { rows } = await pool.query(
    `SELECT
       m.*,
       u.name AS sender_name,
       u.role AS sender_role
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.analysis_result_id = $1
     ORDER BY COALESCE(m.sent_at, m.created_at) ASC`,
    [analysis_result_id]
  );
  return rows;
}

// ── Mark message as read ──────────────────────────────────
async function markRead(id) {
  const { rows } = await pool.query(
    `UPDATE messages SET is_read = TRUE WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0];
}

module.exports = { createTable, create, getThread, markRead };