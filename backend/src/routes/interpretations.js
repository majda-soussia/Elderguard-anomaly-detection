const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const ctrl = require("../controllers/interpretationController");

router.post("/",                             protect, ctrl.create);
router.get("/:resultId/:anomalyIndex",      protect, ctrl.getByAnomaly);
router.get("/:resultId",                     protect, ctrl.getByResult);

module.exports = router;