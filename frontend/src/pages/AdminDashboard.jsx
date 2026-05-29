import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${authService.getToken()}`,
});

// ── Tiny progress bar ─────────────────────────────────────
function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ height: 4, background: "#f0f1f6", borderRadius: 99, overflow: "hidden", marginTop: 10 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.8s ease" }} />
    </div>
  );
}

// ── Pipeline badge ────────────────────────────────────────
function PipelineBadge({ pipeline }) {
  const isRefit = pipeline === "REFIT";
  return (
    <span style={{
      background: isRefit ? "rgba(99,102,241,0.1)" : "rgba(52,211,153,0.1)",
      color:      isRefit ? "#6366f1"               : "#059669",
      border:     `1px solid ${isRefit ? "rgba(99,102,241,0.25)" : "rgba(52,211,153,0.3)"}`,
      borderRadius: 8, padding: "2px 10px",
      fontSize: 12, fontWeight: 700,
    }}>
      {isRefit ? "🏠" : "⚡"} {pipeline}
    </span>
  );
}

// ── Anomaly type color map ────────────────────────────────
const TYPE_COLOR = {
  "Temporal Shift": { text: "#6366f1", bg: "#eef2ff",  border: "#c7d2fe" },
  "Duration":       { text: "#d97706", bg: "#fffbeb",  border: "#fde68a" },
  "Order":          { text: "#059669", bg: "#ecfdf5",  border: "#a7f3d0" },
  "Unknown":        { text: "#6b7280", bg: "#f9fafb",  border: "#e5e7eb" },
};
const typeStyle = (type) => TYPE_COLOR[type] || TYPE_COLOR["Unknown"];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    fetch(`${API}/admin/stats`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d.detail) throw new Error(d.detail);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stats  = data?.stats  || {};
  const latest = data?.latest || null;
  const recent = data?.recentAnomalies || [];
  const users  = data?.recentUsers     || [];

  const statCards = [
    { label: "Total Homes",     value: stats.total_homes      ?? 0, icon: "🏠", color: "#6366f1", sub: "Monitored homes",       to: "/admin/homes"    },
    { label: "Datasets",        value: stats.total_datasets   ?? 0, icon: "📂", color: "#0ea5e9", sub: "Uploaded CSV files",    to: "/admin/datasets" },
    { label: "Analyses Run",    value: stats.total_analyses   ?? 0, icon: "⚡", color: "#f59e0b", sub: "Model executions",      to: "/admin/analysis" },
    { label: "Anomalies Found", value: stats.total_anomalies  ?? 0, icon: "⚠️", color: "#ef4444", sub: "Across all datasets",   to: "/admin/analysis" },
    { label: "Caregivers",      value: stats.total_users      ?? 0, icon: "👩‍⚕️", color: "#8b5cf6", sub: "Registered users",     to: "/admin/users"    },
    { label: "Clean Days",      value: stats.total_clean_days ?? 0, icon: "✅", color: "#10b981", sub: "No anomaly detected",   to: null              },
  ];

  const maxStat = Math.max(...statCards.map((c) => c.value), 1);

  const quickActions = [
    { icon: "🏠", label: "Manage Homes",    sub: "Add, edit or link homes",       to: "/admin/homes"    },
    { icon: "📂", label: "Manage Datasets", sub: "Upload or delete CSV files",    to: "/admin/datasets" },
    { icon: "⚡", label: "Run Analysis",    sub: "Detect anomalies on a dataset", to: "/admin/analysis" },
    { icon: "👥", label: "Manage Users",    sub: "Assign homes to caregivers",    to: "/admin/users"    },
  ];

  return (
    <div style={{ color: "#1e1f2e", fontFamily: "'DM Sans', sans-serif", maxWidth: 1140 }}>

      {/* ── Page Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>
              Admin Dashboard
            </h1>
            <span style={{
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff", borderRadius: 8,
              padding: "3px 12px", fontSize: 11,
              fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase",
            }}>
              Admin
            </span>
          </div>
          <p style={{ color: "#9196a8", fontSize: 14, margin: 0 }}>
            System overview — manage homes, datasets, analyses and users
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/admin/datasets")} style={ghostBtn}>
            📂 Datasets
          </button>
          <button onClick={() => navigate("/admin/analysis")} style={primaryBtn}>
            ⚡ Run Analysis
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", padding: "12px 16px", borderRadius: 10, fontSize: 13, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* ── Stat Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 28 }}>
            {statCards.map((s) => (
              <div
                key={s.label}
                onClick={() => s.to && navigate(s.to)}
                style={{
                  background: "#fff", border: "1px solid #e8eaf0",
                  borderRadius: 14, padding: "20px 18px",
                  cursor: s.to ? "pointer" : "default",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!s.to) return;
                  e.currentTarget.style.borderColor = s.color;
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = `0 6px 20px ${s.color}22`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e8eaf0";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 10 }}>{s.icon}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: s.color, letterSpacing: "-1px", lineHeight: 1 }}>
                  {s.value.toLocaleString()}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: "6px 0 2px" }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "#9196a8" }}>{s.sub}</div>
                <MiniBar value={s.value} max={maxStat} color={s.color} />
              </div>
            ))}
          </div>

          {/* ── Main Grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

            {/* Last Analysis */}
            <div style={card}>
              <SectionTitle icon="⚡" title="Last Analysis" />
              {latest ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {[
                    { label: "Home", value: `🏠 ${latest.home_name || "—"}` },
                    { label: "File", value: `📄 ${latest.file_name || "—"}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={row}>
                      <span style={lbl}>{label}</span>
                      <span style={{ fontSize: 13, color: "#374151" }}>{value}</span>
                    </div>
                  ))}
                  <div style={row}>
                    <span style={lbl}>Pipeline</span>
                    <PipelineBadge pipeline={latest.pipeline} />
                  </div>
                  <div style={row}>
                    <span style={lbl}>Total Days</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{latest.total_days}</span>
                  </div>
                  <div style={row}>
                    <span style={lbl}>Anomalies</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>
                      {latest.total_anomalies}
                      <span style={{ color: "#9196a8", fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                        ({latest.anomaly_rate}%)
                      </span>
                    </span>
                  </div>
                  <div style={row}>
                    <span style={lbl}>Threshold</span>
                    <span style={{ fontSize: 13, color: "#059669", fontFamily: "monospace", fontWeight: 600 }}>
                      {Number(latest.threshold).toFixed(5)}
                    </span>
                  </div>
                  <div style={row}>
                    <span style={lbl}>Date</span>
                    <span style={{ fontSize: 12, color: "#9196a8" }}>
                      {new Date(latest.analyzed_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Type breakdown pills */}
                  {latest.type_counts && Object.keys(latest.type_counts).length > 0 && (
                    <div style={{ borderTop: "1px solid #f0f1f6", paddingTop: 12, marginTop: 2 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                        Anomaly Types
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {Object.entries(latest.type_counts).map(([type, count]) => {
                          const s = typeStyle(type);
                          return (
                            <span key={type} style={{
                              background: s.bg, color: s.text,
                              border: `1px solid ${s.border}`,
                              borderRadius: 20, padding: "3px 10px",
                              fontSize: 12, fontWeight: 600,
                            }}>
                              {type} · {count}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button onClick={() => navigate("/admin/analysis")} style={{ ...ghostBtn, marginTop: 6, fontSize: 13, padding: "9px 14px" }}>
                    Run new analysis →
                  </button>
                </div>
              ) : (
                <EmptyState message="No analysis run yet.">
                  <button onClick={() => navigate("/admin/analysis")} style={primaryBtn}>
                    ⚡ Run First Analysis
                  </button>
                </EmptyState>
              )}
            </div>

            {/* Recent Anomalies */}
            <div style={card}>
              <SectionTitle icon="⚠️" title="Recent Anomalies" />
              {recent.length === 0 ? (
                <EmptyState message="No anomalies recorded yet." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recent.map((a, i) => {
                    const s = typeStyle(a.anomaly_type);
                    return (
                      <div key={i} style={{
                        padding: "10px 12px",
                        background: "#fafafa", borderRadius: 10,
                        borderLeft: `3px solid ${s.text}`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e1f2e" }}>{a.date}</span>
                          <span style={{
                            background: s.bg, color: s.text,
                            border: `1px solid ${s.border}`,
                            borderRadius: 20, padding: "2px 9px",
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {a.anomaly_type}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#9196a8" }}>
                          🏠 {a.home_name} &nbsp;·&nbsp; Error:&nbsp;
                          <span style={{ fontFamily: "monospace" }}>{a.reconstruction_error?.toFixed(5)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => navigate("/admin/analysis")} style={{ ...ghostBtn, fontSize: 12, padding: "8px 12px", marginTop: 4 }}>
                    View all results →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Recent Users ── */}
          {users.length > 0 && (
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <SectionTitle icon="👥" title="Recent Caregivers" />
                <button onClick={() => navigate("/admin/users")} style={{ ...ghostBtn, fontSize: 12, padding: "7px 14px" }}>
                  Manage all →
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {users.map((u, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    background: "#f8f9fc", border: "1px solid #e8eaf0",
                    borderRadius: 10, padding: "12px 14px",
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "linear-gradient(135deg,#e0e7ff,#c7d2fe)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, flexShrink: 0,
                    }}>
                      👩‍⚕️
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e1f2e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {u.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#9196a8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {u.email}
                      </div>
                    </div>
                    <span style={{
                      background: "#eef2ff", color: "#6366f1",
                      borderRadius: 20, padding: "2px 8px",
                      fontSize: 10, fontWeight: 700,
                      textTransform: "uppercase", flexShrink: 0,
                    }}>
                      {u.role || "caregiver"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Quick Actions ── */}
          <div style={card}>
            <SectionTitle icon="🚀" title="Quick Actions" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              {quickActions.map((a) => (
                <div
                  key={a.label}
                  onClick={() => navigate(a.to)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    background: "#f8f9fc", border: "1px solid #e8eaf0",
                    borderRadius: 12, padding: "16px 18px", cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#eef2ff";
                    e.currentTarget.style.borderColor = "#c7d2fe";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f8f9fc";
                    e.currentTarget.style.borderColor = "#e8eaf0";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <span style={{ fontSize: 26 }}>{a.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1e1f2e", marginBottom: 2 }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: "#9196a8" }}>{a.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────

function SectionTitle({ icon, title }) {
  return (
    <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "#1e1f2e", display: "flex", alignItems: "center", gap: 8 }}>
      <span>{icon}</span> {title}
    </h2>
  );
}

function EmptyState({ message, children }) {
  return (
    <div style={{ textAlign: "center", padding: "28px 16px", color: "#b0b5c4", fontSize: 14 }}>
      <p style={{ margin: "0 0 14px" }}>{message}</p>
      {children}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0", gap: 16, color: "#9196a8" }}>
      <div style={{
        width: 36, height: 36,
        border: "3px solid #e8eaf0", borderTopColor: "#6366f1",
        borderRadius: "50%", animation: "adSpin 0.8s linear infinite",
      }} />
      <p style={{ margin: 0, fontSize: 14 }}>Loading dashboard…</p>
      <style>{`@keyframes adSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Style constants ───────────────────────────────────────
const card = {
  background: "#fff", border: "1px solid #e8eaf0",
  borderRadius: 16, padding: 24,
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

const row = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 };
const lbl = { color: "#9196a8", fontSize: 12, fontWeight: 500 };

const primaryBtn = {
  background: "#6366f1", color: "#fff", border: "none",
  borderRadius: 10, padding: "10px 20px", fontSize: 14,
  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  transition: "background 0.2s",
};

const ghostBtn = {
  background: "#f8f9fc", color: "#4b5060",
  border: "1px solid #e2e5ef", borderRadius: 10,
  padding: "10px 18px", fontSize: 14,
  fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
  transition: "all 0.15s",
};