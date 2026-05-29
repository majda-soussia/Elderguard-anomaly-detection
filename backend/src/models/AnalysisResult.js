const pool = require("../config/db");

const createAnalysisResultsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analysis_results (
      id               SERIAL PRIMARY KEY,
      dataset_id       INTEGER     REFERENCES datasets(id) ON DELETE CASCADE,
      home_id          INTEGER     REFERENCES homes(id)    ON DELETE CASCADE,
      user_id          INTEGER     REFERENCES users(id)    ON DELETE CASCADE,
      pipeline         VARCHAR(20) NOT NULL DEFAULT 'refit',
      total_days       INTEGER     NOT NULL,
      total_anomalies  INTEGER     NOT NULL,
      anomaly_rate     NUMERIC(5,2),
      threshold        NUMERIC(12,8),
      type_counts      JSONB,
      anomalies        JSONB,
      analyzed_at      TIMESTAMP   DEFAULT NOW()
    );
  `);
  console.log("✅ Analysis results table ready");
};

// Save a new analysis result
const saveResult = async ({
  dataset_id, home_id, user_id, pipeline,
  total_days, total_anomalies, threshold, type_counts, anomalies
}) => {
  const anomaly_rate = total_days > 0
    ? ((total_anomalies / total_days) * 100).toFixed(2)
    : 0;

  const result = await pool.query(
    `INSERT INTO analysis_results
      (dataset_id, home_id, user_id, pipeline, total_days,
       total_anomalies, anomaly_rate, threshold, type_counts, anomalies)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      dataset_id, home_id, user_id, pipeline,
      total_days, total_anomalies, anomaly_rate,
      threshold,
      JSON.stringify(type_counts),
      JSON.stringify(anomalies),
    ]
  );
  return result.rows[0];
};

// Get latest analysis for a user
const getLatestByUser = async (userId) => {
  const result = await pool.query(
    `SELECT ar.*, h.name AS home_name, d.file_name
     FROM analysis_results ar
     LEFT JOIN homes    h ON h.id = ar.home_id
     LEFT JOIN datasets d ON d.id = ar.dataset_id
     WHERE ar.user_id = $1
     ORDER BY ar.analyzed_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
};
const getAllResultsForDoctor = async (doctor_id) => {
  const result = await pool.query(`
    SELECT 
      ar.id,
      ar.total_anomalies,
      ar.analyzed_at,
      h.name AS home_name
    FROM analysis_results ar
    LEFT JOIN homes h ON h.id = ar.home_id
    WHERE h.doctor_id = $1   -- ✅ IMPORTANT
    ORDER BY ar.analyzed_at DESC
  `, [doctor_id]);

  return result.rows;
};
const getDoctorOverview = async (req, res) => {
  try {
    const doctor_id = req.user.id; // ✅ from token

    const results = await getAllResultsForDoctor(doctor_id);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Get recent anomalies across all analyses for a user
const getRecentAnomalies = async (userId, limit = 5) => {
  const result = await pool.query(
    `SELECT ar.anomalies, ar.analyzed_at, h.name AS home_name
     FROM analysis_results ar
     LEFT JOIN homes h ON h.id = ar.home_id
     WHERE ar.user_id = $1
     ORDER BY ar.analyzed_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

// Dashboard stats for a user
const getDashboardStats = async (userId) => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM homes         WHERE user_id = $1)::int      AS total_homes,
       (SELECT COUNT(*) FROM datasets    d
        JOIN homes h ON h.id = d.home_id   WHERE h.user_id = $1)::int   AS total_datasets,
       (SELECT COALESCE(SUM(total_anomalies), 0)
        FROM analysis_results              WHERE user_id = $1)::int      AS total_anomalies,
       (SELECT COALESCE(SUM(total_days - total_anomalies), 0)
        FROM analysis_results              WHERE user_id = $1)::int      AS total_clean_days,
       (SELECT COUNT(*)
        FROM analysis_results              WHERE user_id = $1)::int      AS total_analyses
    `,
    [userId]
  );
  return result.rows[0];
};

module.exports = {
  createAnalysisResultsTable,
  saveResult,
  getLatestByUser,
  getRecentAnomalies,
  getDashboardStats,
  getAllResultsForDoctor
};