import { useState, useEffect } from "react";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const authHeaders = () => ({ Authorization: `Bearer ${authService.getToken()}` });

const TYPE_COLOR = {
  "Temporal Shift": { bg: "rgba(99,130,255,0.10)",  text: "#6382ff", dot: "#6382ff",  bar: "linear-gradient(90deg,#6382ff,#8fa4ff)" },
  "Duration":       { bg: "rgba(255,168,70,0.10)",  text: "#f5973a", dot: "#f5973a",  bar: "linear-gradient(90deg,#f5973a,#ffbe7a)" },
  "Order":          { bg: "rgba(236,80,120,0.10)",  text: "#ec5078", dot: "#ec5078",  bar: "linear-gradient(90deg,#ec5078,#f492aa)" },
  "Unknown":        { bg: "rgba(160,160,175,0.10)", text: "#9090a8", dot: "#9090a8",  bar: "linear-gradient(90deg,#9090a8,#b8b8cc)" },
};

const PIPELINES = [
  {
    id:    "refit",
    label: "REFIT",
    sub:   "Real UK household energy data",
    icon:  "🏠",
    accent:"#6382ff",
    tag:   "Real Homes",
  },
  {
    id:    "simulator",
    label: "Simulator",
    sub:   "Synthetic appliance usage scenarios",
    icon:  "⚡",
    accent:"#34c989",
    tag:   "Generated Data",
  },
];

/* ── tiny helpers ── */
const fmt6 = (n) => Number(n).toFixed(6);

