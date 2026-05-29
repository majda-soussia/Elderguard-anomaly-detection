const express   = require("express");
const router    = express.Router();
const sendEmail = require("../utils/sendEmail");

router.post("/send-email", async (req, res) => {
  try {
    const { to, subject, text } = req.body;
    console.log("📧 Sending email to:", to);
    if (!to) return res.status(400).json({ error: "Missing 'to' field" });

    await sendEmail(to, subject, text);
    res.status(200).json({ message: "Email sent successfully" });
  } catch (err) {
    console.error("❌ EMAIL ERROR FULL:", err);   // full error object
    res.status(500).json({ error: err.message, code: err.code, stack: err.stack });
  }
});

module.exports = router;