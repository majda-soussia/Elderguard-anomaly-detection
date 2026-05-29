import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

import {
  Chart,
  ArcElement,
  Tooltip,
  Legend,
  DoughnutController,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
Chart.register(ArcElement, Tooltip, Legend, DoughnutController, BarController, BarElement, CategoryScale, LinearScale);

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const authHeaders = () => ({ Authorization: `Bearer ${authService.getToken()}` });

// ── Human-readable labels ────────────────────────────────
const FRIENDLY_TITLE = {
  "Temporal Shift": "Unusual behavior detected",
  "Duration":       "Change in daily routine",
  "Order":          "Unusual behavior detected",
  "Unknown":        "Minor routine variation",
};
const FRIENDLY_SUB = {
  "Temporal Shift": "Activity pattern differed from the usual daily schedule",
  "Duration":       "Activity periods were shorter or longer than normal",
  "Order":          "Daily activities happened in an unexpected order",
  "Unknown":        "A small deviation from the usual pattern was recorded",
};
const FRIENDLY_TYPE = {
  "Temporal Shift": "Routine change",
  "Duration":       "Activity duration",
  "Order":          "Schedule shift",
  "Unknown":        "Minor change",
};
const FRIENDLY_TIME = {
  "Temporal Shift": "Morning / Evening period",
  "Duration":       "Throughout the day",
  "Order":          "Morning & Evening",
  "Unknown":        "Daytime",
};
const FRIENDLY_CHANGE = {
  "Temporal Shift": "Activities shifted ~2–4 hours from usual time",
  "Duration":       "Activity duration reduced or extended significantly",
  "Order":          "Morning and evening routines were swapped",
  "Unknown":        "Minor deviation, within acceptable range",
};
const FRIENDLY_ACTION = {
  "Temporal Shift": "Check in with the resident and note any changes in sleep or meals",
  "Duration":       "Monitor over the next few days and consult the doctor if it continues",
  "Order":          "Consider contacting the family and scheduling a doctor review",
  "Unknown":        "No immediate action needed — continue regular monitoring",
};
const ALERT_COLOR = {
  "Temporal Shift": "#ef4444",
  "Duration":       "#d97706",
  "Order":          "#ef4444",
  "Unknown":        "#6366f1",
};

// ── Helper: safely parse JSONB that may come as a string ────
const safeParseJSON = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
};

// ── Donut center-text plugin ─────────────────────────────
const centerTextPlugin = {
  id: "centerText",
  beforeDraw(chart) {
    const { width, height, ctx } = chart;
    const pct = chart.data.datasets[0]?._safePct ?? "";
    ctx.save();
    ctx.font = "500 19px 'DM Sans', sans-serif";
    ctx.fillStyle = "#10b981";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pct, width / 2, height / 2 - 9);
    ctx.font = "400 11px 'DM Sans', sans-serif";
    ctx.fillStyle = "#9196a8";
    ctx.fillText("safe", width / 2, height / 2 + 11);
    ctx.restore();
  },
};

