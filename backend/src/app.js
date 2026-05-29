// ── MUST be first — loads .env before any other require ──────────────────────
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const express = require("express");
const cors    = require("cors");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes            = require("./routes/auth");
const homeRoutes            = require("./routes/homes");
const datasetRoutes         = require("./routes/datasets");
const analyzeRoutes         = require("./routes/analyze");
const dashboardRoutes       = require("./routes/dashboard");
const messagesRouter        = require("./routes/messages");
const alertsRouter          = require("./routes/alerts");
const interpretationsRouter = require("./routes/interpretations");
const emailRoutes           = require("./routes/email");
const adminRoutes           = require("./routes/adminRoutes");

// ── Models ────────────────────────────────────────────────────────────────────
const { createUsersTable }           = require("./models/User");
const { createHomesTable }           = require("./models/Home");
const { createDatasetsTable }        = require("./models/Dataset");
const { createAnalysisResultsTable } = require("./models/AnalysisResult");
const { createHomeContactsTable }    = require("./models/HomeContact");
const Message                        = require("./models/Message");
const Alert                          = require("./models/Alert");
const Interpretation                 = require("./models/Interpretation");

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin:      process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());

// ── Route registration ────────────────────────────────────────────────────────
app.use("/auth",            authRoutes);
app.use("/homes",           homeRoutes);
app.use("/datasets",        datasetRoutes);
app.use("/analyze",         analyzeRoutes);
app.use("/dashboard",       dashboardRoutes);
app.use("/messages",        messagesRouter);
app.use("/alerts",          alertsRouter);
app.use("/interpretations", interpretationsRouter);
app.use("/api",             emailRoutes);
app.use("/admin",           adminRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", service: "ElderGuard API" }));

// ── Init DB → Start server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;

const start = async () => {
  await createUsersTable();
  await createHomesTable();
  await createHomeContactsTable();
  await createDatasetsTable();
  await createAnalysisResultsTable();
  await Message.createTable();
  await Alert.createTable();
  await Interpretation.createTable();

  app.listen(PORT, () => {
    console.log(`🚀 ElderGuard API running on http://localhost:${PORT}`);
  });
};

start().catch((err) => {
  console.error("❌ Failed to start server:", err.message);
  process.exit(1);
});

module.exports = app;