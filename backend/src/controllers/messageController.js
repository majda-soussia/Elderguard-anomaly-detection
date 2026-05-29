// src/api/controllers/messageController.js
const pool    = require("../config/db");
const Message = require("../models/Message");

// ✅ Safe mailer import — won't crash if not configured
let transporter = null;
try {
  transporter = require("../config/mailer");
} catch (e) {
  console.warn("[messageController] Mailer not configured — emails disabled.");
}

// ─────────────────────────────────────────────────────────
// Helper: build HTML email body
// ─────────────────────────────────────────────────────────
function buildEmailHtml({ doctorName, homeName, fileName, pipeline, totalDays, anomalyCount, typeCounts, anomalies, senderName, caregiverNote }) {
  const rate = totalDays > 0 ? Math.round((anomalyCount / totalDays) * 100) : 0;

  const typeRows = Object.entries(typeCounts || {})
    .map(([type, count]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${type}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;">${count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">
          ${anomalyCount > 0 ? Math.round((count / anomalyCount) * 100) : 0}%
        </td>
      </tr>`).join("");

  const anomalyRows = (anomalies || []).slice(0, 20).map((a, i) => `
    <tr style="background:${i % 2 === 0 ? "#fafafa" : "#fff"}">
      <td style="padding:7px 12px;font-family:monospace;font-size:12px;color:#9196a8;">${(a.day_index ?? i) + 1}</td>
      <td style="padding:7px 12px;font-size:13px;">${a.date || "—"}</td>
      <td style="padding:7px 12px;">
        <span style="background:#eef2ff;color:#6366f1;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;">
          ${a.anomaly_type}
        </span>
      </td>
      <td style="padding:7px 12px;font-family:monospace;font-size:12px;color:#9196a8;">
        ${typeof a.reconstruction_error === "number" ? a.reconstruction_error.toFixed(5) : "—"}
      </td>
    </tr>`).join("");

  const moreRow = (anomalies || []).length > 20
    ? `<tr><td colspan="4" style="padding:10px;text-align:center;color:#9196a8;">… and ${anomalies.length - 20} more</td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:32px 36px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">⚠️ Anomaly Alert — Medical Review Required</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">Sent by ${senderName} · Home: <strong>${homeName}</strong></p>
    </div>
    <div style="padding:32px 36px;">
      <p style="color:#374151;">Dear Dr. ${doctorName},<br><br>
        <strong style="color:#ef4444;">${anomalyCount} anomal${anomalyCount === 1 ? "y" : "ies"}</strong> detected for <strong>${homeName}</strong>.
      </p>
      ${caregiverNote ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:24px;"><p style="color:#78350f;margin:0;">${caregiverNote}</p></div>` : ""}
    </div>
  </div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────
// POST /messages
// ─────────────────────────────────────────────────────────
const send = async (req, res) => {
  const senderRole = req.user.role;

  // ── DOCTOR replying in-app ────────────────────────────
  if (senderRole === "doctor") {
    const { analysis_result_id, body, recipient_type } = req.body;

    if (!analysis_result_id || !body?.trim()) {
      return res.status(400).json({ detail: "analysis_result_id and body are required." });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ detail: "Message body is required" });
    }

    try {
      const message = await Message.create({
        sender_id:          req.user.id,
        analysis_result_id: Number(analysis_result_id),
        body:               body.trim(),
        recipient_type:     recipient_type || "caregiver",
        recipient_email:    null,
        recipient_name:     null,
      });
      console.log("MESSAGE CREATED:", message);
      return res.status(201).json(message);
    } catch (err) {
      console.error("❌ DB ERROR:", err); // ✅ SHOW FULL ERROR
      return res.status(500).json({
        detail: "Failed to save reply.",
        error: err.message
      });
  }
}

  // ── CAREGIVER in-app (body + recipient_type) ──────────
  const { analysis_result_id, note, body, recipient_type } = req.body;
  if (!analysis_result_id) {
    return res.status(400).json({ detail: "analysis_result_id is required." });
  }

  // ── CAREGIVER sending MESSAGE only ──
if (recipient_type && body && recipient_type !== "doctor") {
  try {
    const message = await Message.create({
      sender_id: req.user.id,
      analysis_result_id: Number(analysis_result_id),
      body: body.trim(),
      recipient_type,
      recipient_email: null,
      recipient_name: null,
    });

    return res.status(201).json(message);
  } catch (err) {
    console.error("caregiver message error:", err);
    return res.status(500).json({ detail: "Failed to save message." });
  }
}

  // ── CAREGIVER email flow ──────────────────────────────
  if (!analysis_result_id) {
    return res.status(400).json({ detail: "analysis_result_id is required." });
  }

  try {
    const { rows: resultRows } = await pool.query(
      `SELECT ar.*, d.file_name, d.home_id, h.name AS home_name
       FROM analysis_results ar
       JOIN datasets d ON d.id = ar.dataset_id
       JOIN homes    h ON h.id = d.home_id
       WHERE ar.id = $1`,
      [analysis_result_id]
    );
    if (!resultRows.length) {
      return res.status(404).json({ detail: "Analysis result not found." });
    }
    const result = resultRows[0];

    const { rows: contactRows } = await pool.query(
      `SELECT * FROM home_contacts WHERE home_id = $1 AND type = 'doctor' LIMIT 1`,
      [result.home_id]
    );
    if (!contactRows.length || !contactRows[0].email) {
      return res.status(422).json({
        detail: "No doctor email found for this home. Please add a doctor contact in the Data page.",
      });
    }
    const doctor = contactRows[0];

    const typeCounts = typeof result.type_counts === "string"
      ? JSON.parse(result.type_counts) : (result.type_counts || {});
    const anomalies = typeof result.anomalies === "string"
      ? JSON.parse(result.anomalies) : (result.anomalies || []);

    const { rows: userRows } = await pool.query(
      `SELECT name FROM users WHERE id = $1`, [req.user.id]
    );
    const senderName = userRows[0]?.name || "Caregiver";

    // Send email only if mailer is available
    if (transporter) {
      const html = buildEmailHtml({
        doctorName: doctor.name, homeName: result.home_name,
        fileName: result.file_name, pipeline: result.pipeline,
        totalDays: result.total_days, anomalyCount: result.total_anomalies,
        typeCounts, anomalies, senderName, caregiverNote: note || "",
      });
      await transporter.sendMail({
        from:    process.env.MAIL_FROM || `"ElderGuard" <${process.env.SMTP_USER}>`,
        to:      `"${doctor.name}" <${doctor.email}>`,
        subject: `⚠️ ElderGuard Alert — ${result.total_anomalies} anomal${result.total_anomalies === 1 ? "y" : "ies"} at ${result.home_name}`,
        html,
      });
      console.log(`[messageController] Email sent to ${doctor.email}`);
    } else {
      console.warn("[messageController] Email skipped — mailer not configured.");
    }

    const message = await Message.create({
      sender_id:          req.user.id,
      analysis_result_id: Number(analysis_result_id),
      body:               note || `Alert sent for ${result.total_anomalies} anomalies at ${result.home_name}`,
      recipient_type:     "doctor",
      recipient_email:    doctor.email,
      recipient_name:     doctor.name,
    });

    return res.status(201).json({
      message:   transporter ? "Email sent successfully." : "Message saved (email not configured).",
      recipient: doctor.email,
      record:    message,
    });

  } catch (err) {
    console.error("[messageController] send error:", err.message);
    return res.status(500).json({ detail: "Failed to send message.", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────
// GET /messages/thread/:resultId
// ─────────────────────────────────────────────────────────
const getThread = async (req, res) => {
  try {
    const resultId = Number(req.params.resultId);
    if (isNaN(resultId)) {
      return res.status(400).json({ detail: "Invalid result ID." });
    }
    const thread = await Message.getThread(resultId);
    res.json(thread);
  } catch (err) {
    console.error("[messageController] getThread error:", err.message);
    res.status(500).json({ detail: "Failed to fetch thread.", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────
// PATCH /messages/:id/read
// ─────────────────────────────────────────────────────────
const markRead = async (req, res) => {
  try {
    const msg = await Message.markRead(req.params.id);
    if (!msg) return res.status(404).json({ detail: "Message not found." });
    res.json(msg);
  } catch (err) {
    console.error("[messageController] markRead error:", err.message);
    res.status(500).json({ detail: "Failed to mark as read." });
  }
};

module.exports = { send, getThread, markRead };