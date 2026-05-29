import { useState, useEffect } from "react";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${authService.getToken()}`,
});

export default function AdminDatasets() {
  const [datasets,   setDatasets]   = useState([]);
  const [homes,      setHomes]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");
  const [search,     setSearch]     = useState("");
  const [filterHome, setFilterHome] = useState("");

  // Upload form state
  const [csvFile,   setCsvFile]   = useState(null);
  const [homeId,    setHomeId]    = useState("");
  const [duration,  setDuration]  = useState("");

  // Preview modal
  const [preview,   setPreview]   = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [hRes, dRes] = await Promise.all([
        fetch(`${API}/admin/homes`,    { headers: authHeaders() }),
        fetch(`${API}/admin/datasets`, { headers: authHeaders() }),
      ]);
      setHomes(await hRes.json());
      setDatasets(await dRes.json());
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!csvFile) return setError("Please select a CSV file.");
    if (!homeId)  return setError("Please select a home.");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file",     csvFile);
      fd.append("home_id",  homeId);
      fd.append("duration", duration);
      const res  = await fetch(`${API}/datasets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authService.getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed.");
      setSuccess(`✅ "${csvFile.name}" uploaded successfully!`);
      setCsvFile(null); setHomeId(""); setDuration("");
      // reset file input
      document.getElementById("csv-input").value = "";
      await fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete dataset "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/datasets/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Delete failed.");
      setDatasets((d) => d.filter((x) => x.id !== id));
      setSuccess("Dataset deleted.");
    } catch (err) {
      setError(err.message);
    }
  };

  const homeName = (id) => homes.find((h) => h.id === id)?.name || `Home #${id}`;

  const filtered = datasets.filter((d) => {
    const matchHome   = !filterHome || String(d.home_id) === filterHome;
    const matchSearch = !search ||
      d.file_name.toLowerCase().includes(search.toLowerCase()) ||
      homeName(d.home_id).toLowerCase().includes(search.toLowerCase());
    return matchHome && matchSearch;
  });

  return (
    <div style={{ color: "#1e1f2e", fontFamily: "'DM Sans', sans-serif", maxWidth: 1100 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.5px" }}>
          📂 Dataset Management
        </h1>
        <p style={{ color: "#9196a8", fontSize: 14, margin: 0 }}>
          Upload CSV files, link them to homes, and manage existing datasets
        </p>
      </div>

      {/* ── Alerts ── */}
      {error   && <Alert type="error"   msg={error}   onClose={() => setError("")}   />}
      {success && <Alert type="success" msg={success} onClose={() => setSuccess("")} />}

      {/* ── Upload Card ── */}
      <div style={card}>
        <h2 style={sectionTitle}>Upload New Dataset</h2>
        <form onSubmit={handleUpload}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Home selector */}
            <div style={field}>
              <label style={fieldLabel}>Home *</label>
              <select
                value={homeId}
                onChange={(e) => setHomeId(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Select a home —</option>
                {homes.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            {/* File input */}
            <div style={field}>
              <label style={fieldLabel}>CSV File *</label>
              <input
                id="csv-input"
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files[0])}
                style={{ ...inputStyle, padding: "8px 12px" }}
              />
            </div>

            {/* Duration */}
            <div style={field}>
              <label style={fieldLabel}>Duration (optional)</label>
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 365 days"
                style={inputStyle}
              />
            </div>
          </div>

          {/* File preview info */}
          {csvFile && (
            <div style={{
              background: "#f0f7ff", border: "1px solid #bae0fd",
              borderRadius: 10, padding: "10px 14px",
              fontSize: 13, color: "#0369a1",
              marginBottom: 14,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              📄 <strong>{csvFile.name}</strong>
              <span style={{ color: "#9196a8" }}>·</span>
              {(csvFile.size / 1024).toFixed(1)} KB
            </div>
          )}

          <button type="submit" disabled={uploading} style={primaryBtn}>
            {uploading ? "Uploading…" : "⬆️ Upload Dataset"}
          </button>
        </form>
      </div>

      {/* ── Datasets Table ── */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>
            All Datasets
            <span style={countBadge}>{filtered.length}</span>
          </h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              placeholder="Search file or home…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, width: 200, padding: "8px 12px" }}
            />
            <select
              value={filterHome}
              onChange={(e) => setFilterHome(e.target.value)}
              style={{ ...inputStyle, padding: "8px 12px" }}
            >
              <option value="">All homes</option>
              {homes.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <Empty msg="No datasets found." />
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e8eaf0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e8eaf0" }}>
                  {["ID", "File Name", "Home", "Duration", "Uploaded", "Actions"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f0f1f6", transition: "background 0.1s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#fafafa"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ ...td, color: "#b0b5c4", fontFamily: "monospace", fontSize: 12 }}>#{d.id}</td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>📄</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e1f2e" }}>{d.file_name}</span>
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{
                        background: "#eef2ff", color: "#6366f1",
                        border: "1px solid #c7d2fe",
                        borderRadius: 8, padding: "3px 10px",
                        fontSize: 12, fontWeight: 600,
                      }}>
                        🏠 {homeName(d.home_id)}
                      </span>
                    </td>
                    <td style={{ ...td, color: "#6b7280", fontSize: 13 }}>
                      {d.duration || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td style={{ ...td, color: "#9196a8", fontSize: 12 }}>
                      {d.upload_date || d.created_at
                        ? new Date(d.upload_date || d.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setPreview(d)}
                          style={actionBtn("view")}
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDelete(d.id, d.file_name)}
                          style={actionBtn("del")}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Preview Modal ── */}
      {preview && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 24,
        }}
          onClick={() => setPreview(null)}
        >
          <div style={{
            background: "#fff", borderRadius: 16,
            padding: 28, width: "100%", maxWidth: 480,
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Dataset Details</h3>
              <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9196a8" }}>×</button>
            </div>
            {[
              { label: "ID",       value: `#${preview.id}` },
              { label: "File",     value: preview.file_name },
              { label: "Home",     value: `🏠 ${homeName(preview.home_id)}` },
              { label: "Duration", value: preview.duration || "—" },
              { label: "Uploaded", value: preview.upload_date || preview.created_at
                ? new Date(preview.upload_date || preview.created_at).toLocaleString()
                : "—" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #f0f1f6", fontSize: 14 }}>
                <span style={{ color: "#9196a8", fontWeight: 500 }}>{label}</span>
                <span style={{ color: "#1e1f2e", fontWeight: 600 }}>{value}</span>
              </div>
            ))}
            <button onClick={() => setPreview(null)} style={{ ...primaryBtn, width: "100%", marginTop: 20 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────
function Alert({ type, msg, onClose }) {
  const isErr = type === "error";
  return (
    <div style={{
      background: isErr ? "#fef2f2" : "#ecfdf5",
      border: `1px solid ${isErr ? "#fecaca" : "#a7f3d0"}`,
      color: isErr ? "#ef4444" : "#059669",
      padding: "11px 16px", borderRadius: 10,
      fontSize: 13, marginBottom: 16,
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      {msg}
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
      <div style={{ width: 30, height: 30, border: "3px solid #e8eaf0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ textAlign: "center", padding: "40px 0", color: "#b0b5c4", fontSize: 14 }}>{msg}</div>;
}

// ── Style constants ───────────────────────────────────────
const card = {
  background: "#fff", border: "1px solid #e8eaf0",
  borderRadius: 16, padding: 24, marginBottom: 20,
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
const sectionTitle = { fontSize: 15, fontWeight: 700, margin: "0 0 18px", color: "#1e1f2e", display: "flex", alignItems: "center", gap: 10 };
const countBadge   = { background: "#eef2ff", color: "#6366f1", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 };
const field        = { display: "flex", flexDirection: "column", gap: 6 };
const fieldLabel   = { fontSize: 11, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px" };
const inputStyle   = { background: "#f8f9fc", border: "1px solid #e2e5ef", borderRadius: 10, padding: "10px 13px", color: "#1e1f2e", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const primaryBtn   = { background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const th           = { textAlign: "left", padding: "11px 16px", fontSize: 11, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px" };
const td           = { padding: "13px 16px", fontSize: 14, color: "#374151" };
const actionBtn    = (t) => t === "del"
  ? { background: "#fef2f2", color: "#ef4444", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }
  : { background: "#eef2ff", color: "#6366f1", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };