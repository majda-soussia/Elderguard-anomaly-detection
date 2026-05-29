const express = require("express");
const router  = express.Router();

const { protect } = require("../middleware/authMiddleware");
const ctrl = require("../controllers/messageController");

router.post("/", protect, ctrl.send);
router.get("/thread/:resultId", protect, ctrl.getThread);
router.patch("/:id/read", protect, ctrl.markRead);

module.exports = router;