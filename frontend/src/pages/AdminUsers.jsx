import { useState, useEffect } from "react";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${authService.getToken()}`,
});

const EMPTY_FORM = { name: "", email: "", password: "", role: "caregiver" };

export default function AdminUsers() {
  const [users,        setUsers]        = useState([]);
  const [homes,        setHomes]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState("");
  const [search,       setSearch]       = useState("");
  const [roleFilter,   setRoleFilter]   = useState("all");

  // Add user form
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);

  // Assign homes modal
  const [assignModal,   setAssignModal]   = useState(null);
  const [assignedHomes, setAssignedHomes] = useState([]);
  const [assigning,     setAssigning]     = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [uRes, hRes] = await Promise.all([
        fetch(`${API}/admin/users`, { headers: authHeaders() }),
        fetch(`${API}/admin/homes`, { headers: authHeaders() }),
      ]);
      const u = await uRes.json();
      const h = await hRes.json();
      setUsers(Array.isArray(u) ? u : []);
      setHomes(Array.isArray(h) ? h : []);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  // ── Add user ──────────────────────────────────────────────
  const handleAddUser = async () => {
    if (!form.name || !form.email || !form.password)
      return setError("Name, email and password are required.");
    setSaving(true); setError("");
    try {
      const res  = await fetch(`${API}/auth/signup`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create user.");
      setSuccess(`User "${form.name}" created.`);
      setForm(EMPTY_FORM); setShowForm(false);
      await fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete user ───────────────────────────────────────────
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/admin/users/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete user.");
      setUsers((u) => u.filter((x) => x.id !== id));
      setSuccess(`"${name}" removed.`);
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Assign homes ──────────────────────────────────────────
  const openAssign = (user) => {
    setAssignModal(user);
    setAssignedHomes(user.home_ids || []);
  };

  const toggleHome = (id) =>
    setAssignedHomes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSaveAssign = async () => {
    if (!assignModal) return;
    setAssigning(true);
    try {
      const res = await fetch(`${API}/admin/users/${assignModal.id}/homes`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ home_ids: assignedHomes }),
      });
      if (!res.ok) throw new Error("Failed to save assignments.");
      setUsers((prev) =>
        prev.map((u) => u.id === assignModal.id ? { ...u, home_ids: assignedHomes } : u)
      );
      setSuccess(`Homes updated for "${assignModal.name}".`);
      setAssignModal(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const filtered = users.filter((u) => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleIcon  = (r) => r === "admin" ? "🔑" : r === "doctor" ? "🧑‍⚕️" : "👩‍⚕️";
  const roleColor = (r) => ({
    admin:     { bg: "#faf5ff", text: "#7c3aed", border: "#ddd6fe" },
    doctor:    { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0" },
    caregiver: { bg: "#eef2ff", text: "#6366f1", border: "#c7d2fe" },
  })[r] || { bg: "#f9fafb", text: "#6b7280", border: "#e5e7eb" };

  return (
    <div style={{ color: "#1e1f2e", fontFamily: "'DM Sans', sans-serif", maxWidth: 1060 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.5px" }}>
            👥 User Management
          </h1>
          <p style={{ color: "#9196a8", fontSize: 14, margin: 0 }}>
            View users, assign homes, and manage access
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setError(""); setForm(EMPTY_FORM); }}
          style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 8 }}
        >
          {showForm ? "✕ Cancel" : "＋ Add User"}
        </button>
      </div>

      {/* Alerts */}
      {error   && <Alert type="error"   msg={error}   onClose={() => setError("")}   />}
      {success && <Alert type="success" msg={success} onClose={() => setSuccess("")} />}

      {/* Add User Form */}
      {showForm && (
        <div style={{ ...card, borderColor: "#c7d2fe", background: "#fafbff" }}>
          <h2 style={sectionTitle}>➕ Create New User</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
            <FormField label="Full Name *"  value={form.name}     onChange={(v) => setForm((f) => ({ ...f, name: v }))}     placeholder="e.g. Dr. Amani" />
            <FormField label="Email *"      value={form.email}    onChange={(v) => setForm((f) => ({ ...f, email: v }))}    placeholder="user@example.com" type="email" />
            <FormField label="Password *"   value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} placeholder="Min 8 chars" type="password" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={fieldLabel}>Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                style={inputStyle}
              >
                <option value="caregiver">👩‍⚕️ Caregiver</option>
                <option value="doctor">🧑‍⚕️ Doctor</option>
              </select>
            </div>
          </div>
          <button onClick={handleAddUser} disabled={saving} style={primaryBtn}>
            {saving ? "Creating…" : "✓ Create User"}
          </button>
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Users",    value: users.length,                                        color: "#6366f1", icon: "👥" },
            { label: "Caregivers",     value: users.filter((u) => u.role === "caregiver").length,  color: "#0ea5e9", icon: "👩‍⚕️" },
            { label: "Doctors",        value: users.filter((u) => u.role === "doctor").length,     color: "#10b981", icon: "🧑‍⚕️" },
            { label: "Admins",         value: users.filter((u) => u.role === "admin").length,      color: "#7c3aed", icon: "🔑" },
            { label: "Homes Available",value: homes.length,                                        color: "#f59e0b", icon: "🏠" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "#fff", border: "1px solid #e8eaf0",
              borderRadius: 12, padding: "14px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#9196a8", marginTop: 3, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Users Table */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#1e1f2e", display: "flex", alignItems: "center", gap: 10 }}>
            All Users
            <span style={countBadge}>{filtered.length}</span>
          </h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* Role filter */}
            <div style={{ display: "flex", gap: 6 }}>
              {["all", "caregiver", "doctor", "admin"].map((r) => (
                <button key={r} onClick={() => setRoleFilter(r)} style={{
                  background: roleFilter === r ? "#6366f1" : "#f8f9fc",
                  color:      roleFilter === r ? "#fff"    : "#9196a8",
                  border: "1px solid " + (roleFilter === r ? "#6366f1" : "#e2e5ef"),
                  borderRadius: 8, padding: "6px 12px", fontSize: 12,
                  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  textTransform: "capitalize",
                }}>
                  {r === "all" ? "All" : roleIcon(r) + " " + r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, width: 220, padding: "8px 12px" }}
            />
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <Empty msg="No users found." />
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e8eaf0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f9fc", borderBottom: "1px solid #e8eaf0" }}>
                  {["User", "Email", "Role", "Assigned Homes", "Joined", "Actions"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const rc = roleColor(u.role);
                  const assignedNames = (u.home_ids || [])
                    .map((id) => homes.find((h) => h.id === id)?.name)
                    .filter(Boolean);
                  const isSelf = u.id === authService.getUser?.()?.id;

                  return (
                    <tr key={u.id}
                      style={{ borderBottom: "1px solid #f0f1f6", transition: "background 0.1s" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#fafafa"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Avatar + name */}
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: `${rc.bg}`,
                            border: `1.5px solid ${rc.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 16, flexShrink: 0,
                          }}>
                            {roleIcon(u.role)}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e1f2e" }}>
                              {u.name}
                              {isSelf && <span style={{ marginLeft: 6, fontSize: 10, background: "#fef9c3", color: "#854d0e", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>YOU</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ ...td, color: "#6b7280", fontSize: 13 }}>{u.email}</td>

                      {/* Role badge */}
                      <td style={td}>
                        <span style={{
                          background: rc.bg, color: rc.text,
                          border: `1px solid ${rc.border}`,
                          borderRadius: 20, padding: "3px 10px",
                          fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                        }}>
                          {roleIcon(u.role)} {u.role}
                        </span>
                      </td>

                      {/* Assigned homes */}
                      <td style={td}>
                        {assignedNames.length === 0 ? (
                          <span style={{ fontSize: 12, color: "#b0b5c4", fontStyle: "italic" }}>No homes assigned</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {assignedNames.map((n) => (
                              <span key={n} style={{
                                background: "#f0f7ff", color: "#0369a1",
                                border: "1px solid #bae0fd",
                                borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                              }}>
                                🏠 {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Joined */}
                      <td style={{ ...td, color: "#9196a8", fontSize: 13 }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => openAssign(u)} style={actionBtn("assign")}>
                            🏠 Assign
                          </button>
                          {!isSelf && u.role !== "admin" && (
                            <button onClick={() => handleDelete(u.id, u.name)} style={actionBtn("del")}>
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign Homes Modal */}
      {assignModal && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(15,23,42,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 24,
        }}
          onClick={() => setAssignModal(null)}
        >
          <div style={{
            background: "#fff", borderRadius: 16,
            padding: 28, width: "100%", maxWidth: 500,
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Assign Homes</h3>
                <p style={{ fontSize: 13, color: "#9196a8", margin: 0 }}>
                  For <strong>{assignModal.name}</strong> — {assignedHomes.length} selected
                </p>
              </div>
              <button onClick={() => setAssignModal(null)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9196a8" }}>
                ×
              </button>
            </div>

            {/* Select all / clear */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setAssignedHomes(homes.map((h) => h.id))}
                style={{ ...ghostBtn, fontSize: 12, padding: "5px 12px" }}>
                ✓ Select All
              </button>
              <button onClick={() => setAssignedHomes([])}
                style={{ ...ghostBtn, fontSize: 12, padding: "5px 12px" }}>
                ✕ Clear
              </button>
            </div>

            {homes.length === 0 ? (
              <p style={{ color: "#b0b5c4", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
                No homes available.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 320, overflowY: "auto" }}>
                {homes.map((h) => {
                  const checked = assignedHomes.includes(h.id);
                  return (
                    <div key={h.id} onClick={() => toggleHome(h.id)} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px",
                      background: checked ? "#eef2ff" : "#f8f9fc",
                      border: `1.5px solid ${checked ? "#c7d2fe" : "#e8eaf0"}`,
                      borderRadius: 10, cursor: "pointer", transition: "all 0.1s",
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        background: checked ? "#6366f1" : "#fff",
                        border: `2px solid ${checked ? "#6366f1" : "#d1d5db"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.1s",
                      }}>
                        {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1e1f2e" }}>🏠 {h.name}</div>
                        {h.location && <div style={{ fontSize: 12, color: "#9196a8" }}>📍 {h.location}</div>}
                        {h.owner_name && <div style={{ fontSize: 11, color: "#b0b5c4" }}>Owner: {h.owner_name}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleSaveAssign} disabled={assigning} style={{ ...primaryBtn, flex: 1 }}>
                {assigning ? "Saving…" : `💾 Save (${assignedHomes.length} home${assignedHomes.length !== 1 ? "s" : ""})`}
              </button>
              <button onClick={() => setAssignModal(null)} style={{ ...ghostBtn, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────
function FormField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={fieldLabel}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
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

const card        = { background: "#fff", border: "1px solid #e8eaf0", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };
const sectionTitle= { fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "#1e1f2e" };
const countBadge  = { background: "#eef2ff", color: "#6366f1", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 };
const fieldLabel  = { fontSize: 11, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px" };
const inputStyle  = { background: "#f8f9fc", border: "1px solid #e2e5ef", borderRadius: 10, padding: "10px 13px", color: "#1e1f2e", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box", width: "100%" };
const primaryBtn  = { background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const ghostBtn    = { background: "#f8f9fc", color: "#4b5060", border: "1px solid #e2e5ef", borderRadius: 10, padding: "11px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const th          = { textAlign: "left", padding: "11px 16px", fontSize: 11, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px" };
const td          = { padding: "13px 16px", fontSize: 14, color: "#374151" };
const actionBtn   = (t) => ({
  assign: { background: "#eef2ff", color: "#6366f1", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  del:    { background: "#fef2f2", color: "#ef4444", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
})[t];