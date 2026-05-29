const pool = require("../config/db");

// ── GET /admin/stats ──────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [homes, datasets, analyses, anomalies, users, cleanDays] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM homes"),
      pool.query("SELECT COUNT(*) FROM datasets"),
      pool.query("SELECT COUNT(*) FROM analysis_results"),
      pool.query("SELECT COALESCE(SUM(total_anomalies),0) AS total FROM analysis_results"),
      pool.query("SELECT COUNT(*) FROM users"),
      pool.query("SELECT COALESCE(SUM(total_days - total_anomalies),0) AS total FROM analysis_results"),
    ]);

    const stats = {
      total_homes:      parseInt(homes.rows[0].count),
      total_datasets:   parseInt(datasets.rows[0].count),
      total_analyses:   parseInt(analyses.rows[0].count),
      total_anomalies:  parseInt(anomalies.rows[0].total),
      total_users:      parseInt(users.rows[0].count),
      total_clean_days: parseInt(cleanDays.rows[0].total),
    };

    const latestRes = await pool.query(`
      SELECT ar.*, h.name AS home_name, d.file_name,
             ROUND(ar.total_anomalies::numeric / NULLIF(ar.total_days,0) * 100, 2) AS anomaly_rate
      FROM analysis_results ar
      JOIN homes    h ON h.id = ar.home_id
      JOIN datasets d ON d.id = ar.dataset_id
      ORDER BY ar.analyzed_at DESC
      LIMIT 1
    `);

    const latest = latestRes.rows[0] || null;
    if (latest && latest.type_counts && typeof latest.type_counts === "string") {
      latest.type_counts = JSON.parse(latest.type_counts);
    }

    const recentRes = await pool.query(`
      SELECT
        a->>'date'                           AS date,
        a->>'anomaly_type'                   AS anomaly_type,
        (a->>'reconstruction_error')::float  AS reconstruction_error,
        h.name                               AS home_name
      FROM analysis_results ar
      JOIN homes h ON h.id = ar.home_id,
      jsonb_array_elements(ar.anomalies::jsonb) AS a
      ORDER BY ar.analyzed_at DESC
      LIMIT 10
    `);

    const usersRes = await pool.query(`
      SELECT id, name, email, role, created_at FROM users
      ORDER BY created_at DESC LIMIT 5
    `);

    res.json({ stats, latest, recentAnomalies: recentRes.rows, recentUsers: usersRes.rows });
  } catch (err) {
    console.error("[admin/stats]", err.message);
    res.status(500).json({ detail: "Failed to load admin stats." });
  }
};

// ── GET /admin/homes ──────────────────────────────────────
const getAllHomes = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT h.*, u.name AS owner_name
      FROM homes h
      LEFT JOIN users u ON u.id = h.user_id
      ORDER BY h.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[admin/homes]", err.message);
    res.status(500).json({ detail: "Failed to fetch homes." });
  }
};

// ── GET /admin/datasets ───────────────────────────────────
const getAllDatasets = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, h.name AS home_name, u.name AS owner_name
      FROM datasets d
      LEFT JOIN homes h ON h.id = d.home_id
      LEFT JOIN users u ON u.id = h.user_id
      ORDER BY d.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[admin/datasets]", err.message);
    res.status(500).json({ detail: "Failed to fetch datasets." });
  }
};

// ── GET /admin/users ──────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.created_at,
        COALESCE(JSON_AGG(uh.home_id) FILTER (WHERE uh.home_id IS NOT NULL), '[]') AS home_ids
      FROM users u
      LEFT JOIN user_homes uh ON uh.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[admin/users]", err.message);
    res.status(500).json({ detail: "Failed to fetch users." });
  }
};

// ── DELETE /admin/users/:id ───────────────────────────────
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id)
      return res.status(400).json({ detail: "You cannot delete your own account." });
    const { rows } = await pool.query("DELETE FROM users WHERE id=$1 RETURNING *", [id]);
    if (!rows.length) return res.status(404).json({ detail: "User not found." });
    res.json({ message: "User deleted." });
  } catch (err) {
    console.error("[admin/users/delete]", err.message);
    res.status(500).json({ detail: "Failed to delete user." });
  }
};

// ── PUT /admin/users/:id/homes ────────────────────────────
const assignHomes = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { home_ids } = req.body;
    if (!Array.isArray(home_ids))
      return res.status(400).json({ detail: "home_ids must be an array." });

    await client.query("BEGIN");
    await client.query("DELETE FROM user_homes WHERE user_id=$1", [id]);
    for (const homeId of home_ids) {
      await client.query(
        "INSERT INTO user_homes (user_id, home_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [id, homeId]
      );
    }
    await client.query("COMMIT");
    res.json({ message: "Homes assigned.", home_ids });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[admin/users/assign]", err.message);
    res.status(500).json({ detail: "Failed to assign homes." });
  } finally {
    client.release();
  }
};

module.exports = { getStats, getAllHomes, getAllDatasets, getUsers, deleteUser, assignHomes };