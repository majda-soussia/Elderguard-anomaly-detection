const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || "smtp.gmail.com",
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,          // true for port 465, false for 587 (STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Quick connectivity check at startup (non-fatal)
transporter.verify((err) => {
  if (err) {
    console.warn("[mailer] ⚠  SMTP not reachable:", err.message);
  } else {
    console.log("[mailer] ✅ SMTP ready");
  }
});

module.exports = transporter;