const express     = require("express");
const router      = express.Router();
const { protect } = require("../middleware/authMiddleware");
const db          = require("../config/db");
const { spawn }   = require("child_process");
const path        = require("path");
const fs          = require("fs");

// ── Paths ─────────────────────────────────────────────────────────────────────
const PROJECT_ROOT  = path.resolve(__dirname, "..", "..", "..");
const PYTHON_SCRIPT = path.join(PROJECT_ROOT, "src", "evaluation", "detect_anomalies_api.py");
const MODELS_DIR    = path.join(PROJECT_ROOT, "models", "saved_models");
const VAL_DIR       = path.join(PROJECT_ROOT, "data", "validation");
const PROCESSED_DIR = path.join(PROJECT_ROOT, "data", "processed");

// ── Resolve Python binary ─────────────────────────────────────────────────────
const PYTHON_BIN = (() => {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venvWin  = path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe");
  const venvUnix = path.join(PROJECT_ROOT, ".venv", "bin", "python");
  if (fs.existsSync(venvWin))  return venvWin;
  if (fs.existsSync(venvUnix)) return venvUnix;
  return "python";
})();

// ── Resolve processed CSV for scaler fitting ──────────────────────────────────
function resolveProcessedCsv(houseId) {
  const candidates = [
    path.join(PROCESSED_DIR, `processed_refit_house${houseId}.csv`),
    path.join(PROCESSED_DIR, `processed_refit_house2.csv`),
    path.join(PROCESSED_DIR, `processed_refit_house1.csv`),
    path.join(PROCESSED_DIR, `processed_full_year_dataset.csv`),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// ── Resolve validation path ───────────────────────────────────────────────────
function resolveValPath(houseId) {
  const specific = path.join(VAL_DIR, `lstm_refit_house${houseId}_validation.csv`);
  if (fs.existsSync(specific)) return specific;
  if (fs.existsSync(VAL_DIR))  return VAL_DIR;
  return null;
}

// ── Middleware: resolve dataset ───────────────────────────────────────────────
const resolveDataset = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, h.user_id, h.name AS home_name
       FROM datasets d
       JOIN homes h ON h.id = d.home_id
       WHERE d.id = $1`,
      [req.params.datasetId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Dataset not found." });

    const dataset       = rows[0];
    const reqUserId     = Number(req.user.id);       // ✅ convert JWT string → number
    const datasetUserId = Number(dataset.user_id);   // ✅ ensure number

    console.log(`[auth] req.user.id=${reqUserId}, dataset.user_id=${datasetUserId}, role=${req.user.role}`);

    // ✅ FIXED: use Number() comparison, allow doctor role too
    if (datasetUserId !== reqUserId && req.user.role !== "admin" && req.user.role !== "doctor") {
      return res.status(403).json({ detail: "Not authorised to analyse this dataset." });
    }

    req.dataset         = dataset;
    req.datasetFilePath = dataset.file_path || dataset.file_name;
    next();
  } catch (err) {
    console.error("[resolveDataset]", err.message);
    res.status(500).json({ detail: "Failed to resolve dataset." });
  }
};

// ── Analysis handler ──────────────────────────────────────────────────────────
const runAnalysis = (req, res) => {
  const filePath = req.datasetFilePath;
  const dataset  = req.dataset;
  const houseId  = dataset.house_id || 2;

  if (!fs.existsSync(filePath))
    return res.status(404).json({ detail: `CSV not found: ${filePath}` });

  const lstmModels = [
    `autoencoder_lstm_refit_house${houseId}_best.pth`,
    "autoencoder_lstm_refit_house1_best.pth",
    "autoencoder_lstm_refit_best.pth",
    "autoencoder_lstm_generated_best.pth",
  ];
  const hasModel = lstmModels.some((n) => fs.existsSync(path.join(MODELS_DIR, n)));
  if (!hasModel)
    return res.status(503).json({
      detail: "No LSTM model found.",
      hint:   "Train with inject_and_detectrefit_lstm.py first.",
    });

  const processedCsv = resolveProcessedCsv(houseId);
  if (!processedCsv)
    return res.status(503).json({
      detail: `No processed REFIT CSV found for house ${houseId}.`,
      hint:   `Expected processed_refit_house${houseId}.csv in data/processed/`,
    });

  const valPath = resolveValPath(houseId);
  if (!valPath)
    return res.status(503).json({ detail: "Validation data not found." });

  const args = [PYTHON_SCRIPT, filePath, MODELS_DIR, valPath, processedCsv, String(houseId)];

  console.log(`[analyze] Python     : ${PYTHON_BIN}`);
  console.log(`[analyze] CSV        : ${filePath}`);
  console.log(`[analyze] Models dir : ${MODELS_DIR}`);
  console.log(`[analyze] Val path   : ${valPath}`);
  console.log(`[analyze] Processed  : ${processedCsv}`);
  console.log(`[analyze] House ID   : ${houseId}`);

  const py   = spawn(PYTHON_BIN, args);
  let stdout = "";
  let stderr = "";

  py.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  py.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  py.on("close", async (code) => {
    if (code !== 0) {
      console.error("[analyze] Python error:\n", stderr);
      return res.status(500).json({
        detail:       "Analysis failed.",
        python_error: stderr.slice(-1200),
      });
    }

    try {
      const lines    = stdout.trim().split("\n");
      const jsonLine = lines.slice().reverse().find((l) => l.trim().startsWith("{"));
      if (!jsonLine) throw new Error("No JSON in Python output.\nstdout: " + stdout.slice(-400));

      const result = JSON.parse(jsonLine);
      if (result.error) return res.status(400).json({ detail: result.error });

      // ── Save to DB (non-fatal) ─────────────────────────────
      let savedResultId = null;
      try {
        const anomaly_rate = result.total_days > 0
          ? ((result.total_anomalies / result.total_days) * 100).toFixed(2)
          : 0;
        const { rows: resRows } = await db.query(
          `INSERT INTO analysis_results
             (dataset_id, home_id, user_id, pipeline,
              total_days, total_anomalies, anomaly_rate, threshold, type_counts, anomalies)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            dataset.id, dataset.home_id, req.user.id, "REFIT",
            result.total_days, result.total_anomalies, anomaly_rate,
            result.threshold,
            JSON.stringify(result.type_counts),
            JSON.stringify(result.anomalies),
          ]
        );
        savedResultId = resRows[0]?.id;
        console.log("[analyze] Result saved to DB, id:", savedResultId);
      } catch (dbErr) {
        console.error("[analyze] DB save (non-fatal):", dbErr.message);
      }

      // ── Create alert when anomalies found (non-fatal) ──────
      if (result.total_anomalies > 0) {
        try {
          const homeName = dataset.home_name || "Unknown Home";
          const fileName = dataset.file_name || "—";

          await db.query(
            `INSERT INTO alerts
             (user_id, home_id, analysis_result_id, home_name, file_name, pipeline,
              anomaly_count, total_days, type_counts, anomalies)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              req.user.id,
              dataset.home_id,
              savedResultId,
              homeName,
              fileName,
              "REFIT",
              result.total_anomalies,
              result.total_days,
              JSON.stringify(result.type_counts || {}),
              JSON.stringify(result.anomalies || []),
            ]
          );
          console.log(`[analyze] Alert created — ${result.total_anomalies} anomalies`);
        } catch (alertErr) {
          console.error("[analyze] Alert creation failed (non-fatal):", alertErr.message);
        }
      }

      console.log(`[analyze] Done — ${result.total_days} days, ${result.total_anomalies} anomalies`);
      return res.json({ ...result, pipeline: "REFIT" });

    } catch (e) {
      console.error("[analyze] Parse error:", e.message);
      return res.status(500).json({
        detail: "Invalid output from analysis script.",
        raw:    stdout.slice(-400),
      });
    }
  });

  py.on("error", (err) => {
    console.error("[analyze] Cannot spawn Python:", err.message);
    return res.status(500).json({
      detail: `Cannot start Python ('${PYTHON_BIN}'). Set PYTHON_BIN in your .env.`,
    });
  });
};

// ── Routes — GET routes MUST come before POST /:datasetId ────────────────────

// GET /analyze/results
router.get("/results", protect, async (req, res) => {
  try {
    let query, params;

    if (req.user.role === "doctor") {
      query = `
        SELECT DISTINCT ON (ar.id) ar.*, d.file_name, h.name AS home_name
        FROM analysis_results ar
        JOIN datasets d ON d.id = ar.dataset_id
        JOIN homes    h ON h.id = d.home_id
        LEFT JOIN home_contacts hc ON hc.home_id = h.id AND hc.type = 'doctor'
        LEFT JOIN users         u  ON u.email = hc.email
        WHERE u.id = $1
           OR NOT EXISTS (
             SELECT 1 FROM home_contacts WHERE home_id = h.id AND type = 'doctor'
           )
        ORDER BY ar.id DESC, ar.analyzed_at DESC`;
      params = [req.user.id];
    } else {
      query = `
        SELECT ar.*, d.file_name, h.name AS home_name
        FROM analysis_results ar
        JOIN datasets d ON d.id = ar.dataset_id
        JOIN homes    h ON h.id = d.home_id
        WHERE ar.user_id = $1
        ORDER BY ar.analyzed_at DESC`;
      params = [req.user.id];
    }

    const { rows } = await db.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error("[analyze] getResults:", err.message);
    return res.status(500).json({ detail: "Failed to fetch results.", error: err.message });
  }
});

// GET /analyze/doctor/overview
router.get("/doctor/overview", protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ar.*, d.file_name, h.name AS home_name, u.name AS caregiver_name
       FROM analysis_results ar
       JOIN datasets d ON d.id = ar.dataset_id
       JOIN homes    h ON h.id = d.home_id
       JOIN users    u ON u.id = ar.user_id
       ORDER BY ar.analyzed_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error("[analyze] getDoctorOverview:", err.message);
    return res.status(500).json({ detail: "Failed to fetch doctor overview." });
  }
});

// POST /analyze/:datasetId — MUST be last
router.post("/:datasetId", protect, resolveDataset, runAnalysis);

module.exports = router;