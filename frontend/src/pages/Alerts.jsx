import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const h  = () => ({ Authorization: `Bearer ${authService.getToken()}` });
const hj = () => ({ ...h(), "Content-Type": "application/json" });

// ── Safely parse JSONB that may arrive as a string ────────
const safeArray  = (val) => { try { const p = typeof val === "string" ? JSON.parse(val) : val; return Array.isArray(p) ? p : []; } catch { return []; } };
const safeObject = (val) => { try { const p = typeof val === "string" ? JSON.parse(val) : val; return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; } };

// ── Friendly caregiver-facing language ────────────────────
const TYPE_META = {
  "Temporal Shift": {
    icon: "🕐", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe",
    friendly: "Routine timing change",
    desc: "Your resident did their usual activities at a different time than normal",
    action: "Check in with your resident — ask if they slept or ate at different times",
  },
  "Duration": {
    icon: "⏳", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a",
    friendly: "Activity duration change",
    desc: "An activity lasted much longer or shorter than usual",
    action: "Monitor over the next few days and contact the doctor if this continues",
  },
  "Order": {
    icon: "🔄", color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0",
    friendly: "Daily routine reordered",
    desc: "The usual order of daily activities was changed",
    action: "Consider scheduling a doctor review if this happens repeatedly",
  },
};
const fallback = {
  icon: "⚠️", color: "#ef4444", bg: "#fef2f2", border: "#fecaca",
  friendly: "Unusual activity",
  desc: "An unexpected change in the daily routine was detected",
  action: "Continue monitoring and contact the doctor if concerned",
};
const tm = (type) => TYPE_META[type] || fallback;

