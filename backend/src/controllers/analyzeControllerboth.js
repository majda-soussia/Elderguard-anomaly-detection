const { spawn } = require("child_process");
const path       = require("path");
const fs         = require("fs");
const pool       = require("../config/db");
const { saveResult, getAllResultsForDoctor } = require("../models/AnalysisResult");

const PROJECT_ROOT  = path.resolve(__dirname, "..", "..", "..");
const PYTHON_SCRIPT = path.join(PROJECT_ROOT, "src", "evaluation", "detect_anomalies_api.py");

// ── Resolve Python binary ─────────────────────────────────────────────────────
function resolvePythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;

  const candidates = [
    path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe"),   // Windows venv
    path.join(PROJECT_ROOT, ".venv", "bin",     "python"),        // Unix venv
    path.join(PROJECT_ROOT, ".venv", "bin",     "python3"),       // Unix venv (alt)
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

const PIPELINES = {
  refit: {
    model:  path.join(PROJECT_ROOT, "models", "saved_models", "autoencoder_refit_best.pth"),
    val:    path.join(PROJECT_ROOT, "data",   "validation",   "refit_validation_dataset.csv"),
    scaler: path.join(PROJECT_ROOT, "data",   "processed",    "scaler_refit.joblib"),
    label:  "REFIT",
  },
  simulator: {
    model:  path.join(PROJECT_ROOT, "models", "saved_models", "autoencoder_best.pth"),
    val:    path.join(PROJECT_ROOT, "data",   "validation",   "normal_validation_dataset.csv"),
    scaler: path.join(PROJECT_ROOT, "data",   "processed",    "scaler.joblib"),
    label:  "Simulator",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /analyze/:datasetId
// Body: { pipeline: "refit" | "simulator" }
// ─────────────────────────────────────────────────────────────────────────────
const analyzeDatasetboth = (req, res) => {
  const filePath = req.datasetFilePath;
  const dataset  = req.dataset;
  const pipeline = (req.body?.pipeline || "refit").toLowerCase();
  const config   = PIPELINES[pipeline];

  if (!config) {
    return res.status(400).json({
      detail: `Unknown pipeline '${pipeline}'. Use 'refit' or 'simulator'.`,
    });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ detail: "CSV file not found on disk." });
  }
  if (!fs.existsSync(config.model)) {
    return res.status(503).json({
      detail:     `${config.label} model not trained yet.`,
      hint:       pipeline === "refit" ? "Run train_autoencoder_refit.py first." : "Run train_autoencoder.py first.",
      model_path: config.model,
    });
  }
  if (!fs.existsSync(config.scaler)) {
    return res.status(503).json({
      detail:      `${config.label} scaler not found.`,
      hint:        pipeline === "refit" ? "Run preprocess_refit.py first." : "Run preprocess_data.py first.",
      scaler_path: config.scaler,
    });
  }
  if (!fs.existsSync(config.val)) {
    return res.status(503).json({
      detail:   `${config.label} validation data not found.`,
      val_path: config.val,
    });
  }

  const args = [PYTHON_SCRIPT, filePath, config.model, config.val, config.scaler, pipeline];

  console.log(`[analyze] Python   : ${PYTHON_BIN}`);
  console.log(`[analyze] Pipeline : ${config.label}`);
  console.log(`[analyze] CSV      : ${filePath}`);

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
        python_error: stderr.slice(-1000),
      });
    }

    try {
      const lines    = stdout.trim().split("\n");
      const jsonLine = lines.slice().reverse().find((l) => l.trim().startsWith("{"));
      if (!jsonLine) throw new Error("No JSON found in Python output");

      const result = JSON.parse(jsonLine);
      if (result.error) return res.status(400).json({ detail: result.error });

      try {
        await saveResult({
          dataset_id:      dataset.id,
          home_id:         dataset.home_id,
          user_id:         req.user.id,
          pipeline:        config.label,
          total_days:      result.total_days,
          total_anomalies: result.total_anomalies,
          threshold:       result.threshold,
          type_counts:     result.type_counts,
          anomalies:       result.anomalies,
        });
        console.log(`[analyze] Result saved to DB`);
      } catch (dbErr) {
        console.error("[analyze] DB save failed (non-fatal):", dbErr.message);
      }

      console.log(`[analyze] Done — ${result.total_days} days, ${result.total_anomalies} anomalies`);
      return res.json({ ...result, pipeline: config.label });

    } catch (e) {
      console.error("[analyze] JSON parse error:", e.message);
      return res.status(500).json({
        detail: "Invalid output from analysis script.",
        raw:    stdout.slice(-300),
      });
    }
  });

  py.on("error", (err) => {
    console.error("[analyze] Cannot spawn Python:", err.message);
    return res.status(500).json({
      detail: `Cannot start Python ('${PYTHON_BIN}'). Check PYTHON_BIN env var or install Python.`,
      hint:   "Set PYTHON_BIN=C:\\path\\to\\python.exe in your .env file.",
    });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /analyze/doctor/overview   (doctor-only)
// ─────────────────────────────────────────────────────────────────────────────
const getDoctorOverview = async (req, res) => {
  try {
    const results = await getAllResultsForDoctor(req.user.id);
    return res.json(results);
  } catch (err) {
    console.error("[analyze] getDoctorOverview error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /analyze/results   (all results, for doctor dashboard table)
// ─────────────────────────────────────────────────────────────────────────────
const getResults = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ar.*, d.file_name, h.name AS home_name
       FROM analysis_results ar
       JOIN datasets d ON d.id = ar.dataset_id
       JOIN homes    h ON h.id = d.home_id
       ORDER BY ar.analyzed_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error("[analyze] getResults error:", err.message);
    return res.status(500).json({ detail: "Failed to fetch results." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Single export — no duplicate module.exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { analyzeDatasetboth, getDoctorOverview, getResults };