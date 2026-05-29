const express = require("express");
const router = express.Router();
const { signup, login, getMe } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// POST /auth/signup
router.post("/signup", signup);

// POST /auth/login
router.post("/login", login);

// GET /auth/me  — protected route (requires valid JWT)
router.get("/me", protect, getMe);

module.exports = router;