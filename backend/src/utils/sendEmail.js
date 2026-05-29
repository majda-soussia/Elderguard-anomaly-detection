const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || "smtp.gmail.com",
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,           // true for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,   // allow self-signed certs (institutional servers)
  },
});

transporter.verify((error) => {
  if (error) {
    console.error("SMTP ERROR:", error.message);
  } else {
    console.log(" SMTP ready —", process.env.SMTP_USER);
  }
});

const sendEmail = async (to, subject, text) => {
  await transporter.sendMail({
    from:    process.env.MAIL_FROM || `"ElderGuard" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
};

module.exports = sendEmail;