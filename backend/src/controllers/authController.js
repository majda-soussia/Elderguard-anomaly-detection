const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { findByEmail, findById, createUser } = require("../models/User");

const JWT_SECRET  = process.env.JWT_SECRET  || "your_jwt_secret_change_me";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

// ─── SIGNUP ──────────────────────────────────────────────
const signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ detail: "All fields are required." });

    if (password.length < 8)
      return res.status(400).json({ detail: "Password must be at least 8 characters." });

    const validRoles = ["caregiver", "doctor"];
    if (role && !validRoles.includes(role))
      return res.status(400).json({ detail: "Invalid role. Use 'caregiver' or 'doctor'." });

    // Check duplicate email
    const existing = await findByEmail(email);
    if (existing)
      return res.status(409).json({ detail: "Email already registered." });

    // Hash & save
    const hashed = await bcrypt.hash(password, 10);
    const user   = await createUser(name, email, hashed, role || "caregiver");

    return res.status(201).json({
      message: "Account created successfully.",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ detail: "Internal server error." });
  }
};

// ─── LOGIN ────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ detail: "Email and password are required." });

    // Find user
    const user = await findByEmail(email);
    if (!user)
      return res.status(401).json({ detail: "Invalid email or password." });

    // Verify password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ detail: "Invalid email or password." });

    // Sign JWT — include role
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return res.status(200).json({
      access_token: token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ detail: "Internal server error." });
  }
};

// ─── GET CURRENT USER (protected) ────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await findById(req.user.id);
    if (!user)
      return res.status(404).json({ detail: "User not found." });

    return res.json({ user });
  } catch (err) {
    console.error("getMe error:", err);
    return res.status(500).json({ detail: "Internal server error." });
  }
};

module.exports = { signup, login, getMe };