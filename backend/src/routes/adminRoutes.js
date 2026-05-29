const express = require("express");
const router  = express.Router();
const { protect }      = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const ctrl = require("../controllers/adminController");

router.use(protect);
router.use(requireAdmin);

// Dashboard stats
router.get("/stats", ctrl.getStats);

// All homes + datasets (admin sees everything)
router.get("/homes",    ctrl.getAllHomes);
router.get("/datasets", ctrl.getAllDatasets);

// User management
router.get("/users",           ctrl.getUsers);
router.delete("/users/:id",    ctrl.deleteUser);
router.put("/users/:id/homes", ctrl.assignHomes);

module.exports = router;