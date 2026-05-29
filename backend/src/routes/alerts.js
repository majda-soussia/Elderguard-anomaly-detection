// src/api/routes/alerts.js
const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const ctrl        = require("../controllers/alertController");

router.get("/",                    protect, ctrl.getAlerts);
router.patch("/:id/read",          protect, ctrl.markRead);
router.post("/:id/send-to-doctor", protect, ctrl.sendToDoctor);   // ← new

module.exports = router;