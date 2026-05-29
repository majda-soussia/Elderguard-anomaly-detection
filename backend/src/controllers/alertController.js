const AlertModel  = require("../models/Alert");
const pool        = require("../config/db");
const transporter = require("../config/mailer");

// ── GET /alerts ───────────────────────────────────────────
const getAlerts = async (req, res) => {
  try {
    const alerts = await AlertModel.findByUser(req.user.id);
    res.json(alerts);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
};

// ── PATCH /alerts/:id/read ────────────────────────────────
const markRead = async (req, res) => {
  try {
    const row = await AlertModel.markRead(req.params.id, req.user.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
};

// ── POST /alerts/:id/send-to-doctor ──────────────────────
const sendToDoctor = async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId  = req.user.id;

    // 1. Load the alert (must belong to this user)
    const { rows: alertRows } = await pool.query(
      `SELECT * FROM alerts WHERE id = $1`,
      [alertId]
    );
    if (!alertRows.length) {
      return res.status(404).json({ detail: "Alert not found." });
    }
    const alertRow = alertRows[0];

    // 2. Get caregiver info from users table
    const { rows: userRows } = await pool.query(
      `SELECT name, email FROM users WHERE id = $1`,
      [userId]
    );
    const caregiver = userRows[0] || { name: "Caregiver", email: "" };

    // 3. Find doctor email —
    //    First try home_contacts for this alert's home_id (if it exists),
    //    then fall back to ANY doctor contact across all homes of this user.
    let doctor = null;

    if (alertRow.home_id) {
      const { rows } = await pool.query(
        `SELECT name, email, phone FROM home_contacts
         WHERE home_id = $1 AND type = 'doctor' AND email IS NOT NULL
         LIMIT 1`,
        [alertRow.home_id]
      );
      if (rows.length) doctor = rows[0];
    }

    if (!doctor) {
      // fallback: any doctor contact for any home owned by this user
      const { rows } = await pool.query(
        `SELECT hc.name, hc.email, hc.phone
         FROM home_contacts hc
         JOIN homes h ON h.id = hc.home_id
         WHERE h.user_id = $1 AND hc.type = 'doctor' AND hc.email IS NOT NULL
         LIMIT 1`,
        [userId]
      );
      if (rows.length) doctor = rows[0];
    }

    if (!doctor) {
      return res.status(400).json({
        detail:
          "No doctor email found. Please add a doctor contact in the Data page.",
      });
    }

    // 4. Build email content
    const typeCounts  = alertRow.type_counts  || {};
    const anomalies   = (alertRow.anomalies   || []).slice(0, 20);
    const anomalyRate =
      alertRow.total_days > 0
        ? Math.round((alertRow.anomaly_count / alertRow.total_days) * 100)
        : 0;

    const typeLines = Object.entries(typeCounts)
      .map(([type, count]) => `    • ${type}: ${count} day(s)`)
      .join("\n");

    const anomalyLogLines = anomalies
      .map(
        (a, i) =>
          `  ${String(i + 1).padStart(3, " ")}. ${a.date || "—"}  |  ${
            a.anomaly_type
          }  |  err: ${
            typeof a.reconstruction_error === "number"
              ? a.reconstruction_error.toFixed(5)
              : "—"
          }`
      )
      .join("\n");

    const moreNote =
      alertRow.anomaly_count > 20
        ? `\n  … and ${alertRow.anomaly_count - 20} more anomalies.`
        : "";

    const homeName = alertRow.home_name || "Unknown Home";
    const fileName = alertRow.file_name || "—";
    const pipeline = alertRow.pipeline  || "—";

    // 5. Plain-text body
    const subject = `[ElderGuard] ⚠️ ${alertRow.anomaly_count} Anomalies Detected — ${homeName}`;

    const text = `
Dear Dr. ${doctor.name},

This is an automated alert from ElderGuard sent by ${caregiver.name} (${caregiver.email}).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ANOMALY REPORT — ${homeName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Home        : ${homeName}
  Dataset     : ${fileName}
  Pipeline    : ${pipeline}
  Analyzed at : ${new Date(alertRow.created_at).toLocaleString()}

  Total Days  : ${alertRow.total_days}
  Anomalies   : ${alertRow.anomaly_count} (${anomalyRate}%)
  Clean Days  : ${Math.max(0, alertRow.total_days - alertRow.anomaly_count)}

── ANOMALY TYPE BREAKDOWN ──────────────
${typeLines || "  No breakdown available."}

── ANOMALY LOG (first ${Math.min(20, alertRow.anomaly_count)}) ──────────────
${anomalyLogLines || "  No detail available."}${moreNote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Please review the patient's activity patterns and advise accordingly.

Sent via ElderGuard Monitoring System
    `.trim();

    // 6. HTML body
    const colors = {
      "Temporal Shift": "#6366f1",
      Duration:         "#f59e0b",
      Order:            "#10b981",
    };

    const typeRowsHtml = Object.entries(typeCounts)
      .map(([type, count]) => {
        const pct =
          alertRow.anomaly_count > 0
            ? Math.round((count / alertRow.anomaly_count) * 100)
            : 0;
        const color = colors[type] || "#6b7280";
        return `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="font-weight:600;color:#1e1f2e">${type}</span>
            <span style="color:#9196a8">${count} day(s) · ${pct}%</span>
          </div>
          <div style="height:6px;background:#f0f1f6;border-radius:99px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${color};border-radius:99px"></div>
          </div>
        </div>`;
      })
      .join("");

    const anomalyTableRowsHtml = anomalies
      .map(
        (a, i) => `
      <tr style="border-bottom:1px solid #f0f1f6">
        <td style="padding:8px 12px;color:#b0b5c4;font-family:monospace;font-size:12px">${i + 1}</td>
        <td style="padding:8px 12px;color:#374151;font-weight:500">${a.date || "—"}</td>
        <td style="padding:8px 12px">
          <span style="background:#eef2ff;color:#6366f1;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600">
            ${a.anomaly_type}
          </span>
        </td>
        <td style="padding:8px 12px;text-align:right;font-family:monospace;color:#9196a8;font-size:11px">
          ${typeof a.reconstruction_error === "number" ? a.reconstruction_error.toFixed(5) : "—"}
        </td>
      </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f6fb;padding:32px 0;margin:0">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

    <div style="background:#6366f1;padding:28px 32px">
      <div style="font-size:22px;font-weight:700;color:#fff">⬡ ElderGuard</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:2px">Anomaly Alert Report</div>
    </div>

    <div style="padding:28px 32px">
      <p style="font-size:15px;color:#1e1f2e;margin:0 0 6px">
        Dear Dr. <strong>${doctor.name}</strong>,
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px">
        This alert was sent by <strong>${caregiver.name}</strong> (${caregiver.email}).
      </p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:18px 22px;margin-bottom:24px">
        <div style="font-size:18px;font-weight:700;color:#ef4444;margin-bottom:6px">
          ⚠️ ${alertRow.anomaly_count} Anomali${alertRow.anomaly_count === 1 ? "y" : "ies"} Detected
        </div>
        <div style="font-size:13px;color:#6b7280">
          🏠 ${homeName} &nbsp;·&nbsp; 📄 ${fileName} &nbsp;·&nbsp; 🔬 ${pipeline}
        </div>
      </div>

      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:24px">
        <tr>
          ${[
            ["📅", "Total Days",   alertRow.total_days],
            ["⚠️", "Anomalies",    alertRow.anomaly_count],
            ["✅", "Clean Days",   Math.max(0, alertRow.total_days - alertRow.anomaly_count)],
            ["📊", "Anomaly Rate", `${anomalyRate}%`],
          ]
            .map(
              ([icon, label, val]) => `
          <td style="background:#f8f9fc;border:1px solid #e8eaf0;border-radius:10px;padding:14px 10px;text-align:center;width:25%">
            <div style="font-size:18px">${icon}</div>
            <div style="font-size:20px;font-weight:700;color:#1e1f2e;line-height:1.2;margin:4px 0">${val}</div>
            <div style="font-size:10px;color:#9196a8;text-transform:uppercase;letter-spacing:0.5px">${label}</div>
          </td>`
            )
            .join("")}
        </tr>
      </table>

      ${
        Object.keys(typeCounts).length
          ? `
      <div style="margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:#9196a8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">
          Anomaly Type Breakdown
        </div>
        ${typeRowsHtml}
      </div>`
          : ""
      }

      ${
        anomalies.length
          ? `
      <div style="margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:#9196a8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">
          Anomaly Log (first ${anomalies.length})
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f8f9fc;border-bottom:1px solid #e8eaf0">
              <th style="text-align:left;padding:8px 12px;color:#9196a8;font-weight:600">#</th>
              <th style="text-align:left;padding:8px 12px;color:#9196a8;font-weight:600">Date</th>
              <th style="text-align:left;padding:8px 12px;color:#9196a8;font-weight:600">Type</th>
              <th style="text-align:right;padding:8px 12px;color:#9196a8;font-weight:600">Error</th>
            </tr>
          </thead>
          <tbody>${anomalyTableRowsHtml}</tbody>
        </table>
        ${
          alertRow.anomaly_count > 20
            ? `<p style="font-size:12px;color:#9196a8;margin:8px 0 0">… and ${alertRow.anomaly_count - 20} more anomalies.</p>`
            : ""
        }
      </div>`
          : ""
      }

      <p style="font-size:13px;color:#6b7280;margin:0">
        Please review the patient's activity patterns and advise accordingly.
      </p>
    </div>

    <div style="background:#f8f9fc;border-top:1px solid #e8eaf0;padding:16px 32px;font-size:11px;color:#b0b5c4;text-align:center">
      Sent automatically by ElderGuard Monitoring System · Do not reply to this email
    </div>
  </div>
</body>
</html>`;

    // 7. Send email
    await transporter.sendMail({
      from:    process.env.MAIL_FROM || `"ElderGuard" <${process.env.SMTP_USER}>`,
      to:      doctor.email,
      subject,
      text,
      html,
    });

    console.log(`[alert] Email sent to Dr. ${doctor.name} <${doctor.email}>`);
    return res.json({ message: `Email sent to Dr. ${doctor.name} (${doctor.email})` });

  } catch (e) {
    console.error("[alert] sendToDoctor error:", e.message);
    // ALWAYS return JSON — never let Express fall through to HTML error page
    return res.status(500).json({ detail: e.message });
  }
};

module.exports = { getAlerts, markRead, sendToDoctor };