import { useState, useEffect } from "react";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${authService.getToken()}`,
});

const EMPTY_FORM = {
  name: "", location: "",
  doctor_name: "", doctor_email: "", doctor_phone: "",
  family_name: "", family_email: "", family_phone: "",
};

export default function AdminHomes() {
  const [homes,    setHomes]    = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [editId,   setEditId]   = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [search,   setSearch]   = useState("");

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [hRes, dRes] = await Promise.all([
        fetch(`${API}/admin/homes`, { headers: authHeaders() }),
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

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSaving(true);
    try {
      const url    = editId ? `${API}/homes/${editId}` : `${API}/homes`;
      const method = editId ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(form) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed.");
      setForm(EMPTY_FORM); setEditId(null);
      setSuccess(editId ? "Home updated." : "Home added.");
      await fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (h) => {
    setEditId(h.id);
    setForm({
      name: h.name, location: h.location || "",
      doctor_name: "", doctor_email: "", doctor_phone: "",
      family_name: "", family_email: "", family_phone: "",
    });
    // Fetch contacts for this home
    try {
      const res = await fetch(`${API}/homes/${h.id}/contacts`, { headers: authHeaders() });
      if (res.ok) {
        const contacts = await res.json();
        const doc = contacts.find((c) => c.type === "doctor") || {};
        const fam = contacts.find((c) => c.type === "family") || {};
        setForm((f) => ({
          ...f,
          doctor_name:  doc.name  || "", doctor_email: doc.email || "", doctor_phone: doc.phone || "",
          family_name:  fam.name  || "", family_email: fam.email || "", family_phone: fam.phone || "",
        }));
      }
    } catch { /* contacts stay empty */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const datasetsForHome = (homeId) => datasets.filter((d) => d.home_id === homeId);

  const filtered = homes.filter((h) =>
    !search || h.name.toLowerCase().includes(search.toLowerCase()) ||
    (h.location || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ color: "#1e1f2e", fontFamily: "'DM Sans', sans-serif", maxWidth: 1060 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.5px" }}>
          🏠 Home Management
        </h1>
        <p style={{ color: "#9196a8", fontSize: 14, margin: 0 }}>
          Add and manage homes, contacts, and linked datasets
        </p>
      </div>

      {/* ── Alerts ── */}
      {error   && <Alert type="error"   msg={error}   onClose={() => setError("")}   />}
      {success && <Alert type="success" msg={success} onClose={() => setSuccess("")} />}

      {/* ── Form ── */}
      <div style={card}>
        <h2 style={sectionTitle}>{editId ? "✏️ Edit Home" : "➕ Add New Home"}</h2>

        <form onSubmit={handleSubmit}>
          {/* Basic info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
            <FormField label="Home Name *" name="name"     value={form.name}     onChange={handleChange} placeholder="e.g. Amani House" required />
            <FormField label="Location"    name="location" value={form.location} onChange={handleChange} placeholder="e.g. Tunis" />
          </div>

          {/* Doctor contact */}
          <ContactBlock
            title="👨‍⚕️ Doctor Contact"
            prefix="doctor"
            form={form}
            onChange={handleChange}
          />

          {/* Family contact */}
          <ContactBlock
            title="👨‍👩‍👧 Family Contact"
            prefix="family"
            form={form}
            onChange={handleChange}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="submit" disabled={saving} style={primaryBtn}>
              {saving ? "Saving…" : editId ? "Update Home" : "Add Home"}
            </button>
            {editId && (
              <button
                type="button"
                onClick={() => { setEditId(null); setForm(EMPTY_FORM); setError(""); }}
                style={ghostBtn}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Homes list ── */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>
            All Homes
            <span style={countBadge}>{filtered.length}</span>
          </h2>
          <input
            placeholder="Search by name or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: 240, padding: "8px 12px" }}
          />
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <Empty msg="No homes found. Add one above." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((h) => {
              const homeDatasets = datasetsForHome(h.id);
              const isOpen = expanded === h.id;
              return (
                <div key={h.id} style={{
                  background: "#f8f9fc", border: "1px solid #e8eaf0",
                  borderRadius: 12, overflow: "hidden",
                  transition: "border-color 0.15s",
                }}>
                  {/* Row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", cursor: "pointer" }}
                    onClick={() => setExpanded(isOpen ? null : h.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: "linear-gradient(135deg,#e0e7ff,#c7d2fe)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18, flexShrink: 0,
                      }}>
                        🏠
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e1f2e" }}>{h.name}</div>
                        <div style={{ fontSize: 12, color: "#9196a8", marginTop: 2 }}>
                          {h.location && `📍 ${h.location} · `}
                          {new Date(h.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Pills */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {homeDatasets.length > 0 && (
                          <span style={{ background: "#f0f7ff", color: "#0369a1", border: "1px solid #bae0fd", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                            📂 {homeDatasets.length} dataset{homeDatasets.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {h.contacts && h.contacts.length > 0 && (
                          <span style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                            👥 {h.contacts.length} contact{h.contacts.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setExpanded(isOpen ? null : h.id)} style={actionBtn("expand")}>
                        {isOpen ? "▲ Hide" : "▼ Details"}
                      </button>
                      <button onClick={() => handleEdit(h)} style={actionBtn("edit")}>Edit</button>
                      <button onClick={() => handleDelete(h.id, h.name)} style={actionBtn("del")}>Delete</button>
                    </div>
                  </div>

                  {/* Detail panel */}
                  {isOpen && (
                    <div style={{ borderTop: "1px solid #e8eaf0", background: "#fff", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>

                      {/* Contacts */}
                      {h.contacts && h.contacts.length > 0 ? (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                            Contacts
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            {h.contacts.map((c) => (
                              <ContactCard key={c.id} contact={c} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 13, color: "#b0b5c4", margin: 0 }}>No contacts added for this home.</p>
                      )}

                      {/* Datasets */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                          Linked Datasets ({homeDatasets.length})
                        </div>
                        {homeDatasets.length === 0 ? (
                          <p style={{ fontSize: 13, color: "#b0b5c4", margin: 0 }}>No datasets uploaded for this home.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {homeDatasets.map((d) => (
                              <div key={d.id} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "10px 14px",
                                background: "#f8f9fc", border: "1px solid #e8eaf0",
                                borderRadius: 8, fontSize: 13,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span>📄</span>
                                  <span style={{ fontWeight: 600, color: "#374151" }}>{d.file_name}</span>
                                  {d.duration && (
                                    <span style={{ color: "#9196a8" }}>· {d.duration}</span>
                                  )}
                                </div>
                                <span style={{ fontSize: 12, color: "#b0b5c4" }}>
                                  {d.upload_date || d.created_at
                                    ? new Date(d.upload_date || d.created_at).toLocaleDateString()
                                    : "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function ContactBlock({ title, prefix, form, onChange }) {
  return (
    <div style={{ background: "#f8f9fc", border: "1px solid #e8eaf0", borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <FormField label="Name"  name={`${prefix}_name`}  value={form[`${prefix}_name`]}  onChange={onChange} placeholder="Full name"  />
        <FormField label="Email" name={`${prefix}_email`} value={form[`${prefix}_email`]} onChange={onChange} placeholder="email@example.com" type="email" />
        <FormField label="Phone" name={`${prefix}_phone`} value={form[`${prefix}_phone`]} onChange={onChange} placeholder="+216 XX XXX XXX" />
      </div>
    </div>
  );
}

function FormField({ label, name, value, onChange, placeholder, required, type = "text" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        style={inputStyle}
      />
    </div>
  );
}

function ContactCard({ contact }) {
  const isDoc = contact.type === "doctor";
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "12px 14px",
      background: isDoc ? "#eff6ff" : "#f0fdf4",
      border: `1px solid ${isDoc ? "#bfdbfe" : "#bbf7d0"}`,
      borderRadius: 10,
    }}>
      <span style={{ fontSize: 22 }}>{isDoc ? "👨‍⚕️" : "👨‍👩‍👧"}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {isDoc ? "Doctor" : "Family"}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1e1f2e" }}>{contact.name}</div>
        {contact.email && <div style={{ fontSize: 12, color: "#6b7280" }}>✉ {contact.email}</div>}
        {contact.phone && <div style={{ fontSize: 12, color: "#6b7280" }}>📞 {contact.phone}</div>}
      </div>
    </div>
  );
}

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
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16 }}>×</button>
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
const card        = { background: "#fff", border: "1px solid #e8eaf0", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };
const sectionTitle= { fontSize: 15, fontWeight: 700, margin: "0 0 18px", color: "#1e1f2e", display: "flex", alignItems: "center", gap: 10 };
const countBadge  = { background: "#eef2ff", color: "#6366f1", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 };
const inputStyle  = { background: "#fff", border: "1px solid #e2e5ef", borderRadius: 10, padding: "10px 13px", color: "#1e1f2e", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", transition: "border-color 0.2s" };
const primaryBtn  = { background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const ghostBtn    = { background: "#f8f9fc", color: "#4b5060", border: "1px solid #e2e5ef", borderRadius: 10, padding: "11px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const actionBtn   = (t) => ({
  expand: { background: "#f0f1f8", color: "#6366f1", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  edit:   { background: "#eef2ff", color: "#6366f1", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  del:    { background: "#fef2f2", color: "#ef4444", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
})[t];