// ── Severity level based on anomaly rate ──────────────────
function severity(count, total) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  if (pct >= 30) return { label: "High concern",   color: "#ef4444", bg: "#fef2f2", border: "#fecaca" };
  if (pct >= 10) return { label: "Worth watching", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" };
  return           { label: "Minor variation",  color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0" };
}

// ── Donut chart ────────────────────────────────────────────
function DonutChart({ typeCounts }) {
  const entries = Object.entries(typeCounts || {});
  const total   = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;
  let offset = 0;
  const R = 28, C = 36, stroke = 10, circ = 2 * Math.PI * R;
  const slices = entries.map(([type, count]) => {
    const pct = count / total, dash = pct * circ, gap = circ - dash, o = offset;
    offset += pct * circ;
    return { type, dash, gap, offset: o };
  });
  return (
    <svg width={72} height={72} viewBox={`0 0 ${C*2} ${C*2}`} style={{ flexShrink: 0 }}>
      {slices.map(({ type, dash, gap, offset: off }) => (
        <circle key={type} cx={C} cy={C} r={R} fill="none"
          stroke={tm(type).color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${gap}`}
          strokeDashoffset={-off + circ * 0.25} strokeLinecap="round" />
      ))}
      <text x={C} y={C+1} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 13, fontWeight: 700, fill: "#1e1f2e", fontFamily: "DM Sans, sans-serif" }}>
        {total}
      </text>
    </svg>
  );
}

// ── Detail panel ──────────────────────────────────────────
function DetailPanel({ alert }) {
  const typeCounts = safeObject(alert.type_counts);
  const anomalies  = safeArray(alert.anomalies);
  const total      = alert.total_days || 0;
  const sev        = severity(alert.anomaly_count, total);
  const [filter, setFilter] = useState("all");
  const filtered   = filter === "all" ? anomalies : anomalies.filter(a => a.anomaly_type === filter);

  return (
    <div style={{ borderTop: "1px solid #e8eaf0", background: "#f8f9fc", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Days monitored",  value: total,                                    icon: "📅", color: "#6366f1" },
          { label: "Unusual days",    value: alert.anomaly_count,                      icon: "⚠️", color: "#ef4444" },
          { label: "Normal days",     value: Math.max(0, total - alert.anomaly_count), icon: "✅", color: "#10b981" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e8eaf0", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: "#9196a8", marginTop: 5, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Severity banner */}
      <div style={{ background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>{sev.label === "High concern" ? "🚨" : sev.label === "Worth watching" ? "👀" : "ℹ️"}</div>
        <div>
          <div style={{ fontWeight: 700, color: sev.color, fontSize: 14 }}>{sev.label}</div>
          <div style={{ fontSize: 13, color: "#4b5060", marginTop: 2 }}>
            {Math.round((alert.anomaly_count / (total || 1)) * 100)}% of monitored days showed unusual activity
          </div>
        </div>
      </div>

      {/* Type breakdown */}
      {Object.keys(typeCounts).length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e8eaf0", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 14 }}>What was detected</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
            <DonutChart typeCounts={typeCounts} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              {Object.entries(typeCounts).map(([type, count]) => {
                const m   = tm(type);
                const pct = alert.anomaly_count > 0 ? Math.round((count / alert.anomaly_count) * 100) : 0;
                return (
                  <div key={type}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1e1f2e", display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ background: m.bg, border: `1px solid ${m.border}`, borderRadius: 6, padding: "2px 8px", color: m.color, fontSize: 12 }}>
                          {m.icon} {m.friendly}
                        </span>
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{count} day{count !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ height: 6, background: "#f0f1f6", borderRadius: 99, overflow: "hidden", marginBottom: 5 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: m.color, borderRadius: 99, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{m.desc}</div>
                    <div style={{ fontSize: 12, color: m.color, fontWeight: 500, marginTop: 3 }}>💡 {m.action}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Anomaly log */}
      {anomalies.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e8eaf0", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              Unusual days — {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["all", ...Object.keys(typeCounts)].map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  background: filter === f ? "#6366f1" : "#f0f1f8",
                  color:      filter === f ? "#fff"     : "#6366f1",
                  border: "none", borderRadius: 20, padding: "4px 12px",
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {f === "all" ? `All (${anomalies.length})` : `${tm(f).icon} ${tm(f).friendly}`}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 12, padding: "6px 14px", fontSize: 10, fontWeight: 700, color: "#b0b5c4", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <span>Date</span><span>Type of change</span><span>Description</span>
            </div>
            {filtered.map((a, i) => {
              const m = tm(a.anomaly_type);
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "90px 1fr 1fr",
                  alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: 10, background: i % 2 === 0 ? "#fafafa" : "#fff",
                  borderLeft: `3px solid ${m.color}`,
                }}>
                  <span style={{ color: "#374151", fontWeight: 600, fontSize: 13 }}>{a.date || "—"}</span>
                  <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", width: "fit-content" }}>
                    {m.icon} {m.friendly}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{m.desc}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════
export default function Alerts() {
  const navigate = useNavigate();
  const [alerts,      setAlerts]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [openId,      setOpenId]      = useState(null);
  const [sendState,   setSendState]   = useState({});

  const fetchAlerts = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      // ── 1. Fetch from alerts table (user's own alerts) ────
      const r    = await fetch(`${API}/alerts`, { headers: h() });
      const data = await r.json();
      const alertsList = (Array.isArray(data) ? data : []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      // ── 2. Fetch from analysis_results (catches any that
      //       didn't generate an alert row, e.g. old runs) ──
      const r2   = await fetch(`${API}/analyze/results`, { headers: h() }).catch(() => null);
      const res2 = r2?.ok ? await r2.json().catch(() => []) : [];
      const analysisAlerts = (Array.isArray(res2) ? res2 : [])
        .filter(r => r.total_anomalies > 0)
        .map(r => ({
          id:                 `ar-${r.id}`,   // synthetic id to avoid collision
          user_id:            r.user_id,
          home_id:            r.home_id,
          analysis_result_id: r.id,
          home_name:          r.home_name,
          file_name:          r.file_name,
          pipeline:           r.pipeline,
          anomaly_count:      r.total_anomalies,
          total_days:         r.total_days,
          type_counts:        r.type_counts,
          anomalies:          r.anomalies,
          is_read:            true,
          created_at:         r.analyzed_at || r.created_at,
          _synthetic:         true,
        }));

      // ── 3. Merge: real alerts first, then any analysis
      //       results not already covered by a real alert ──
      const coveredResultIds = new Set(
        alertsList.map(a => a.analysis_result_id).filter(Boolean)
      );
      const extraFromAnalysis = analysisAlerts.filter(
        a => !coveredResultIds.has(a.analysis_result_id)
      );

      const merged = [...alertsList, ...extraFromAnalysis].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      setAlerts(merged);
    } catch {
      if (!silent) setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(() => fetchAlerts(true), 30_000);
    return () => clearInterval(interval);
  }, []);

  const markRead = async (id) => {
    const alert = alerts.find(a => a.id === id);
    if (alert?._synthetic) return;
    await fetch(`${API}/alerts/${id}/read`, { method: "PATCH", headers: h() });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  };

  const toggleOpen = (id) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  // ✅ FIXED: navigate to MessageDoctor so the user types their own message
  const handleSendToDoctor = (alertId) => {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert?.analysis_result_id) return;
    navigate(`/messages?resultId=${alert.analysis_result_id}`);
  };

  const unread = alerts.filter((a) => !a.is_read).length;

  return (
    <div style={{ color: "#1e1f2e", fontFamily: "'DM Sans', sans-serif", maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 10 }}>
            🔔 Alerts
            {unread > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 700 }}>
                {unread} new
              </span>
            )}
          </h1>
          <p style={{ color: "#9196a8", fontSize: 14, margin: 0 }}>
            Unusual activity detected in your monitored homes
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => fetchAlerts(true)}
            disabled={refreshing}
            style={{ background: "#f8f9fc", color: "#6366f1", border: "1px solid #c7d2fe", borderRadius: 10, padding: "9px 14px", fontSize: 13, cursor: refreshing ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
          >
            {refreshing ? "⏳" : "🔄"} Refresh
          </button>
          {unread > 0 && (
            <button
              onClick={async () => { for (const a of alerts.filter((x) => !x.is_read)) await markRead(a.id); }}
              style={{ background: "#f8f9fc", color: "#4b5060", border: "1px solid #e2e5ef", borderRadius: 10, padding: "9px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#b0b5c4", padding: 48, textAlign: "center" }}>Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
          <p style={{ color: "#9196a8", fontSize: 15 }}>No alerts yet — everything looks normal.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {alerts.map((a) => {
            const isOpen     = openId === a.id;
            const typeCounts = safeObject(a.type_counts);
            const state      = sendState[a.id] || "idle";
            const sev        = severity(a.anomaly_count, a.total_days);
            const date       = new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
            const time       = new Date(a.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

            return (
              <div key={a.id} style={{
                background: "#fff",
                border: `1px solid ${!a.is_read ? "#c7d2fe" : "#e8eaf0"}`,
                borderRadius: 16, overflow: "hidden",
                boxShadow: !a.is_read ? "0 0 0 3px rgba(99,102,241,0.08)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 22px" }}>

                  {/* Unread dot */}
                  <div style={{
                    width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                    background: a.is_read ? "#d1d5db" : "#6366f1",
                    boxShadow: a.is_read ? "none" : "0 0 0 3px rgba(99,102,241,0.2)",
                  }} />

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: a.is_read ? "#374151" : "#1e1f2e" }}>
                        {a.anomaly_count} unusual day{a.anomaly_count !== 1 ? "s" : ""} detected
                      </span>
                      <span style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                        {sev.label === "High concern" ? "🚨" : sev.label === "Worth watching" ? "👀" : "ℹ️"} {sev.label}
                      </span>
                      {Object.entries(typeCounts).map(([type, count]) => {
                        const m = tm(type);
                        return (
                          <span key={type} style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                            {m.icon} {m.friendly} ({count})
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7280", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                      <span>🏠 {a.home_name}</span>
                      <span>📅 {a.total_days} days monitored</span>
                      <span style={{ color: "#9196a8" }}>🕐 {date} at {time}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => handleSendToDoctor(a.id)}
                      style={{
                        background: "#6366f1",
                        color: "#fff", border: "none", borderRadius: 9,
                        padding: "8px 16px", fontSize: 13, fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "background 0.2s",
                      }}
                    >
                      📩 Message Doctor
                    </button>

                    <button
                      onClick={() => { toggleOpen(a.id); if (!a.is_read) markRead(a.id); }}
                      style={{
                        background: isOpen ? "#6366f1" : "#eef2ff", color: isOpen ? "#fff" : "#6366f1",
                        border: "none", borderRadius: 9, padding: "8px 14px",
                        fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {isOpen ? "▲ Hide" : "▼ Details"}
                    </button>

                    {!a.is_read && (
                      <button
                        onClick={() => markRead(a.id)}
                        style={{ background: "#f8f9fc", color: "#6b7280", border: "1px solid #e2e5ef", borderRadius: 9, padding: "8px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        ✓ Read
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && <DetailPanel alert={a} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}