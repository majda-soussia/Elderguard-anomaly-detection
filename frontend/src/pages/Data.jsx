import { useState, useEffect } from "react";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${authService.getToken()}`,
});

// ═══════════════════════════════════════════════════════════
// CONTACT BADGE
// ═══════════════════════════════════════════════════════════
function ContactBadge({ contact }) {
  const isDoctor = contact.type === "doctor";
  return (
    <div className={`contact-badge ${isDoctor ? "doctor" : "family"}`}>
      <span className="contact-icon">{isDoctor ? "👨‍⚕️" : "👨‍👩‍👧"}</span>
      <div className="contact-info">
        <span className="contact-label">{isDoctor ? "Doctor" : "Family"}</span>
        <span className="contact-name">{contact.name}</span>
        {contact.email && <span className="contact-detail">✉ {contact.email}</span>}
        {contact.phone && <span className="contact-detail">📞 {contact.phone}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MEDICAL PLAN FIELD
// ═══════════════════════════════════════════════════════════
function MedicalPlanSection({ plan, onChange }) {
  const field = (key, label, icon, placeholder, rows = 2) => (
    <div className="field">
      <label>{icon} {label}</label>
      <textarea
        rows={rows}
        value={plan[key] || ""}
        onChange={e => onChange({ ...plan, [key]: e.target.value })}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="contact-section">
      <div className="contact-section-title">🏥 Medical Plan</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {field("diagnosis",        "Diagnosis / Conditions",     "🩺", "e.g. Parkinson's disease, diabetes…")}
        {field("medications",      "Current Medications",        "💊", "e.g. Metformin 500mg twice daily…")}
        {field("mobility_notes",   "Mobility & Physical Limits", "🦽", "e.g. Uses walker, cannot stand >5 min…")}
        {field("sleep_schedule",   "Sleep Schedule",             "🛏️",  "e.g. Sleeps 10 PM–6 AM, naps 2–3 PM…")}
        {field("routine_notes",    "Daily Routine Notes",        "🍽️",  "e.g. Eats at 7, 12 and 18h, watches TV in afternoon…")}
        {field("anomaly_context",  "Known Anomaly Context",      "⚠️",  "e.g. May not move in morning due to pain, inactivity is normal…", 3)}
        {field("emergency_contact","Emergency Contact",          "📞", "Name, phone, relation…")}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOMES SECTION
// ═══════════════════════════════════════════════════════════
function HomesSection({ homes, setHomes, onSelectHome, selectedHomeId }) {
  const emptyMedPlan = {
    diagnosis: "", medications: "", mobility_notes: "",
    sleep_schedule: "", routine_notes: "", anomaly_context: "", emergency_contact: "",
  };
  const emptyForm = {
    name: "", location: "",
    doctor_name: "", doctor_email: "", doctor_phone: "",
    family_name: "", family_email: "", family_phone: "",
  };
  const [form,     setForm]    = useState(emptyForm);
  const [medPlan,  setMedPlan] = useState(emptyMedPlan);
  const [editId,   setEditId]  = useState(null);
  const [saving,   setSaving]  = useState(false);
  const [error,    setError]   = useState("");
  const [expanded, setExpanded]= useState(null);
  const [showPlan, setShowPlan]= useState(null);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const fetchHomes = async () => {
    const res  = await fetch(`${API}/homes`, { headers: authHeaders() });
    const data = await res.json();
    setHomes(data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSaving(true);
    try {
      const url    = editId ? `${API}/homes/${editId}` : `${API}/homes`;
      const method = editId ? "PUT" : "POST";

      // Check if medical plan has any content
      const hasPlan = Object.values(medPlan).some(v => v?.trim());

      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ ...form, medical_plan: hasPlan ? medPlan : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setForm(emptyForm);
      setMedPlan(emptyMedPlan);
      setEditId(null);
      await fetchHomes();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (h) => {
    setEditId(h.id);
    const doctor = h.contacts?.find((c) => c.type === "doctor") || {};
    const family = h.contacts?.find((c) => c.type === "family") || {};
    setForm({
      name: h.name, location: h.location || "",
      doctor_name: doctor.name || "", doctor_email: doctor.email || "", doctor_phone: doctor.phone || "",
      family_name: family.name || "", family_email: family.email || "", family_phone: family.phone || "",
    });
    const p = h.medical_plan || {};
    setMedPlan({
      diagnosis:         p.diagnosis         || "",
      medications:       p.medications       || "",
      mobility_notes:    p.mobility_notes    || "",
      sleep_schedule:    p.sleep_schedule    || "",
      routine_notes:     p.routine_notes     || "",
      anomaly_context:   p.anomaly_context   || "",
      emergency_contact: p.emergency_contact || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this home and ALL its datasets?")) return;
    const res = await fetch(`${API}/homes/${id}`, { method: "DELETE", headers: authHeaders() });
    if (res.ok) setHomes((h) => h.filter((x) => x.id !== id));
  };

  return (
    <div className="card">
      <h2>🏠 Homes</h2>
      {error && <div className="alert error">{error}</div>}

      {/* ── FORM ── */}
      <form onSubmit={handleSubmit} className="home-form">
        <div className="form-row">
          <div className="field">
            <label>Home Name *</label>
            <input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Amani House" required />
          </div>
          <div className="field">
            <label>Location</label>
            <input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Tunis" />
          </div>
        </div>

        {/* Doctor contact */}
        <div className="contact-section">
          <div className="contact-section-title">👨‍⚕️ Doctor Contact</div>
          <div className="form-row three">
            <div className="field">
              <label>Name</label>
              <input name="doctor_name" value={form.doctor_name} onChange={handleChange} placeholder="Dr. Ben Ali" />
            </div>
            <div className="field">
              <label>Email</label>
              <input name="doctor_email" type="email" value={form.doctor_email} onChange={handleChange} placeholder="doctor@clinic.tn" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input name="doctor_phone" value={form.doctor_phone} onChange={handleChange} placeholder="+216 XX XXX XXX" />
            </div>
          </div>
        </div>

        {/* Family contact */}
        <div className="contact-section">
          <div className="contact-section-title">👨‍👩‍👧 Family Contact</div>
          <div className="form-row three">
            <div className="field">
              <label>Name</label>
              <input name="family_name" value={form.family_name} onChange={handleChange} placeholder="Family member name" />
            </div>
            <div className="field">
              <label>Email</label>
              <input name="family_email" type="email" value={form.family_email} onChange={handleChange} placeholder="family@email.com" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input name="family_phone" value={form.family_phone} onChange={handleChange} placeholder="+216 XX XXX XXX" />
            </div>
          </div>
        </div>

        {/* Medical plan */}
        <MedicalPlanSection plan={medPlan} onChange={setMedPlan} />

        <div className="form-actions">
          <button className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : editId ? "Update Home" : "Add Home"}
          </button>
          {editId && (
            <button type="button" className="btn-ghost" onClick={() => { setEditId(null); setForm(emptyForm); setMedPlan(emptyMedPlan); setError(""); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* ── LIST ── */}
      {homes.length === 0 ? (
        <div className="empty">No homes yet. Add one above.</div>
      ) : (
        <div className="home-list">
          {homes.map((h) => (
            <div key={h.id} className={`home-card ${selectedHomeId === h.id ? "selected" : ""}`}>
              <div className="home-header" onClick={() => onSelectHome(h.id)}>
                <div className="home-meta">
                  <span className="home-name">{h.name}</span>
                  {h.location && <span className="home-loc">📍 {h.location}</span>}
                  <span className="home-date">{new Date(h.created_at).toLocaleDateString()}</span>
                  {h.contacts?.length > 0 && (
                    <span className="contacts-count">{h.contacts.length} contact{h.contacts.length > 1 ? "s" : ""}</span>
                  )}
                  {h.medical_plan && Object.values(h.medical_plan).some(v => v?.trim()) && (
                    <span style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                      📋 Plan on file
                    </span>
                  )}
                </div>
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  {h.medical_plan && (
                    <button className="btn-expand" onClick={() => setShowPlan(showPlan === h.id ? null : h.id)}>
                      {showPlan === h.id ? "▲ Plan" : "📋 Plan"}
                    </button>
                  )}
                  <button className="btn-expand" onClick={() => setExpanded(expanded === h.id ? null : h.id)}>
                    {expanded === h.id ? "▲ Hide" : "▼ Contacts"}
                  </button>
                  <button className="btn-edit" onClick={() => handleEdit(h)}>Edit</button>
                  <button className="btn-del" onClick={() => handleDelete(h.id)}>Delete</button>
                </div>
              </div>

              {/* Medical plan preview */}
              {showPlan === h.id && h.medical_plan && (
                <div className="contacts-panel">
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#059669", marginBottom: 12 }}>📋 Medical Plan</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      ["🩺 Diagnosis",           h.medical_plan.diagnosis],
                      ["💊 Medications",          h.medical_plan.medications],
                      ["🦽 Mobility",             h.medical_plan.mobility_notes],
                      ["🛏️ Sleep Schedule",        h.medical_plan.sleep_schedule],
                      ["🍽️ Daily Routine",         h.medical_plan.routine_notes],
                      ["⚠️ Anomaly Context",       h.medical_plan.anomaly_context],
                      ["📞 Emergency Contact",     h.medical_plan.emergency_contact],
                    ].filter(([, v]) => v?.trim()).map(([label, value]) => (
                      <div key={label} style={{ background: "#f8fafc", border: "1px solid #e8eaf0", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9196a8", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts panel */}
              {expanded === h.id && (
                <div className="contacts-panel">
                  {(!h.contacts || h.contacts.length === 0) ? (
                    <p className="no-contacts">No contacts added for this home.</p>
                  ) : (
                    <div className="contacts-grid">
                      {h.contacts.map((c) => (
                        <ContactBadge key={c.id} contact={c} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DATASETS SECTION (unchanged)
// ═══════════════════════════════════════════════════════════
function DatasetsSection({ homes, selectedHomeId }) {
  const [datasets, setDatasets]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [csvFile, setCsvFile]     = useState(null);
  const [duration, setDuration]   = useState("");
  const [homeId, setHomeId]       = useState(selectedHomeId || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");

  useEffect(() => {
    setHomeId(selectedHomeId || "");
    if (selectedHomeId) fetchDatasets(selectedHomeId);
    else fetchAll();
  }, [selectedHomeId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/datasets`, { headers: authHeaders() });
      setDatasets(await res.json());
    } catch { setError("Failed to load datasets."); }
    finally { setLoading(false); }
  };

  const fetchDatasets = async (hid) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/datasets/home/${hid}`, { headers: authHeaders() });
      setDatasets(await res.json());
    } catch { setError("Failed to load datasets."); }
    finally { setLoading(false); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!csvFile) return setError("Select a CSV file");
    if (!homeId)  return setError("Select a home");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", csvFile);
      fd.append("home_id", homeId);
      fd.append("duration", duration);
      const res  = await fetch(`${API}/datasets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authService.getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setSuccess("Uploaded successfully!");
      setCsvFile(null); setDuration("");
      selectedHomeId ? fetchDatasets(selectedHomeId) : fetchAll();
    } catch (err) { setError(err.message); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this dataset?")) return;
    const res = await fetch(`${API}/datasets/${id}`, { method: "DELETE", headers: authHeaders() });
    if (res.ok) setDatasets((d) => d.filter((x) => x.id !== id));
  };

  return (
    <div className="card">
      <h2>📂 Datasets</h2>
      {error   && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <form onSubmit={handleUpload} className="upload-form">
        <div className="field">
          <label>Home *</label>
          <select value={homeId} onChange={(e) => setHomeId(e.target.value)}>
            <option value="">Select</option>
            {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>CSV</label>
          <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files[0])} />
        </div>
        <div className="field">
          <label>Duration</label>
          <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 30 days" />
        </div>
        <button className="btn-primary" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : datasets.length === 0 ? (
        <div className="empty">No datasets yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>File</th><th>Home</th><th>Duration</th><th>Uploaded</th><th></th></tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id}>
                  <td className="file-cell">📄 {d.file_name}</td>
                  <td>{d.home_name || "—"}</td>
                  <td>{d.duration || <span className="na">—</span>}</td>
                  <td className="date-cell">{d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}</td>
                  <td><button className="btn-del" onClick={() => handleDelete(d.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function Data() {
  const [homes, setHomes]                   = useState([]);
  const [selectedHomeId, setSelectedHomeId] = useState(null);

  useEffect(() => {
    fetch(`${API}/homes`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setHomes)
      .catch(console.error);
  }, []);

  return (
    <div className="data-page">
      <h1>Data Management</h1>
      <HomesSection
        homes={homes}
        setHomes={setHomes}
        onSelectHome={(id) => setSelectedHomeId((prev) => (prev === id ? null : id))}
        selectedHomeId={selectedHomeId}
      />
      <DatasetsSection homes={homes} selectedHomeId={selectedHomeId} />

      <style>{`
        .data-page { color:#1e1f2e; font-family:'DM Sans',sans-serif; max-width:1000px; }
        h1 { font-size:26px; font-weight:700; margin:0 0 24px; color:#1e1f2e; letter-spacing:-0.5px; }
        .card { background:#fff; border:1px solid #e8eaf0; border-radius:16px; padding:24px; margin-bottom:24px; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
        .card h2 { font-size:16px; font-weight:600; margin:0 0 20px; color:#2d3048; }
        .alert { padding:12px 16px; border-radius:10px; font-size:13px; margin-bottom:16px; }
        .alert.error   { background:#fef2f2; border:1px solid #fecaca; color:#ef4444; }
        .alert.success { background:#ecfdf5; border:1px solid #a7f3d0; color:#10b981; }

        .home-form { margin-bottom:24px; display:flex; flex-direction:column; gap:16px; }
        .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .form-row.three { grid-template-columns:1fr 1fr 1fr; }
        .contact-section { background:#f8f9fc; border:1px solid #e8eaf0; border-radius:12px; padding:16px; }
        .contact-section-title { font-size:13px; font-weight:600; color:#6366f1; margin-bottom:12px; }
        .field { display:flex; flex-direction:column; gap:6px; }
        .field label { font-size:11px; font-weight:600; color:#9196a8; text-transform:uppercase; letter-spacing:0.5px; }
        .field input, .field select, .field textarea {
          background:#fff; border:1px solid #e2e5ef; border-radius:10px;
          padding:10px 13px; color:#1e1f2e; font-size:14px; outline:none;
          font-family:inherit; transition:border-color .2s,box-shadow .2s;
          resize: vertical;
        }
        .field input:focus, .field select:focus, .field textarea:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.1); }
        .field input::placeholder, .field textarea::placeholder { color:#c2c6d4; }
        .form-actions { display:flex; gap:10px; }

        .btn-primary { background:#6366f1; color:#fff; border:none; border-radius:10px; padding:11px 22px; font-size:14px; font-weight:600; cursor:pointer; transition:background .2s; font-family:inherit; }
        .btn-primary:hover:not(:disabled) { background:#4f51d0; }
        .btn-primary:disabled { opacity:.4; cursor:not-allowed; }
        .btn-ghost { background:#f8f9fc; color:#4b5060; border:1px solid #e2e5ef; border-radius:10px; padding:11px 18px; font-size:14px; cursor:pointer; font-family:inherit; }
        .btn-ghost:hover { background:#eeeffa; }
        .btn-edit { background:rgba(99,102,241,0.1); color:#6366f1; border:none; border-radius:7px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-edit:hover { background:rgba(99,102,241,0.2); }
        .btn-del  { background:#fef2f2; color:#ef4444; border:none; border-radius:7px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-del:hover { background:#fee2e2; }
        .btn-expand { background:#f0f1f8; color:#6366f1; border:none; border-radius:7px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-expand:hover { background:#e4e5f8; }

        .home-list { display:flex; flex-direction:column; gap:10px; }
        .home-card { background:#f8f9fc; border:1px solid #e8eaf0; border-radius:12px; overflow:hidden; transition:border-color .15s; }
        .home-card.selected { border-color:rgba(99,102,241,0.4); }
        .home-header { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; cursor:pointer; }
        .home-header:hover { background:#f0f1fa; }
        .home-meta { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
        .home-name { font-weight:600; font-size:15px; color:#1e1f2e; }
        .home-loc  { font-size:13px; color:#9196a8; }
        .home-date { font-size:12px; color:#b0b5c4; }
        .contacts-count { background:rgba(99,102,241,0.1); color:#6366f1; border-radius:20px; padding:2px 10px; font-size:12px; font-weight:600; }
        .row-actions { display:flex; gap:8px; flex-shrink:0; }

        .contacts-panel { border-top:1px solid #e8eaf0; padding:16px 18px; background:#fff; }
        .no-contacts { color:#b0b5c4; font-size:13px; margin:0; }
        .contacts-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .contact-badge { display:flex; align-items:flex-start; gap:12px; padding:14px 16px; border-radius:10px; border:1px solid; }
        .contact-badge.doctor { background:#eff6ff; border-color:#bfdbfe; }
        .contact-badge.family { background:#f0fdf4; border-color:#bbf7d0; }
        .contact-icon { font-size:22px; flex-shrink:0; margin-top:2px; }
        .contact-info { display:flex; flex-direction:column; gap:2px; min-width:0; }
        .contact-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; color:#9196a8; }
        .contact-name  { font-size:14px; font-weight:600; color:#1e1f2e; }
        .contact-detail { font-size:12px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .upload-form { display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:14px; align-items:end; margin-bottom:20px; }
        .table-wrap { overflow-x:auto; border-radius:10px; border:1px solid #e8eaf0; }
        table { width:100%; border-collapse:collapse; }
        thead tr { border-bottom:1px solid #e8eaf0; background:#f8f9fc; }
        th { text-align:left; padding:11px 16px; font-size:11px; font-weight:600; color:#9196a8; text-transform:uppercase; letter-spacing:0.5px; }
        tbody tr { border-bottom:1px solid #f0f1f6; transition:background .15s; }
        tbody tr:last-child { border-bottom:none; }
        tbody tr:hover { background:#f8f9fc; }
        td { padding:12px 16px; font-size:14px; color:#2d3048; }
        .file-cell { font-family:monospace; font-size:13px; }
        .date-cell { font-size:12px; color:#9196a8; }
        .na { color:#c2c6d4; }
        .empty { text-align:center; padding:32px; color:#b0b5c4; font-size:14px; }

        @media (max-width:768px) {
          .form-row, .form-row.three { grid-template-columns:1fr; }
          .upload-form { grid-template-columns:1fr; }
          .contacts-grid { grid-template-columns:1fr; }
        }
      `}</style>
    </div>
  );
}