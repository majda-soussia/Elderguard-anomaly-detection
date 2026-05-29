const pool = require("../config/db");

// ── Create table ───────────────────────────────────────────────────────────────
const createHomesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS homes (
      id           SERIAL PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      location     VARCHAR(255),
      user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
      medical_plan JSONB,
      created_at   TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE homes ADD COLUMN IF NOT EXISTS medical_plan JSONB;`);
  console.log("✅ Homes table ready (with medical_plan)");
};

// ── For caregivers: only their own homes ───────────────────────────────────────
const findAllByUser = async (userId) => {
  const { rows } = await pool.query(
    `SELECT h.*, u.name AS caregiver_name, u.email AS caregiver_email
     FROM homes h
     LEFT JOIN users u ON u.id = h.user_id
     WHERE h.user_id = $1
     ORDER BY h.created_at DESC`,
    [userId]
  );
  return rows;
};

// ── For doctors: ALL homes across all caregivers ───────────────────────────────
const findAll = async () => {
  const { rows } = await pool.query(
    `SELECT h.*, u.name AS caregiver_name, u.email AS caregiver_email
     FROM homes h
     LEFT JOIN users u ON u.id = h.user_id
     ORDER BY h.created_at DESC`
  );
  return rows;
};

const findById = async (id, userId) => {
  const { rows } = await pool.query(
    `SELECT * FROM homes WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
};

const createHome = async (name, location, userId, medicalPlan = null) => {
  const { rows } = await pool.query(
    `INSERT INTO homes (name, location, user_id, medical_plan)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, location || null, userId, medicalPlan ? JSON.stringify(medicalPlan) : null]
  );
  return rows[0];
};

const updateHome = async (id, name, location, userId, medicalPlan = null) => {
  const { rows } = await pool.query(
    `UPDATE homes SET name=$1, location=$2, medical_plan=$3
     WHERE id=$4 AND user_id=$5 RETURNING *`,
    [name, location || null, medicalPlan ? JSON.stringify(medicalPlan) : null, id, userId]
  );
  return rows[0] || null;
};

const deleteHome = async (id, userId) => {
  const { rows } = await pool.query(
    `DELETE FROM homes WHERE id=$1 AND user_id=$2 RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
};

module.exports = {
  createHomesTable,
  findAllByUser,
  findAll,
  findById,
  createHome,
  updateHome,
  deleteHome,
};