const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getAll, getOne, create, update, remove } = require("../controllers/homeController");
const pool = require("../config/db");

router.use(protect);

// ── Doctor: see ALL homes with their medical plans + latest analysis ──────────
// Must be BEFORE /:id
router.get("/all-with-plans", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        h.id,
        h.name,
        h.location,
        h.medical_plan,
        h.created_at,
        u.name          AS caregiver_name,
        u.email         AS caregiver_email,
        -- latest analysis summary
        ar.id           AS latest_result_id,
        ar.total_anomalies,
        ar.total_days,
        ar.anomaly_rate,
        ar.analyzed_at,
        ar.pipeline
      FROM homes h
      LEFT JOIN users u ON u.id = h.user_id
      LEFT JOIN LATERAL (
        SELECT id, total_anomalies, total_days, anomaly_rate, analyzed_at, pipeline
        FROM analysis_results
        WHERE home_id = h.id
        ORDER BY analyzed_at DESC
        LIMIT 1
      ) ar ON TRUE
      ORDER BY h.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[homes/all-with-plans]", err.message);
    res.status(500).json({ detail: "Failed to fetch homes with plans." });
  }
});

// ── Contacts for a home ───────────────────────────────────────────────────────
router.get("/:id/contacts", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM home_contacts WHERE home_id = $1 ORDER BY type, id",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("[homes/contacts]", err.message);
    res.status(500).json({ detail: "Failed to fetch contacts." });
  }
});

// ── Analysis results for one specific home ───────────────────────────────────
router.get("/:id/results", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ar.*, d.file_name
       FROM analysis_results ar
       LEFT JOIN datasets d ON d.id = ar.dataset_id
       WHERE ar.home_id = $1
       ORDER BY ar.analyzed_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("[homes/:id/results]", err.message);
    res.status(500).json({ detail: "Failed to fetch home results." });
  }
});

router.get("/",      getAll);
router.get("/:id",   getOne);
router.post("/",     create);
router.put("/:id",   update);
router.delete("/:id",remove);

module.exports = router;