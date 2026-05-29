import { useState, useEffect } from "react";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const authHeaders = () => ({ Authorization: `Bearer ${authService.getToken()}` });

// ── Friendly language maps ────────────────────────────────
const TYPE_FRIENDLY = {
  "Temporal Shift": {
    label:  "Routine timing change",
    icon:   "🕐",
    color:  "#6366f1",
    bg:     "#eef2ff",
    border: "#c7d2fe",
    desc:   "Activities happened at an unusual time of day",
    tip:    "Check in with your resident — ask if their sleep or meal schedule has changed.",
  },
  "Duration": {
    label:  "Activity duration change",
    icon:   "⏳",
    color:  "#f59e0b",
    bg:     "#fffbeb",
    border: "#fde68a",
    desc:   "An activity lasted much longer or shorter than usual",
    tip:    "Monitor over the next few days. Contact the doctor if it continues.",
  },
  "Order": {
    label:  "Daily routine reordered",
    icon:   "🔄",
    color:  "#10b981",
    bg:     "#ecfdf5",
    border: "#a7f3d0",
    desc:   "The usual order of daily activities was changed",
    tip:    "If this keeps happening, consider scheduling a doctor review.",
  },
  "Unknown": {
    label:  "Minor variation",
    icon:   "ℹ️",
    color:  "#9ca3af",
    bg:     "#f9fafb",
    border: "#e5e7eb",
    desc:   "A small deviation from the usual pattern",
    tip:    "No immediate action needed — continue regular monitoring.",
  },
};
const ft = (type) => TYPE_FRIENDLY[type] || TYPE_FRIENDLY["Unknown"];

// ── Severity based on anomaly rate ───────────────────────
function getSeverity(count, total) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  if (pct >= 30) return { label: "Needs attention",   color: "#ef4444", bg: "#fef2f2", border: "#fecaca", icon: "🚨" };
  if (pct >= 10) return { label: "Worth monitoring",  color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: "👀" };
  return           { label: "Looking good",         color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0", icon: "✅" };
}