export default function Dashboard() {
  const navigate  = useNavigate();
  const chartRef      = useRef(null);
  const chartInst     = useRef(null);
  const barChartRef   = useRef(null);
  const barChartInst  = useRef(null);
  const typeChartRef  = useRef(null);
  const typeChartInst = useRef(null);

  const user        = authService.getUser?.() || null;
  const role        = user?.role || "caregiver";
  const isCaregiver = role === "caregiver";

  const [data,       setData]      = useState(null);
  const [alerts,     setAlerts]    = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState("");
  const [expanded,   setExpanded]  = useState({});
  const [notif,      setNotif]     = useState({});
  const [showReport, setShowReport]= useState(false);
  const [reportData, setReportData]= useState(null);
  const [reportLoad, setReportLoad]= useState(false);

  const [latestResult, setLatestResult] = useState(null);

  useEffect(() => {
    const headers = authHeaders();
    Promise.all([
      fetch(`${API}/dashboard/stats`, { headers }).then(r => r.json()),
      fetch(`${API}/alerts`,          { headers }).then(r => r.json()).catch(() => []),
      // Also fetch analysis results directly — most reliable source for "last analysis"
      fetch(`${API}/analyze/results`, { headers }).then(r => r.json()).catch(() => []),
    ])
      .then(([d, a, results]) => {
        if (d.detail) throw new Error(d.detail);
        setData(d);
        setAlerts(Array.isArray(a) ? a.slice(0, 6) : []);

        // Pick the most recent analysis result for the current user
        if (Array.isArray(results) && results.length > 0) {
          // Sort by analyzed_at or created_at descending, take first
          const sorted = [...results].sort((x, y) => {
            const da = new Date(x.analyzed_at || x.created_at || 0).getTime();
            const db = new Date(y.analyzed_at || y.created_at || 0).getTime();
            return db - da;
          });
          setLatestResult(sorted[0]);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stats  = data?.stats  || {};
  // Use direct analysis result as the source of truth for "latest";
  // fall back to what the dashboard/stats endpoint returns
  const latest = latestResult || data?.latest || null;
  const recent = data?.recentAnomalies || [];

  // Build anomaly list from alerts (each alert has an anomalies array)
  const anomalyList = alerts.flatMap((alert) =>
    safeParseJSON(alert.anomalies).map((a) => ({
      ...a,
      home_name:    alert.home_name,
      analysis_id:  alert.analysis_result_id,
    }))
  ).slice(0, 6);

  // Donut uses latest analysis run (not cumulative)
  const donutTotal   = latest ? (latest.total_days      ?? 0) : 0;
  const donutAlert   = latest ? (latest.total_anomalies ?? 0) : 0;
  const donutClean   = donutTotal - donutAlert;
  const donutSafePct = donutTotal > 0
    ? `${((donutClean / donutTotal) * 100).toFixed(1)}%`
    : "—";

  // Stat cards use cumulative totals
  const totalCleanDays = stats.total_clean_days ?? 0;
  const totalAlertDays = stats.total_anomalies  ?? 0;

  // Build / update donut
  useEffect(() => {
    if (!chartRef.current || loading) return;
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null; }

    const dataset = {
      data: [donutClean > 0 ? donutClean : 1, donutAlert],
      backgroundColor: ["#10b981", "#ef4444"],
      borderWidth: 0,
      hoverOffset: 4,
    };
    dataset._safePct = donutSafePct;

    chartInst.current = new Chart(chartRef.current, {
      type: "doughnut",
      data: { datasets: [dataset] },
      options: {
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.dataIndex === 0
                  ? `Safe days: ${donutClean}`
                  : `Alert days: ${donutAlert}`,
            },
          },
        },
        animation: { duration: 500 },
      },
      plugins: [centerTextPlugin],
    });

    return () => {
      if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null; }
    };
  }, [loading, donutClean, donutAlert, donutSafePct]);

  // ── Anomaly frequency bar chart (by month) ──────────────
  useEffect(() => {
    if (!barChartRef.current || loading) return;
    if (barChartInst.current) { barChartInst.current.destroy(); barChartInst.current = null; }

    // Aggregate anomalies by month from all alerts
    const allAnomalies = alerts.flatMap(a => safeParseJSON(a.anomalies));
    const monthCounts = {};
    allAnomalies.forEach(a => {
      if (!a.date) return;
      const d = new Date(a.date);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    });

    const sortedKeys = Object.keys(monthCounts).sort();
    const labels = sortedKeys.map(k => {
      const [y, m] = k.split("-");
      return new Date(+y, +m-1).toLocaleDateString("en-GB", { month:"short", year:"2-digit" });
    });
    const values = sortedKeys.map(k => monthCounts[k]);

    if (labels.length === 0) return;

    barChartInst.current = new Chart(barChartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Anomalies",
          data: values,
          backgroundColor: "rgba(99,102,241,0.75)",
          borderRadius: 6,
          borderSkipped: false,
          hoverBackgroundColor: "#6366f1",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `Month: ${items[0].label}`,
              label: (item) => ` ${item.raw} anomalies detected`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: "#9196a8" },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#f1f2f6" },
            ticks: { font: { size: 11 }, color: "#9196a8", stepSize: 1 },
          },
        },
        animation: { duration: 600 },
      },
    });

    return () => { if (barChartInst.current) { barChartInst.current.destroy(); barChartInst.current = null; } };
  }, [loading, alerts]);

  // ── Anomaly type breakdown horizontal bar ────────────────
  useEffect(() => {
    if (!typeChartRef.current || loading) return;
    if (typeChartInst.current) { typeChartInst.current.destroy(); typeChartInst.current = null; }

    const typeCounts = latest?.type_counts
      ? (typeof latest.type_counts === "string" ? JSON.parse(latest.type_counts) : latest.type_counts)
      : {};

    const entries = Object.entries(typeCounts);
    if (entries.length === 0) return;

    const COLORS = {
      "Temporal Shift": "#6366f1",
      "Duration":       "#f59e0b",
      "Order":          "#ec4899",
      "Unknown":        "#9ca3af",
    };

    const labels = entries.map(([t]) => t);
    const values = entries.map(([, v]) => v);
    const colors = labels.map(l => COLORS[l] || "#6366f1");

    typeChartInst.current = new Chart(typeChartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Count",
          data: values,
          backgroundColor: colors.map(c => `${c}cc`),
          borderRadius: 6,
          borderSkipped: false,
          hoverBackgroundColor: colors,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (item) => ` ${item.raw} days` },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: "#f1f2f6" },
            ticks: { font: { size: 11 }, color: "#9196a8", stepSize: 1 },
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 12, weight: "500" }, color: "#4b5060" },
          },
        },
        animation: { duration: 600 },
      },
    });

    return () => { if (typeChartInst.current) { typeChartInst.current.destroy(); typeChartInst.current = null; } };
  }, [loading, latest]);

  const handleNotif = async (key) => {
    setNotif((n) => ({ ...n, [key]: "sending" }));
    await new Promise((r) => setTimeout(r, 800));
    setNotif((n) => ({ ...n, [key]: "sent" }));
  };

  const toggleExpand = (i) =>
    setExpanded((e) => ({ ...e, [i]: !e[i] }));

  // Open full report modal — fetch anomaly details for latest analysis
  const openReport = async () => {
    if (!latest) return;
    setShowReport(true);
    // If we already have full anomaly data from latestResult, use it directly
    if (latestResult) {
      const anomalies = safeParseJSON(latestResult.anomalies);
      const type_counts = typeof latestResult.type_counts === "string"
        ? JSON.parse(latestResult.type_counts)
        : (latestResult.type_counts || {});
      setReportData({ ...latestResult, anomalies, type_counts });
      return;
    }
    if (reportData?.id === latest.id) return; // already loaded
    setReportLoad(true);
    try {
      const res = await fetch(`${API}/analyze/results`, { headers: authHeaders() });
      const all = await res.json();
      const found = Array.isArray(all) ? all.find(r => r.id === latest.id) : null;
      const raw = found || latest;
      const anomalies = safeParseJSON(raw.anomalies);
      const type_counts = typeof raw.type_counts === "string"
        ? JSON.parse(raw.type_counts)
        : (raw.type_counts || {});
      setReportData({ ...raw, anomalies, type_counts });
    } catch {
      setReportData({ ...latest, anomalies: safeParseJSON(latest.anomalies), type_counts: latest.type_counts || {} });
    } finally {
      setReportLoad(false);
    }
  };

  const greet = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="dash">
      {/* Header — no Add Home (admin only) */}
      <div className="dash-header">
        <div>
          <h1>{greet()}{user?.name ? `, ${user.name}` : ""}</h1>
          <p>Here's the wellbeing summary for your monitored resident</p>
        </div>
        <button className="btn primary" onClick={() => navigate("/activity")}>
          Run Check
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <div className="loading"><div className="spinner" /><p>Loading…</p></div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="stat-row">
            {[
              { label: "Homes monitored",     value: stats.total_homes    ?? 0, color: "#6366f1" },
              { label: "Safe days recorded",  value: totalCleanDays,            color: "#10b981" },
              { label: "Days with alerts",    value: totalAlertDays,            color: "#ef4444" },
            ].map((s) => (
              <div key={s.label} className="stat-card">
                <div className="stat-label">{s.label}</div>
                <div className="stat-val" style={{ color: s.color }}>{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Last check banner */}
          {latest && (
            <div className="overview-card">
              <div className="card-title">Last monitoring check</div>
              <div className="last-check-row">
                <div className="check-info">
                  <div className="home-badge">🏠 {latest.home_name || "—"}</div>
                  <div>
                    <div className={latest.total_anomalies > 0 ? "status-warn" : "status-ok"}>
                      {latest.total_anomalies > 0
                        ? `${latest.total_anomalies} unusual day${latest.total_anomalies > 1 ? "s" : ""} detected`
                        : "All clear — no unusual activity"}
                    </div>
                    <div className="check-meta">
                      Checked on {new Date(latest.analyzed_at || latest.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      &nbsp;·&nbsp;{latest.total_days} days analyzed
                    </div>
                  </div>
                </div>
                <button className="btn" onClick={openReport}>View full report</button>
              </div>
            </div>
          )}

          {/* Main grid: donut + alerts */}
          <div className="main-grid">
            {/* Donut */}
            <div className="card">
              <div className="card-title">
                Latest check overview
                {latest && (
                  <span className="donut-sub">
                    {latest.home_name} · {new Date(latest.analyzed_at || latest.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
              {!latest ? (
                <div className="empty-state">Run a check to see the activity overview</div>
              ) : (
                <div className="donut-wrap">
                  <canvas ref={chartRef} width="160" height="160" />
                  <div className="donut-legend">
                    <div className="leg-row">
                      <div><span className="leg-dot" style={{ background: "#10b981" }} />Normal days</div>
                      <span style={{ fontWeight: 500 }}>{donutClean.toLocaleString()}</span>
                    </div>
                    <div className="leg-row">
                      <div><span className="leg-dot" style={{ background: "#ef4444" }} />Days with alerts</div>
                      <span style={{ fontWeight: 500, color: "#ef4444" }}>{donutAlert}</span>
                    </div>
                    <div className="leg-divider">
                      <div className="leg-row">
                        <span className="muted">Alert rate</span>
                        <span style={{ color: donutAlert > 0 ? "#ef4444" : "#10b981", fontWeight: 500, fontSize: 12 }}>
                          {donutTotal > 0 ? `${((donutAlert / donutTotal) * 100).toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Alert cards */}
            <div className="card">
              <div className="card-title">Recent alerts</div>
              {anomalyList.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                  No unusual activity detected in recent checks
                </div>
              ) : (
                <div className="alerts-list">
                  {anomalyList.map((a, i) => {
                    const color  = ALERT_COLOR[a.anomaly_type]    || "#6366f1";
                    const title  = FRIENDLY_TITLE[a.anomaly_type]  || "Unusual behavior detected";
                    const sub    = FRIENDLY_SUB[a.anomaly_type]    || "A deviation from the usual pattern";
                    const type   = FRIENDLY_TYPE[a.anomaly_type]   || "Change";
                    const time   = FRIENDLY_TIME[a.anomaly_type]   || "Daytime";
                    const change = FRIENDLY_CHANGE[a.anomaly_type] || "Deviation recorded";
                    const action = FRIENDLY_ACTION[a.anomaly_type] || "Continue monitoring";
                    const docKey = `doc_${i}`;
                    const famKey = `fam_${i}`;
                    const open   = !!expanded[i];

                    return (
                      <div key={i} className="alert-item">
                        <div className="alert-header" onClick={() => toggleExpand(i)}>
                          <span className="alert-dot" style={{ background: color }} />
                          <div className="alert-main">
                            <div className="alert-title">{title}</div>
                            <div className="alert-sub">{sub}</div>
                          </div>
                          <div className="alert-date">{a.date}</div>
                          <span className={`alert-chevron${open ? " open" : ""}`}>▼</span>
                        </div>
                        {open && (
                          <div className="alert-detail">
                            <div className="detail-grid">
                              <div className="detail-item"><label>Home</label><span>{a.home_name || "—"}</span></div>
                              <div className="detail-item"><label>Alert type</label><span>{type}</span></div>
                              <div className="detail-item"><label>Period affected</label><span>{time}</span></div>
                              <div className="detail-item"><label>What was observed</label><span>{change}</span></div>
                            </div>
                            <div className="suggestion-box">
                              <span className="suggestion-label">Suggestion</span>
                              {action}
                            </div>
                            {isCaregiver && (
                              <div className="detail-actions">
                                <button
                                  className={`act-btn doctor${notif[docKey] === "sent" ? " sent" : ""}`}
                                  disabled={!!notif[docKey]}
                                  onClick={() => handleNotif(docKey)}
                                >
                                  {notif[docKey] === "sending" ? "Sending…"
                                    : notif[docKey] === "sent"  ? "✓ Sent to doctor"
                                    : "Notify doctor"}
                                </button>
                                <button
                                  className={`act-btn family${notif[famKey] === "sent" ? " sent" : ""}`}
                                  disabled={!!notif[famKey]}
                                  onClick={() => handleNotif(famKey)}
                                >
                                  {notif[famKey] === "sending" ? "Sending…"
                                    : notif[famKey] === "sent"  ? "✓ Family notified"
                                    : "Notify family"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="card">
            <div className="card-title">Quick actions</div>
            <div className="actions-grid">
              {[
                { icon: "🔍", label: "Run monitoring check", sub: "Analyze latest activity",  to: "/activity" },
                { icon: "🔔", label: "View all alerts",      sub: "Review notifications",      to: "/alerts"       },
                { icon: "💬", label: "Contact doctor",       sub: "Send a patient report",    to: "/messages"     },
              ].map((a) => (
                <div key={a.label} className="action-card" onClick={() => navigate(a.to)}>
                  <span className="action-icon">{a.icon}</span>
                  <div>
                    <div className="action-label">{a.label}</div>
                    <div className="action-sub">{a.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* ── Charts row ── */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>

            {/* Anomaly frequency over time */}
            <div className="card">
              <div className="card-title">
                📈 Anomaly frequency over time
                <span className="donut-sub">Monthly breakdown</span>
              </div>
              {alerts.length === 0 || safeParseJSON(alerts[0]?.anomalies).length === 0 ? (
                <div className="empty-state">Run a check to see the trend chart</div>
              ) : (
                <div style={{ position:"relative", height:200 }}>
                  <canvas ref={barChartRef} />
                </div>
              )}
            </div>

            {/* Anomaly type breakdown */}
            <div className="card">
              <div className="card-title">
                🧩 Anomaly type breakdown
                <span className="donut-sub">Latest analysis</span>
              </div>
              {!latest?.type_counts || Object.keys(typeof latest.type_counts === "string" ? JSON.parse(latest.type_counts) : latest.type_counts).length === 0 ? (
                <div className="empty-state">No type data available yet</div>
              ) : (
                <div style={{ position:"relative", height:200 }}>
                  <canvas ref={typeChartRef} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Full Report Modal ── */}
      {showReport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowReport(false); }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:780, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,0.18)", display:"flex", flexDirection:"column" }}>

            {/* Modal header */}
            <div style={{ padding:"20px 24px", borderBottom:"1px solid #f1f2f6", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff", zIndex:1, borderRadius:"20px 20px 0 0" }}>
              <div>
                <div style={{ fontSize:18, fontWeight:700, color:"#0f172a" }}>📋 Full Analysis Report</div>
                {reportData && (
                  <div style={{ fontSize:12, color:"#9196a8", marginTop:3 }}>
                    🏠 {reportData.home_name || "—"} &nbsp;·&nbsp; {reportData.pipeline} &nbsp;·&nbsp;
                    {new Date(reportData.analyzed_at || reportData.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
                  </div>
                )}
              </div>
              <button onClick={() => setShowReport(false)} style={{ background:"#f4f6fb", border:"none", borderRadius:8, width:34, height:34, cursor:"pointer", fontSize:16, color:"#9196a8", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>

            <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:20 }}>
              {reportLoad ? (
                <div style={{ textAlign:"center", padding:48, color:"#9196a8" }}>
                  <div style={{ width:36, height:36, border:"3px solid #e8eaf0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
                  Loading report…
                </div>
              ) : reportData ? (
                <>
                  {/* Summary stat row */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                    {[
                      { label:"Total Days",      value: reportData.total_days,      color:"#6366f1" },
                      { label:"Anomalies Found", value: reportData.total_anomalies, color:"#ef4444" },
                      { label:"Normal Days",     value: (reportData.total_days||0)-(reportData.total_anomalies||0), color:"#10b981" },
                      { label:"Anomaly Rate",    value: reportData.total_days > 0 ? `${((reportData.total_anomalies/reportData.total_days)*100).toFixed(1)}%` : "—", color:"#f59e0b" },
                    ].map(s => (
                      <div key={s.label} style={{ background:"#f8fafc", border:"1px solid #e8eaf0", borderRadius:12, padding:"14px 16px" }}>
                        <div style={{ fontSize:11, color:"#9196a8", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>{s.label}</div>
                        <div style={{ fontSize:24, fontWeight:700, color:s.color }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Type breakdown */}
                  {reportData.type_counts && Object.keys(reportData.type_counts).length > 0 && (
                    <div style={{ background:"#f8fafc", border:"1px solid #e8eaf0", borderRadius:12, padding:"16px 18px" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:12 }}>Anomaly Type Breakdown</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
                        {Object.entries(reportData.type_counts).map(([type, count]) => {
                          const col = { "Temporal Shift":"#6366f1","Duration":"#f59e0b","Order":"#ec4899","Unknown":"#9ca3af" }[type] || "#9ca3af";
                          const pct = reportData.total_anomalies > 0 ? Math.round((count/reportData.total_anomalies)*100) : 0;
                          return (
                            <div key={type} style={{ background:"#fff", border:`1px solid ${col}30`, borderRadius:10, padding:"12px 14px" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                                <span style={{ fontSize:12, fontWeight:600, color:col }}>{type}</span>
                                <span style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>{count}</span>
                              </div>
                              <div style={{ height:5, background:"#f1f2f6", borderRadius:99, overflow:"hidden" }}>
                                <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:99 }} />
                              </div>
                              <div style={{ fontSize:11, color:"#9196a8", marginTop:4 }}>{pct}% of anomalies</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Anomaly table */}
                  {Array.isArray(reportData.anomalies) && reportData.anomalies.length > 0 && (
                    <div style={{ background:"#f8fafc", border:"1px solid #e8eaf0", borderRadius:12, padding:"16px 18px" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:12 }}>
                        Detected Anomalies
                        <span style={{ marginLeft:8, background:"#fee2e2", color:"#ef4444", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>
                          {reportData.anomalies.length}
                        </span>
                      </div>
                      <div style={{ overflowX:"auto", borderRadius:8, border:"1px solid #e8eaf0" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                          <thead>
                            <tr style={{ borderBottom:"1px solid #e8eaf0", background:"#f8fafc" }}>
                              {["#","Date","Type","Reconstruction Error"].map(h => (
                                <th key={h} style={{ textAlign:"left", padding:"9px 14px", fontSize:11, fontWeight:600, color:"#9196a8", textTransform:"uppercase", letterSpacing:"0.4px" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.anomalies.map((a, i) => {
                              const col = { "Temporal Shift":"#6366f1","Duration":"#f59e0b","Order":"#ec4899","Unknown":"#9ca3af" }[a.anomaly_type] || "#9ca3af";
                              return (
                                <tr key={i} style={{ borderBottom:"1px solid #f1f2f6" }}>
                                  <td style={{ padding:"10px 14px", color:"#b0b5c4", fontSize:12 }}>{(a.day_index??i)+1}</td>
                                  <td style={{ padding:"10px 14px", color:"#1e293b", fontWeight:500 }}>{a.date}</td>
                                  <td style={{ padding:"10px 14px" }}>
                                    <span style={{ background:`${col}18`, color:col, borderRadius:6, padding:"3px 9px", fontSize:11, fontWeight:700 }}>{a.anomaly_type}</span>
                                  </td>
                                  <td style={{ padding:"10px 14px", fontFamily:"monospace", fontSize:12, color:"#9196a8" }}>{typeof a.reconstruction_error === "number" ? a.reconstruction_error.toFixed(6) : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Footer actions */}
                  <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                    <button onClick={() => { setShowReport(false); navigate("/alerts"); }} style={{ background:"#f4f6fb", color:"#4b5060", border:"1px solid #e2e5ef", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}>
                      🔔 View Alerts
                    </button>
                    <button onClick={() => { setShowReport(false); navigate("/activity"); }} style={{ background:"#6366f1", color:"#fff", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                      ⚡ Run New Analysis
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign:"center", padding:48, color:"#9196a8" }}>No report data available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .dash { color:#1e1f2e; font-family:'DM Sans',sans-serif; max-width:1100px; }

        .dash-header { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:28px; }
        .dash-header h1 { font-size:26px; font-weight:700; margin:0 0 4px; letter-spacing:-0.4px; }
        .dash-header p  { color:#9196a8; font-size:14px; margin:0; }

        .btn { background:#fff; color:#4b5060; border:1px solid #e2e5ef; border-radius:10px; padding:9px 18px; font-size:14px; font-weight:500; cursor:pointer; font-family:inherit; transition:all .15s; }
        .btn:hover { background:#f4f6fb; }
        .btn.primary { background:#6366f1; color:#fff; border-color:transparent; }
        .btn.primary:hover { background:#4f51d0; }

        .alert-error { background:#fef2f2; border:1px solid #fecaca; color:#ef4444; padding:12px 16px; border-radius:10px; font-size:13px; margin-bottom:24px; }

        .stat-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:20px; }
        .stat-card { background:#fff; border:1px solid #e8eaf0; border-radius:14px; padding:18px 20px; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
        .stat-label { font-size:12px; color:#9196a8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; }
        .stat-val   { font-size:28px; font-weight:700; letter-spacing:-1px; }

        .overview-card { background:#fff; border:1px solid #e8eaf0; border-radius:14px; padding:20px 24px; margin-bottom:20px; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
        .card-title { font-size:14px; font-weight:600; color:#2d3048; margin-bottom:14px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .donut-sub  { font-size:11px; color:#9196a8; font-weight:400; }
        .last-check-row { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .check-info { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
        .home-badge  { background:#f4f6fb; border:1px solid #e2e5ef; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:500; }
        .status-ok   { color:#10b981; font-size:14px; font-weight:600; }
        .status-warn { color:#ef4444; font-size:14px; font-weight:600; }
        .check-meta  { font-size:12px; color:#9196a8; margin-top:3px; }

        .main-grid { display:grid; grid-template-columns:240px 1fr; gap:16px; margin-bottom:16px; }
        @media (max-width:768px) { .main-grid { grid-template-columns:1fr; } .charts-row { grid-template-columns:1fr !important; } }

        .card { background:#fff; border:1px solid #e8eaf0; border-radius:16px; padding:22px; box-shadow:0 1px 4px rgba(0,0,0,0.04); margin-bottom:16px; }

        .donut-wrap   { display:flex; flex-direction:column; align-items:center; gap:16px; }
        .donut-legend { width:100%; display:flex; flex-direction:column; gap:8px; }
        .leg-row  { display:flex; align-items:center; justify-content:space-between; font-size:13px; }
        .leg-dot  { width:9px; height:9px; border-radius:50%; display:inline-block; margin-right:7px; flex-shrink:0; }
        .leg-divider { border-top:1px solid #f1f2f6; margin-top:8px; padding-top:8px; }
        .muted { color:#9196a8; font-size:12px; }

        .alerts-list  { display:flex; flex-direction:column; gap:8px; max-height:440px; overflow-y:auto; padding-right:2px; }
        .alert-item   { border:1px solid #e8eaf0; border-radius:12px; overflow:hidden; flex-shrink:0; }
        .alert-header { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer; transition:background .12s; }
        .alert-header:hover { background:#f8f9fc; }
        .alert-dot    { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .alert-main   { flex:1; min-width:0; }
        .alert-title  { font-size:13px; font-weight:600; color:#1e1f2e; margin-bottom:2px; }
        .alert-sub    { font-size:12px; color:#9196a8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .alert-date   { font-size:11px; color:#b0b5c4; white-space:nowrap; margin-left:6px; }
        .alert-chevron { font-size:10px; color:#b0b5c4; margin-left:6px; transition:transform .2s; display:inline-block; }
        .alert-chevron.open { transform:rotate(180deg); }

        .alert-detail    { border-top:1px solid #f1f2f6; padding:14px; background:#fafbfd; }
        .detail-grid     { display:grid; grid-template-columns:1fr 1fr; gap:10px 20px; margin-bottom:12px; }
        .detail-item label { font-size:10px; color:#b0b5c4; text-transform:uppercase; letter-spacing:0.4px; display:block; margin-bottom:3px; }
        .detail-item span  { font-size:13px; color:#1e1f2e; font-weight:500; }
        .suggestion-box    { background:#fff; border:1px solid #e8eaf0; border-radius:8px; padding:10px 12px; font-size:13px; color:#4b5060; margin-bottom:12px; }
        .suggestion-label  { font-size:10px; color:#b0b5c4; text-transform:uppercase; letter-spacing:0.4px; display:block; margin-bottom:4px; }

        .detail-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .act-btn { padding:6px 14px; border-radius:8px; border:1.5px solid; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s; font-family:inherit; background:transparent; }
        .act-btn:disabled { opacity:.55; cursor:not-allowed; }
        .act-btn.doctor { border-color:#a78bfa; color:#7c3aed; background:#f5f3ff; }
        .act-btn.doctor:hover:not(:disabled) { background:#7c3aed; color:#fff; }
        .act-btn.family { border-color:#7dd3fc; color:#0369a1; background:#e0f2fe; }
        .act-btn.family:hover:not(:disabled) { background:#0369a1; color:#fff; }
        .act-btn.sent   { border-color:#6ee7b7 !important; color:#065f46 !important; background:#ecfdf5 !important; }

        .actions-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
        .action-card  { display:flex; align-items:center; gap:12px; background:#f8f9fc; border:1px solid #e8eaf0; border-radius:12px; padding:14px; cursor:pointer; transition:all .15s; }
        .action-card:hover { background:#eef0fb; border-color:#c5c7f0; transform:translateY(-1px); }
        .action-icon  { font-size:22px; }
        .action-label { font-size:13px; font-weight:600; color:#1e1f2e; margin-bottom:2px; }
        .action-sub   { font-size:11px; color:#9196a8; }

        .empty-state { text-align:center; padding:32px 0; color:#b0b5c4; font-size:13px; }
        .loading { display:flex; flex-direction:column; align-items:center; padding:80px 0; gap:16px; color:#9196a8; }
        .spinner { width:34px; height:34px; border:3px solid #e8eaf0; border-top-color:#6366f1; border-radius:50%; animation:spin 0.8s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}