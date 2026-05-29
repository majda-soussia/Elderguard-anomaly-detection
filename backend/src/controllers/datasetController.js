const path    = require("path");
const fs      = require("fs");
const multer  = require("multer");
const pool    = require("../config/db");
const { findAllByHome, findAllByUser, findById, createDataset, updateDataset, deleteDataset } = require("../models/Dataset");
const { findById: findHome } = require("../models/Home");

// ─── Multer — save CSV files to /uploads folder ───────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed."));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ─── GET all datasets (all homes of user) ─────────────────
const getAll = async (req, res) => {
  try {
    const datasets = await findAllByUser(req.user.id);
    res.json(datasets);
  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ detail: err.message });
  }
};

// ─── GET datasets by home ─────────────────────────────────
const getByHome = async (req, res) => {
  try {
    const datasets = await findAllByHome(req.params.homeId, req.user.id);
    res.json(datasets);
  } catch (err) {
    res.status(500).json({ detail: "Failed to fetch datasets." });
  }
};

// ─── UPLOAD CSV dataset ───────────────────────────────────
const uploadDataset = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ detail: "No CSV file uploaded." });

    const { home_id, duration } = req.body;
    if (!home_id) return res.status(400).json({ detail: "home_id is required." });

    // Admin can upload to any home; caregivers only their own
    let home;
    if (req.user.role === "admin") {
      const result = await pool.query("SELECT * FROM homes WHERE id = $1", [home_id]);
      home = result.rows[0] || null;
    } else {
      home = await findHome(home_id, req.user.id);
    }

    if (!home) return res.status(404).json({ detail: "Home not found." });

    const dataset = await createDataset(
      req.file.originalname,
      req.file.path,
      duration,
      home_id
    );
    res.status(201).json(dataset);
  } catch (err) {
    console.error("uploadDataset error:", err);
    res.status(500).json({ detail: "Failed to upload dataset." });
  }
};

// ─── UPDATE dataset (duration or home_id) ─────────────────
const update = async (req, res) => {
  try {
    const { duration, home_id } = req.body;
    if (!home_id) return res.status(400).json({ detail: "home_id is required." });

    const dataset = await updateDataset(req.params.id, duration, home_id, req.user.id);
    if (!dataset) return res.status(404).json({ detail: "Dataset not found." });
    res.json(dataset);
  } catch (err) {
    res.status(500).json({ detail: "Failed to update dataset." });
  }
};

// ─── DELETE dataset ───────────────────────────────────────
const remove = async (req, res) => {
  try {
    const dataset = await deleteDataset(req.params.id, req.user.id);
    if (!dataset) return res.status(404).json({ detail: "Dataset not found." });

    if (fs.existsSync(dataset.file_path)) {
      fs.unlinkSync(dataset.file_path);
    }
    res.json({ message: "Dataset deleted successfully." });
  } catch (err) {
    res.status(500).json({ detail: "Failed to delete dataset." });
  }
};

module.exports = { upload, getAll, getByHome, uploadDataset, update, remove };