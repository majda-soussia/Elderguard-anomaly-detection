const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getDashboardStats,
  getLatestByUser,
  getRecentAnomalies,
} = require("../models/AnalysisResult");

router.use(protect);

// GET /dashboard/stats
router.get("/stats", async (req, res) => {
  try {
    const [stats, latest, recentRows] = await Promise.all([
      getDashboardStats(req.user.id),
      getLatestByUser(req.user.id),
      getRecentAnomalies(req.user.id, 5),
    ]);

    // Flatten recent anomalies from all analyses
    const recentAnomalies = [];
    for (const row of recentRows) {
      const anomalies = Array.isArray(row.anomalies) ? row.anomalies : [];
      for (const a of anomalies.slice(0, 3)) {
        recentAnomalies.push({
          ...a,
          home_name:   row.home_name,
          analyzed_at: row.analyzed_at,
        });
        if (recentAnomalies.length >= 5) break;
      }
      if (recentAnomalies.length >= 5) break;
    }

    res.json({ stats, latest, recentAnomalies });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ detail: "Failed to load dashboard stats." });
  }
});

module.exports = router;