const pool = require("../config/db");

async function createTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interpretations (
      id                  SERIAL PRIMARY KEY,
      doctor_id           INTEGER REFERENCES users(id),
      analysis_result_id  INTEGER REFERENCES analysis_results(id),
      anomaly_index       INTEGER,
      diagnosis           TEXT,
      solution            TEXT,
      created_at          TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function createInterpretation({ doctor_id, analysis_result_id, anomaly_index, diagnosis, solution }) {
  const { rows } = await pool.query(
    `INSERT INTO interpretations (doctor_id, analysis_result_id, anomaly_index, diagnosis, solution)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [doctor_id, analysis_result_id, anomaly_index, diagnosis, solution]
  );
  return rows[0];
}

async function getByAnomaly(analysis_result_id, anomaly_index) {
  const { rows } = await pool.query(
    `SELECT i.*, u.name AS doctor_name
     FROM interpretations i JOIN users u ON u.id = i.doctor_id
     WHERE i.analysis_result_id=$1 AND i.anomaly_index=$2
     ORDER BY i.created_at DESC`,
    [analysis_result_id, anomaly_index]
  );
  return rows;
}

async function getByResult(analysis_result_id) {
  const { rows } = await pool.query(
    `SELECT i.*, u.name AS doctor_name
     FROM interpretations i JOIN users u ON u.id = i.doctor_id
     WHERE i.analysis_result_id=$1 ORDER BY i.anomaly_index, i.created_at`,
    [analysis_result_id]
  );
  return rows;
}

module.exports = { createTable, createInterpretation, getByAnomaly, getByResult };