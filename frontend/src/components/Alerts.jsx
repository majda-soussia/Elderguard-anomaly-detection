import { useEffect, useState } from "react";
import { anomalyService } from "../services/api";

export default function Alerts() {
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all");

  useEffect(() => {
    const load = async () => {
      try { const data = await anomalyService.getResults(); setAlerts(data); }
      catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = alerts.filter((a) => {
    if (filter === "anomaly") return a.is_anomaly;
    if (filter === "normal")  return !a.is_anomaly;
    return true;
  });

  const anomalyCount = alerts.filter((a) => a.is_anomaly).length;

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        <div>
          <h2>Alerts</h2>
          <p>{anomalyCount} anomal{anomalyCount === 1 ? "y" : "ies"} detected</p>
        </div>
        <div className="filter-tabs">
          {["all", "anomaly", "normal"].map((f) => (
            <button key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "anomaly" && anomalyCount > 0 && <span className="tab-badge">{anomalyCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="alert-empty">Loading alerts…</div>
      ) : filtered.length === 0 ? (
        <div className="alert-empty">No {filter !== "all" ? filter : ""} alerts found.</div>
      ) : (
        <div className="alert-list">
          {filtered.slice().reverse().map((alert, i) => (
            <div key={i} className={`alert-item ${alert.is_anomaly ? "is-anomaly" : "is-normal"}`}>
              <div className="alert-dot" />
              <div className="alert-body">
                <div className="alert-title">
                  {alert.is_anomaly ? "⚠ Anomaly Detected" : "✓ Normal Reading"}
                </div>
                <div className="alert-meta">
                  <span>Value: <strong>{typeof alert.value === "number" ? alert.value.toFixed(3) : alert.value}</strong></span>
                  {alert.score !== undefined && <span>Score: <strong>{alert.score.toFixed(3)}</strong></span>}
                  {alert.label && <span>Label: <strong>{alert.label}</strong></span>}
                </div>
                {alert.timestamp && (
                  <div className="alert-time">{new Date(alert.timestamp).toLocaleString()}</div>
                )}
              </div>
              <div className={`alert-badge ${alert.is_anomaly ? "badge-red" : "badge-green"}`}>
                {alert.is_anomaly ? "ALERT" : "OK"}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .alerts-panel { color:#1e1f2e; font-family:'DM Sans',sans-serif; }
        .alerts-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; flex-wrap:wrap; gap:16px; }
        .alerts-header h2 { font-size:20px; font-weight:700; margin:0 0 4px; color:#1e1f2e; }
        .alerts-header p  { font-size:13px; color:#9196a8; margin:0; }
        .filter-tabs { display:flex; gap:8px; }
        .tab { background:#fff; border:1px solid #e2e5ef; color:#9196a8; border-radius:8px; padding:6px 14px; font-size:13px; font-weight:500; cursor:pointer; transition:all .15s; font-family:inherit; display:flex; align-items:center; gap:6px; }
        .tab:hover { background:#f4f6fb; color:#4b5060; }
        .tab.active { background:rgba(99,102,241,0.08); border-color:rgba(99,102,241,0.3); color:#6366f1; }
        .tab-badge { background:#ef4444; color:#fff; border-radius:10px; padding:1px 7px; font-size:11px; font-weight:700; }
        .alert-empty { text-align:center; padding:48px; color:#b0b5c4; font-size:14px; }
        .alert-list { display:flex; flex-direction:column; gap:10px; }
        .alert-item { display:flex; align-items:flex-start; gap:14px; padding:16px 18px; border-radius:12px; border:1px solid; transition:background .15s; }
        .alert-item.is-anomaly { background:#fef9f9; border-color:#fecaca; }
        .alert-item.is-normal  { background:#f0fdf8; border-color:#a7f3d0; }
        .alert-dot { width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }
        .is-anomaly .alert-dot { background:#ef4444; box-shadow:0 0 8px rgba(239,68,68,0.3); }
        .is-normal  .alert-dot { background:#10b981; }
        .alert-body { flex:1; }
        .alert-title { font-size:14px; font-weight:600; margin-bottom:6px; }
        .is-anomaly .alert-title { color:#ef4444; }
        .is-normal  .alert-title { color:#10b981; }
        .alert-meta { display:flex; gap:16px; flex-wrap:wrap; font-size:13px; color:#9196a8; }
        .alert-meta strong { color:#1e1f2e; }
        .alert-time { font-size:11px; color:#b0b5c4; margin-top:6px; }
        .alert-badge { font-size:11px; font-weight:700; letter-spacing:0.5px; border-radius:6px; padding:3px 10px; flex-shrink:0; }
        .badge-red   { background:#fef2f2; color:#ef4444; }
        .badge-green { background:#ecfdf5; color:#10b981; }
      `}</style>
    </div>
  );
}