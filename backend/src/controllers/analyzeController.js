const { spawn } = require("child_process");
const path       = require("path");
const fs         = require("fs");
const { saveResult, getAllResultsForDoctor } = require("../models/AnalysisResult");
const pool  = require("../config/db");
const Alert = require("../models/Alert");

const PROJECT_ROOT  = path.resolve(__dirname, "..", "..", "..");
const PYTHON_SCRIPT = path.join(PROJECT_ROOT, "src", "evaluation", "detect_anomalies_api.py");
const MODELS_DIR    = path.join(PROJECT_ROOT, "models", "saved_models");
const VAL_DIR       = path.join(PROJECT_ROOT, "data", "validation");
const PROCESSED_DIR = path.join(PROJECT_ROOT, "data", "processed");

// ── Resolve Python binary ─────────────────────────────────────────────────────
function resolvePythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const candidates = [
    path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe"),
    path.join(PROJECT_ROOT, ".venv", "bin", "python"),
    path.join(PROJECT_ROOT, ".venv", "bin", "python3"),
    "python3",
    "python",
  ];
  for (const c of candidates) {
    if (c === "python3" || c === "python") return c;
    if (fs.existsSync(c)) return c;
  }
  return "python3";
}

const PYTHON_BIN = resolvePythonBin();

function resolveProcessedCsv(houseId) {
  const candidates = [
    path.join(PROCESSED_DIR, `processed_refit_house${houseId}.csv`),
    path.join(PROCESSED_DIR, `processed_refit_house2.csv`),
    path.join(PROCESSED_DIR, `processed_refit_house1.csv`),
    path.join(PROCESSED_DIR, `processed_full_year_dataset.csv`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveValPath(houseId) {
  const specific = path.join(VAL_DIR, `lstm_refit_house${houseId}_validation.csv`);
  if (fs.existsSync(specific)) return specific;
  if (fs.existsSync(VAL_DIR)) return VAL_DIR;
  return null;
}

function hasAnyLstmModel() {
  if (!fs.existsSync(MODELS_DIR)) return false;
  const lstmNames = [
    "autoencoder_lstm_refit_house1_best.pth",
    "autoencoder_lstm_refit_house2_best.pth",
    "autoencoder_lstm_refit_best.pth",
    "autoencoder_lstm_generated_best.pth",
  ];
  return lstmNames.some((n) => fs.existsSync(path.join(MODELS_DIR, n)));
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /analyze/:datasetId
// ─────────────────────────────────────────────────────────────────────────────
const analyzeDataset = (req, res) => {
  const filePath = req.datasetFilePath;
  const dataset  = req.dataset;

  if (!hasAnyLstmModel()) {
    const found = fs.existsSync(MODELS_DIR)
      ? fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith(".pth"))
      : [];
    return res.status(503).json({
      detail:       "No LSTM model found. Train at least one LSTM model first.",
      hint:         "Run inject_and_detectrefit_lstm.py or train_autoencoder_lstm.py.",
      models_found: found,
      models_dir:   MODELS_DIR,
    });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ detail: "CSV file not found on disk." });
  }

  const houseId = dataset.house_id || 2;

  const processedCsv = resolveProcessedCsv(houseId);
  if (!processedCsv) {
    return res.status(503).json({
      detail: "No processed REFIT CSV found for scaler fitting.",
      hint:   `Expected a file like processed_refit_house${houseId}.csv in data/processed/`,
    });
  }

  const valPath = resolveValPath(houseId);
  if (!valPath) {
    return res.status(503).json({
      detail: "Validation data directory not found.",
      hint:   `Expected ${VAL_DIR} to exist.`,
    });
  }

  const args = [
    PYTHON_SCRIPT,
    filePath,
    MODELS_DIR,
    valPath,
    processedCsv,
    String(houseId),
  ];

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
      console.error("[analyze] Python exited with code", code);
      console.error("[analyze] stderr:\n", stderr);
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

      // ── Save result to DB ─────────────────────────────────
      let savedResult = null;
      try {
        savedResult = await saveResult({
          dataset_id:      dataset.id,
          home_id:         dataset.home_id,
          user_id:         req.user.id,
          pipeline:        "REFIT",
          total_days:      result.total_days,
          total_anomalies: result.total_anomalies,
          threshold:       result.threshold,
          type_counts:     result.type_counts,
          anomalies:       result.anomalies,
        });
        console.log("[analyze] Result saved to DB, id:", savedResult?.id);
      } catch (dbErr) {
        console.error("[analyze] DB save failed (non-fatal):", dbErr.message);
      }

      // ── Create alert when anomalies found ─────────────────
      if (result.total_anomalies > 0) {
        try {
          const homeName = dataset.home_name || (await pool.query(
            "SELECT name FROM homes WHERE id = $1", [dataset.home_id]
          ).then(r => r.rows[0]?.name)) || "Unknown Home";

          const fileName = dataset.file_name || "—";

          await Alert.create({
            user_id:            req.user.id,
            home_id:            dataset.home_id,
            analysis_result_id: savedResult?.id || null,
            home_name:          homeName,
            file_name:          fileName,
            pipeline:           "REFIT",
            anomaly_count:      result.total_anomalies,
            total_days:         result.total_days,
            type_counts:        result.type_counts  || {},
            anomalies:          result.anomalies    || [],
          });
          console.log(`[analyze] Alert created — ${result.total_anomalies} anomalies for ${homeName}`);
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
      detail: `Cannot start Python ('${PYTHON_BIN}'). Set PYTHON_BIN in your .env file.`,
      hint:   "Example: PYTHON_BIN=C:\\path\\to\\.venv\\Scripts\\python.exe",
    });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /analyze/doctor/overview
// ─────────────────────────────────────────────────────────────────────────────
const getDoctorOverview = async (req, res) => {
  try {
    const results = await getAllResultsForDoctor(req.user.id);
    return res.json(results);
  } catch (err) {
    console.error("[analyze] getDoctorOverview:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /analyze/results  ← FIXED: filter by user_id
// ─────────────────────────────────────────────────────────────────────────────
const getResults = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ar.*, d.file_name, h.name AS home_name
       FROM analysis_results ar
       JOIN datasets d ON d.id = ar.dataset_id
       JOIN homes    h ON h.id = d.home_id
       WHERE ar.user_id = $1
       ORDER BY ar.analyzed_at DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error("[analyze] getResults:", err.message);
    return res.status(500).json({ detail: "Failed to fetch results." });
  }
};

module.exports = { analyzeDataset, getDoctorOverview, getResults };