export default function AnalysisBoth() {
  const [datasets,   setDatasets]   = useState([]);
  const [homes,      setHomes]      = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [pipeline,   setPipeline]   = useState("refit");
  const [result,     setResult]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [fetching,   setFetching]   = useState(true);
  const [error,      setError]      = useState("");
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/homes`,    { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/datasets`, { headers: authHeaders() }).then(r => r.json()),
    ])
      .then(([h, d]) => { setHomes(Array.isArray(h)?h:[]); setDatasets(Array.isArray(d)?d:[]); })
      .catch(() => setError("Failed to load datasets."))
      .finally(() => setFetching(false));
  }, []);

  const homeName = (id) => homes.find(h => h.id === id)?.name || `Home #${id}`;
  const selDataset  = datasets.find(d => d.id === Number(selectedId));
  const activePL    = PIPELINES.find(p => p.id === pipeline);

  const handleAnalyze = async () => {
    if (!selectedId) return setError("Please select a dataset.");
    setError(""); setResult(null); setLoading(true);
    try {
      const res  = await fetch(`${API}/analyze/${selectedId}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Analysis failed.");
      setResult(data); setSearch(""); setTypeFilter("All");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const pct = result ? Math.round((result.total_anomalies / result.total_days) * 100) : 0;
  const filtered = (result?.anomalies || []).filter(a => {
    const mt = typeFilter === "All" || a.anomaly_type === typeFilter;
    const ms = a.date.includes(search) || a.anomaly_type.toLowerCase().includes(search.toLowerCase());
    return mt && ms;
  });

  if (fetching) return <div style={S.loading}>Loading datasets…</div>;

  return (
    <>
      <style>{CSS}</style>
      <div className="ad-root">

        {/* ── Page header ── */}
        <div className="ad-page-header">
          <div>
            <h1 className="ad-title">Anomaly Detection</h1>
            <p className="ad-sub">Run the Autoencoder model on any uploaded dataset</p>
          </div>
        </div>

        {/* ── Step 1 — Model ── */}
        <section className="ad-card">
          <p className="ad-step-label">Step 1 — Select Model</p>
          <div className="ad-pipeline-grid">
            {PIPELINES.map(p => {
              const active = pipeline === p.id;
              return (
                <button
                  key={p.id}
                  className={`ad-pipeline-btn ${active ? "active" : ""}`}
                  style={active ? {"--accent": p.accent} : {}}
                  onClick={() => { setPipeline(p.id); setResult(null); setError(""); }}
                >
                  <span className="ad-pl-icon">{p.icon}</span>
                  <div className="ad-pl-text">
                    <span className="ad-pl-name">{p.label}</span>
                    <span className="ad-pl-tag">{p.tag}</span>
                  </div>
                  {active && <span className="ad-pl-check">✓</span>}
                  <p className="ad-pl-desc">{p.sub}</p>
                </button>
              );
            })}
          </div>
          {activePL && (
            <p className="ad-pl-hint">
              {activePL.icon} {activePL.sub} — threshold k = 3.0
            </p>
          )}
        </section>

        {/* ── Step 2 — Dataset & Run ── */}
        <section className="ad-card">
          <p className="ad-step-label">Step 2 — Select Dataset &amp; Run</p>
          <div className="ad-run-row">
            <div className="ad-select-wrap">
              <label className="ad-field-label">Dataset *</label>
              <div className="ad-select-box">
                <select
                  value={selectedId}
                  onChange={e => { setSelectedId(e.target.value); setResult(null); setError(""); }}
                  className="ad-select"
                >
                  <option value="">— Choose a dataset —</option>
                  {datasets.map(d => (
                    <option key={d.id} value={d.id}>
                      #{d.id} · {d.file_name} — {homeName(d.home_id)} ({d.duration || "?"} days)
                    </option>
                  ))}
                </select>
                <span className="ad-select-chevron">⌄</span>
              </div>
              {selDataset && (
                <span className="ad-upload-date">
                  Uploaded {new Date(selDataset.upload_date).toLocaleDateString()}
                </span>
              )}
            </div>

            <button
              className="ad-run-btn"
              disabled={loading || !selectedId}
              style={{"--btn-accent": activePL?.accent || "#6382ff"}}
              onClick={handleAnalyze}
            >
              {loading
                ? <><span className="ad-spinner" /> Analyzing…</>
                : <>{activePL?.icon} Run — {activePL?.label}</>}
            </button>
          </div>

          {error && <div className="ad-error">{error}</div>}
          {!fetching && datasets.length === 0 && (
            <p className="ad-empty-hint">
              No datasets found. Go to <strong>Data</strong> page and upload a CSV first.
            </p>
          )}
        </section>

        {/* ══════════════ RESULTS ══════════════ */}
        {result && (
          <div className="ad-results-in">

            {/* pipeline badge */}
            <div className="ad-result-badge-row">
              <span className="ad-result-from">Results from</span>
              <span
                className="ad-result-badge"
                style={{"--badge-color": activePL?.accent || "#6382ff"}}
              >
                {activePL?.icon} {result.pipeline} Model
              </span>
            </div>

            {/* stat cards */}
            <div className="ad-stat-grid">
              {[
                { label: "Total Days",      value: result.total_days,           color: "#6382ff" },
                { label: "Anomalies",       value: result.total_anomalies,      color: "#ec5078" },
                { label: "Anomaly Rate",    value: `${pct}%`,                   color: "#f5973a" },
                { label: "Clean Days",      value: result.total_days - result.total_anomalies, color: "#34c989" },
                { label: "Threshold",       value: result.threshold.toFixed(5), color: "#9090a8" },
              ].map(c => (
                <div key={c.label} className="ad-stat-card">
                  <span className="ad-stat-label">{c.label}</span>
                  <span className="ad-stat-value" style={{color: c.color}}>{c.value}</span>
                </div>
              ))}
            </div>

            {/* type breakdown */}
            <section className="ad-card">
              <p className="ad-section-title">Anomaly Type Breakdown</p>
              <div className="ad-type-grid">
                {Object.entries(result.type_counts).map(([type, count]) => {
                  const col   = TYPE_COLOR[type] || TYPE_COLOR["Unknown"];
                  const share = result.total_anomalies > 0
                    ? Math.round((count / result.total_anomalies) * 100) : 0;
                  return (
                    <div key={type} className="ad-type-card">
                      <div className="ad-type-header">
                        <span className="ad-type-dot" style={{background: col.dot}} />
                        <span className="ad-type-name">{type}</span>
                        <span className="ad-type-pct" style={{color: col.text}}>{share}%</span>
                      </div>
                      <div className="ad-type-count" style={{color: col.text}}>{count}</div>
                      <div className="ad-type-track">
                        <div
                          className="ad-type-fill"
                          style={{width: `${share}%`, background: col.bar}}
                        />
                      </div>
                      <span className="ad-type-days">{count} days flagged</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* anomaly table */}
            {result.anomalies.length > 0 ? (
              <section className="ad-card">
                <div className="ad-table-header">
                  <div className="ad-table-title-row">
                    <p className="ad-section-title" style={{margin:0}}>Detected Anomalies</p>
                    <span className="ad-count-pill">{filtered.length}</span>
                  </div>
                  <div className="ad-filters">
                    <div className="ad-search-wrap">
                      <span className="ad-search-icon">⌕</span>
                      <input
                        className="ad-search"
                        placeholder="Search date or type…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      className="ad-filter-select"
                      value={typeFilter}
                      onChange={e => setTypeFilter(e.target.value)}
                    >
                      <option value="All">All types</option>
                      {Object.keys(result.type_counts).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="ad-table-wrap">
                  <table className="ad-table">
                    <thead>
                      <tr>
                        {["#", "Date", "Anomaly Type", "Reconstruction Error"].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a, i) => {
                        const col = TYPE_COLOR[a.anomaly_type] || TYPE_COLOR["Unknown"];
                        return (
                          <tr key={i} className="ad-tr">
                            <td className="ad-td-idx">{a.day_index + 1}</td>
                            <td className="ad-td-date">{a.date}</td>
                            <td>
                              <span className="ad-type-badge"
                                style={{background: col.bg, color: col.text}}>
                                <span style={{width:6,height:6,borderRadius:"50%",background:col.dot,display:"inline-block",marginRight:6,verticalAlign:"middle"}}/>
                                {a.anomaly_type}
                              </span>
                            </td>
                            <td className="ad-td-err">{fmt6(a.reconstruction_error)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <div className="ad-no-anomalies">✅ No anomalies detected in this dataset.</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ── inline styles for loading only ── */
const S = {
  loading: { color:"#9090a8", fontSize:14, paddingTop:40, fontFamily:"'DM Sans',sans-serif" },
};

/* ══════════════════════════════════════════════════════════════════
   CSS — soft light theme, refined & elegant
══════════════════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  .ad-root {
    font-family: 'DM Sans', sans-serif;
    color: #1a1a2e;
    max-width: 980px;
    padding-bottom: 60px;
  }

  /* ── page header ── */
  .ad-page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
  }
  .ad-title {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: #12122a;
    margin: 0 0 5px;
  }
  .ad-sub {
    font-size: 14px;
    color: #8888a8;
    margin: 0;
    font-weight: 400;
  }

  /* ── card ── */
  .ad-card {
    background: #ffffff;
    border: 1px solid #eaeaf2;
    border-radius: 18px;
    padding: 24px 28px;
    margin-bottom: 20px;
    box-shadow: 0 2px 16px rgba(100,100,160,0.06);
  }

  /* ── step label ── */
  .ad-step-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #aaaacc;
    margin: 0 0 18px;
  }
  .ad-section-title {
    font-size: 14px;
    font-weight: 600;
    color: #2a2a4a;
    margin: 0 0 18px;
    letter-spacing: -0.2px;
  }

  /* ── pipeline buttons ── */
  .ad-pipeline-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
  }
  .ad-pipeline-btn {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto auto;
    gap: 0 12px;
    align-items: center;
    background: #f8f8fc;
    border: 1.5px solid #eaeaf2;
    border-radius: 14px;
    padding: 16px 18px 14px;
    cursor: pointer;
    transition: all 0.18s ease;
    text-align: left;
    font-family: inherit;
  }
  .ad-pipeline-btn:hover {
    background: #f3f3fa;
    border-color: #d0d0e8;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(100,100,180,0.08);
  }
  .ad-pipeline-btn.active {
    background: color-mix(in srgb, var(--accent) 7%, white);
    border-color: var(--accent);
    box-shadow: 0 4px 20px color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .ad-pl-icon {
    font-size: 22px;
    grid-row: 1;
    grid-column: 1;
    line-height: 1;
  }
  .ad-pl-text {
    grid-row: 1;
    grid-column: 2;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ad-pl-name {
    font-size: 15px;
    font-weight: 700;
    color: #12122a;
    letter-spacing: -0.2px;
  }
  .ad-pipeline-btn.active .ad-pl-name {
    color: var(--accent);
  }
  .ad-pl-tag {
    font-size: 11px;
    color: #9090b0;
    font-weight: 500;
  }
  .ad-pl-check {
    grid-row: 1;
    grid-column: 3;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, white);
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ad-pl-desc {
    grid-row: 2;
    grid-column: 1 / -1;
    font-size: 12px;
    color: #9090b0;
    margin: 8px 0 0;
    line-height: 1.5;
    font-weight: 400;
  }
  .ad-pl-hint {
    font-size: 12px;
    color: #aaaacc;
    margin: 0;
    padding: 10px 14px;
    background: #f8f8fc;
    border-radius: 9px;
    border: 1px solid #eaeaf2;
  }

  /* ── run row ── */
  .ad-run-row {
    display: flex;
    gap: 16px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .ad-select-wrap {
    flex: 1;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .ad-field-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #aaaacc;
  }
  .ad-select-box {
    position: relative;
  }
  .ad-select {
    width: 100%;
    appearance: none;
    background: #f8f8fc;
    border: 1.5px solid #eaeaf2;
    border-radius: 11px;
    padding: 11px 40px 11px 14px;
    font-size: 14px;
    color: #12122a;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
    cursor: pointer;
  }
  .ad-select:focus { border-color: #6382ff; }
  .ad-select-chevron {
    position: absolute;
    right: 13px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 16px;
    color: #aaaacc;
    pointer-events: none;
  }
  .ad-upload-date {
    font-size: 12px;
    color: #b8b8d0;
  }
  .ad-run-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--btn-accent, #6382ff);
    color: #fff;
    border: none;
    border-radius: 11px;
    padding: 12px 28px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: -0.2px;
    transition: all 0.18s ease;
    white-space: nowrap;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--btn-accent, #6382ff) 35%, transparent);
  }
  .ad-run-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 22px color-mix(in srgb, var(--btn-accent, #6382ff) 45%, transparent);
  }
  .ad-run-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }
  .ad-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: ad-spin 0.7s linear infinite;
  }
  @keyframes ad-spin { to { transform: rotate(360deg); } }

  .ad-error {
    margin-top: 14px;
    padding: 12px 16px;
    border-radius: 10px;
    background: rgba(236,80,120,0.07);
    border: 1px solid rgba(236,80,120,0.2);
    color: #d84070;
    font-size: 13px;
    font-weight: 500;
  }
  .ad-empty-hint {
    margin-top: 14px;
    font-size: 13px;
    color: #b0b0cc;
  }
  .ad-empty-hint strong { color: #6382ff; }

  /* ── results animation ── */
  .ad-results-in {
    animation: ad-fadein 0.35s ease;
  }
  @keyframes ad-fadein {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── result badge ── */
  .ad-result-badge-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
  }
  .ad-result-from {
    font-size: 13px;
    color: #aaaacc;
  }
  .ad-result-badge {
    background: color-mix(in srgb, var(--badge-color) 10%, white);
    color: var(--badge-color);
    border: 1px solid color-mix(in srgb, var(--badge-color) 22%, transparent);
    border-radius: 8px;
    padding: 4px 14px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.2px;
  }

  /* ── stat cards ── */
  .ad-stat-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  @media (max-width: 780px) {
    .ad-stat-grid { grid-template-columns: repeat(3, 1fr); }
  }
  .ad-stat-card {
    background: #ffffff;
    border: 1px solid #eaeaf2;
    border-radius: 14px;
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 2px 10px rgba(100,100,160,0.05);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .ad-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(100,100,160,0.09);
  }
  .ad-stat-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #c0c0d8;
  }
  .ad-stat-value {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -1px;
    line-height: 1;
  }

  /* ── type breakdown ── */
  .ad-type-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px;
  }
  .ad-type-card {
    background: #f8f8fc;
    border: 1px solid #eaeaf2;
    border-radius: 13px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ad-type-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ad-type-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ad-type-name {
    font-size: 13px;
    font-weight: 600;
    color: #2a2a4a;
    flex: 1;
  }
  .ad-type-pct {
    font-size: 12px;
    font-weight: 700;
  }
  .ad-type-count {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -1.5px;
    line-height: 1;
    margin: 2px 0;
  }
  .ad-type-track {
    height: 5px;
    border-radius: 3px;
    background: #eaeaf2;
    overflow: hidden;
  }
  .ad-type-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 1s cubic-bezier(.16,1,.3,1);
  }
  .ad-type-days {
    font-size: 11px;
    color: #b8b8d0;
    font-weight: 500;
  }

  /* ── anomaly table ── */
  .ad-table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 18px;
  }
  .ad-table-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ad-count-pill {
    background: rgba(236,80,120,0.1);
    color: #ec5078;
    border-radius: 20px;
    padding: 2px 11px;
    font-size: 12px;
    font-weight: 700;
  }
  .ad-filters {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ad-search-wrap {
    position: relative;
  }
  .ad-search-icon {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 16px;
    color: #c0c0d8;
    pointer-events: none;
  }
  .ad-search {
    background: #f8f8fc;
    border: 1.5px solid #eaeaf2;
    border-radius: 9px;
    padding: 8px 13px 8px 32px;
    font-size: 13px;
    color: #12122a;
    font-family: inherit;
    outline: none;
    width: 200px;
    transition: border-color 0.15s;
  }
  .ad-search:focus { border-color: #6382ff; }
  .ad-search::placeholder { color: #c8c8e0; }
  .ad-filter-select {
    background: #f8f8fc;
    border: 1.5px solid #eaeaf2;
    border-radius: 9px;
    padding: 8px 13px;
    font-size: 13px;
    color: #12122a;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .ad-filter-select:focus { border-color: #6382ff; }

  .ad-table-wrap {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid #eaeaf2;
  }
  .ad-table {
    width: 100%;
    border-collapse: collapse;
  }
  .ad-table thead tr {
    border-bottom: 1px solid #eaeaf2;
    background: #f8f8fc;
  }
  .ad-table th {
    text-align: left;
    padding: 11px 16px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #c0c0d8;
  }
  .ad-tr {
    border-bottom: 1px solid #f2f2f8;
    transition: background 0.12s;
  }
  .ad-tr:last-child { border-bottom: none; }
  .ad-tr:hover { background: #fafafd; }
  .ad-table td {
    padding: 12px 16px;
    font-size: 14px;
    color: #3a3a5a;
  }
  .ad-td-idx {
    font-size: 12px !important;
    color: #c8c8e0 !important;
    font-family: 'DM Mono', monospace;
  }
  .ad-td-date {
    font-weight: 500;
    color: #2a2a4a !important;
    font-size: 13px !important;
  }
  .ad-type-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 7px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: -0.1px;
  }
  .ad-td-err {
    font-family: 'DM Mono', monospace;
    font-size: 12px !important;
    color: #a0a0bc !important;
  }

  .ad-no-anomalies {
    text-align: center;
    padding: 56px;
    font-size: 16px;
    color: #b0b0cc;
    font-weight: 500;
    background: #ffffff;
    border: 1px solid #eaeaf2;
    border-radius: 18px;
    box-shadow: 0 2px 16px rgba(100,100,160,0.06);
  }

  .ad-loading {
    color: #9090a8;
    font-size: 14px;
    padding-top: 40px;
  }
`;