export default function Analysis() {
  const [datasets,   setDatasets]   = useState([]);
  const [homes,      setHomes]      = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [result,     setResult]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [fetching,   setFetching]   = useState(true);
  const [error,      setError]      = useState("");
  const [fetchError, setFetchError] = useState("");
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    const headers = authHeaders();
    setFetching(true);
    setFetchError("");

    Promise.all([
      fetch(`${API}/homes`, { headers })
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
      fetch(`${API}/datasets`, { headers })
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
    ])
      .then(([homesData, datasetsData]) => {
        const homesList    = Array.isArray(homesData)    ? homesData    : [];
        const datasetsList = Array.isArray(datasetsData) ? datasetsData : [];
        setHomes(homesList);

        // If datasets came back empty, try fetching per-home as fallback
        if (datasetsList.length === 0 && homesList.length > 0) {
          return Promise.all(
            homesList.map(h =>
              fetch(`${API}/datasets?home_id=${h.id}`, { headers })
                .then(r => r.ok ? r.json() : [])
                .catch(() => [])
            )
          ).then(results => {
            const flat = results.flat().filter(Boolean);
            setDatasets(flat);
          });
        } else {
          setDatasets(datasetsList);
        }
      })
      .catch(() => setFetchError("Failed to load monitoring files. Make sure you are logged in."))
      .finally(() => setFetching(false));
  }, []);

  const homeName = (homeId) =>
    homes.find(h => h.id === homeId)?.name || `Home #${homeId}`;

  const selectedDataset = datasets.find(d => d.id === Number(selectedId));

  // Group datasets by home for display
  const datasetsByHome = datasets.reduce((acc, d) => {
    const key = d.home_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  const handleAnalyze = async () => {
    if (!selectedId) return setError("Please select a monitoring file.");
    setError(""); setResult(null); setLoading(true); setPage(1);
    try {
      const res = await fetch(`${API}/analyze/${selectedId}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline: "simulator" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Check failed. Please try again.");
      setResult(data);
      setSearch(""); setTypeFilter("All");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pct = result
    ? Math.round((result.total_anomalies / result.total_days) * 100)
    : 0;

  const severity = result ? getSeverity(result.total_anomalies, result.total_days) : null;

  const filteredAnomalies = (result?.anomalies || []).filter(a => {
    const matchType   = typeFilter === "All" || a.anomaly_type === typeFilter;
    const matchSearch = (a.date || "").includes(search) ||
      ft(a.anomaly_type).label.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const totalPages = Math.ceil(filteredAnomalies.length / PAGE_SIZE);
  const paginated  = filteredAnomalies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const card = {
    background: "#ffffff", border: "1px solid #e8eaf0",
    borderRadius: 16, padding: 24, marginBottom: 24,
  };

  if (fetching) {
    return (
      <div style={{ color: "#9aa0b4", fontSize: 14, paddingTop: 40, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 18, height: 18, border: "2px solid #e8eaf0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        Loading monitoring files…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ color: "#1e293b", fontFamily: "'DM Sans', sans-serif", maxWidth: 960 }}>

      {/* ── Header ── */}
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>
        Daily Activity Check
      </h1>
      <p style={{ color: "#9aa0b4", fontSize: 14, margin: "0 0 28px" }}>
        Analyse your resident's daily routine and detect any unusual changes
      </p>

      {/* ── Step 1: Select file ── */}
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "#374151" }}>
          Run a monitoring check
        </h2>
        <p style={{ fontSize: 13, color: "#9aa0b4", margin: "0 0 20px" }}>
          Select the monitoring file for your resident's home and click the button to start the check.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#9aa0b4", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 7 }}>
              Monitoring file *
            </span>

            {datasets.length > 0 ? (
              <select
                value={selectedId}
                onChange={e => { setSelectedId(e.target.value); setResult(null); setError(""); }}
                style={{ background: "#f8f9fc", border: "1px solid #e8eaf0", borderRadius: 10, padding: "10px 13px", color: selectedId ? "#1e293b" : "#9aa0b4", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%" }}
              >
                <option value="">— Choose a monitoring file —</option>
                {/* Grouped by home */}
                {Object.entries(datasetsByHome).map(([homeId, dsets]) => (
                  <optgroup key={homeId} label={`🏠 ${homeName(Number(homeId))}`}>
                    {dsets.map(d => {
                      const uploadDate = d.upload_date || d.created_at
                        ? new Date(d.upload_date || d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : null;
                      const days = d.duration || d.total_days || null;
                      return (
                        <option key={d.id} value={d.id}>
                          {d.file_name || d.name || `Dataset #${d.id}`}
                          {days ? ` — ${days} days` : ""}
                          {uploadDate ? ` (${uploadDate})` : ""}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            ) : (
              <div style={{ padding: "10px 14px", background: "#f8f9fc", border: "1px solid #e8eaf0", borderRadius: 10, fontSize: 13, color: "#9aa0b4" }}>
                {fetchError
                  ? `⚠️ ${fetchError}`
                  : homes.length === 0
                    ? "No homes found. Please add a home in the Data page first."
                    : "No monitoring files found for your homes. Please upload a file in the Data page."}
              </div>
            )}
          </div>

          {selectedDataset && (
            <div style={{ fontSize: 12, color: "#9aa0b4", paddingBottom: 10, display: "flex", flexDirection: "column", gap: 3 }}>
              <span>🏠 {homeName(selectedDataset.home_id)}</span>
              {(selectedDataset.upload_date || selectedDataset.created_at) && (
                <span>📅 Uploaded {new Date(selectedDataset.upload_date || selectedDataset.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              )}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading || !selectedId}
            style={{
              background: loading || !selectedId ? "#c7d2fe" : "#6366f1",
              color: "#fff", border: "none", borderRadius: 10,
              padding: "11px 28px", fontSize: 14, fontWeight: 700,
              cursor: loading || !selectedId ? "not-allowed" : "pointer",
              fontFamily: "inherit", whiteSpace: "nowrap", transition: "background 0.2s",
              boxShadow: loading || !selectedId ? "none" : "0 4px 14px rgba(99,102,241,0.3)",
            }}
          >
            {loading ? "⏳ Running check…" : "🔍 Start check"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {loading && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, color: "#9aa0b4", fontSize: 13 }}>
            <div style={{ width: 20, height: 20, border: "2px solid #e8eaf0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            Analysing your resident's routine — this usually takes a few seconds…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Overall verdict banner */}
          

          {/* Summary stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Days monitored",  value: result.total_days,                                      color: "#6366f1", icon: "📅" },
              { label: "Unusual days",    value: result.total_anomalies,                                 color: "#ef4444", icon: "⚠️" },
              { label: "Normal days",     value: result.total_days - result.total_anomalies,             color: "#10b981", icon: "✅" },
            ].map(c => (
              <div key={c.label} style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", border: "1px solid #e8eaf0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: c.color, marginBottom: 4 }}>{c.value}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#9aa0b4", textTransform: "uppercase", letterSpacing: "0.5px" }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* What was detected — type breakdown */}
          {result.total_anomalies > 0 && (
            <div style={card}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 18px", color: "#374151" }}>
                What was detected
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                {Object.entries(result.type_counts).map(([type, count]) => {
                  const f     = ft(type);
                  const share = result.total_anomalies > 0 ? Math.round((count / result.total_anomalies) * 100) : 0;
                  return (
                    <div key={type} style={{ background: f.bg, border: `1px solid ${f.border}`, borderRadius: 12, padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 20 }}>{f.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: f.color }}>{f.label}</span>
                        </div>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{count}</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(0,0,0,0.08)", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
                        <div style={{ width: `${share}%`, height: "100%", background: f.color, borderRadius: 99, transition: "width 0.8s ease" }} />
                      </div>
                      <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>{f.desc}</div>
                      <div style={{ fontSize: 12, color: f.color, fontWeight: 600 }}>💡 {f.tip}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unusual days log */}
          {result.anomalies.length > 0 ? (
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#374151" }}>
                  Unusual days log
                  <span style={{ marginLeft: 10, background: "#fef2f2", color: "#ef4444", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                    {filteredAnomalies.length}
                  </span>
                </h2>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    placeholder="Search by date or type…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    style={{ background: "#f8f9fc", border: "1px solid #e8eaf0", borderRadius: 8, padding: "7px 12px", color: "#1e293b", fontSize: 13, outline: "none", fontFamily: "inherit", width: 200 }}
                  />
                  <select
                    value={typeFilter}
                    onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                    style={{ background: "#f8f9fc", border: "1px solid #e8eaf0", borderRadius: 8, padding: "7px 12px", color: "#1e293b", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                  >
                    <option value="All">All changes</option>
                    {Object.keys(result.type_counts).map(t => (
                      <option key={t} value={t}>{ft(t).icon} {ft(t).label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e8eaf0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e8eaf0", background: "#f8f9fc" }}>
                      {["#", "Date", "Type of change", "What was observed"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "11px 16px", fontSize: 11, fontWeight: 600, color: "#9aa0b4", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((a, i) => {
                      const f = ft(a.anomaly_type);
                      return (
                        <tr key={i}
                          style={{ borderBottom: "1px solid #f1f3f7", transition: "background 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#f8f9fc"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <td style={{ padding: "12px 16px", fontSize: 12, color: "#c4c9d4" }}>
                            {(page - 1) * PAGE_SIZE + i + 1}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 14, color: "#374151", fontWeight: 600 }}>
                            {a.date ? new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ background: f.bg, color: f.color, border: `1px solid ${f.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {f.icon} {f.label}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>
                            {f.desc}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 16 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ background: page === 1 ? "#f1f3f7" : "#6366f1", color: page === 1 ? "#c4c9d4" : "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, cursor: page === 1 ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                    ← Previous
                  </button>
                  <span style={{ fontSize: 13, color: "#9aa0b4" }}>
                    Page {page} of {totalPages}
                  </span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ background: page === totalPages ? "#f1f3f7" : "#6366f1", color: page === totalPages ? "#c4c9d4" : "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, cursor: page === totalPages ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                    Next →
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 56, color: "#9aa0b4", fontSize: 15 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
              No unusual activity detected — your resident's routine looks normal.
            </div>
          )}
        </>
      )}
    </div>
  );
}