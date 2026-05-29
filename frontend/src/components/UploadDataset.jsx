import { useState, useEffect } from "react";
import { recordsService } from "../services/api";

export default function UploadData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState({ label: "", value: "" });
  const [editId,  setEditId]  = useState(null);
  const [error,   setError]   = useState("");
  const [saving,  setSaving]  = useState(false);

  const fetchRecords = async () => {
    try { const data = await recordsService.getAll(); setRecords(data); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRecords(); }, []);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(""); setSaving(true);
    try {
      if (editId) await recordsService.update(editId, form);
      else        await recordsService.create(form);
      setForm({ label: "", value: "" }); setEditId(null);
      await fetchRecords();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleEdit   = (rec) => { setEditId(rec.id); setForm({ label: rec.label, value: rec.value }); };
  const handleCancel = ()    => { setEditId(null); setForm({ label: "", value: "" }); setError(""); };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this record?")) return;
    try { await recordsService.delete(id); setRecords((r) => r.filter((x) => x.id !== id)); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="upload-panel">
      <h2>{editId ? "Edit Record" : "Add New Record"}</h2>
      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="record-form">
        <div className="form-row">
          <div className="field">
            <label>Label</label>
            <input name="label" value={form.label} onChange={handleChange} placeholder="e.g. Sensor A" required />
          </div>
          <div className="field">
            <label>Value</label>
            <input name="value" type="number" step="any" value={form.value} onChange={handleChange} placeholder="e.g. 3.14" required />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : editId ? "Update" : "Add Record"}
          </button>
          {editId && <button type="button" className="btn-ghost" onClick={handleCancel}>Cancel</button>}
        </div>
      </form>

      <div className="table-section">
        <h3>All Records <span className="badge">{records.length}</span></h3>
        {loading ? (
          <div className="loading-row">Loading…</div>
        ) : records.length === 0 ? (
          <div className="empty-row">No records yet. Add one above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Label</th><th>Value</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id} className={editId === rec.id ? "editing" : ""}>
                    <td className="id-cell">#{rec.id}</td>
                    <td>{rec.label}</td>
                    <td className="value-cell">{rec.value}</td>
                    <td className="date-cell">{rec.created_at ? new Date(rec.created_at).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-edit" onClick={() => handleEdit(rec)}>Edit</button>
                        <button className="btn-del"  onClick={() => handleDelete(rec.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .upload-panel { color:#1e1f2e; font-family:'DM Sans',sans-serif; }
        .upload-panel h2 { font-size:20px; font-weight:700; margin:0 0 20px; color:#1e1f2e; letter-spacing:-0.3px; }
        .alert-error { background:#fef2f2; border:1px solid #fecaca; color:#ef4444; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px; }
        .record-form { margin-bottom:32px; }
        .form-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
        .field { display:flex; flex-direction:column; gap:7px; }
        .field label { font-size:12px; font-weight:500; color:#9196a8; text-transform:uppercase; letter-spacing:0.5px; }
        .field input { background:#f8f9fc; border:1px solid #e2e5ef; border-radius:10px; padding:11px 13px; color:#1e1f2e; font-size:14px; outline:none; transition:border-color .2s,box-shadow .2s; font-family:inherit; }
        .field input:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.1); }
        .field input::placeholder { color:#c2c6d4; }
        .form-actions { display:flex; gap:10px; }
        .btn-primary { background:#6366f1; color:#fff; border:none; border-radius:10px; padding:11px 22px; font-size:14px; font-weight:600; cursor:pointer; transition:background .2s; font-family:inherit; }
        .btn-primary:hover { background:#4f51d0; }
        .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
        .btn-ghost { background:#f8f9fc; color:#4b5060; border:1px solid #e2e5ef; border-radius:10px; padding:11px 18px; font-size:14px; cursor:pointer; font-family:inherit; }
        .btn-ghost:hover { background:#eeeffa; }
        .table-section h3 { font-size:15px; font-weight:600; color:#2d3048; margin:0 0 14px; display:flex; align-items:center; gap:10px; }
        .badge { background:rgba(99,102,241,0.1); color:#6366f1; border-radius:20px; padding:2px 10px; font-size:12px; font-weight:600; }
        .loading-row, .empty-row { text-align:center; padding:32px; color:#b0b5c4; font-size:14px; }
        .table-wrap { overflow-x:auto; border-radius:12px; border:1px solid #e8eaf0; }
        table { width:100%; border-collapse:collapse; }
        thead tr { border-bottom:1px solid #e8eaf0; background:#f8f9fc; }
        th { text-align:left; padding:12px 16px; font-size:11px; font-weight:600; color:#9196a8; text-transform:uppercase; letter-spacing:0.5px; }
        tbody tr { border-bottom:1px solid #f0f1f6; transition:background .15s; }
        tbody tr:last-child { border-bottom:none; }
        tbody tr:hover { background:#f8f9fc; }
        tbody tr.editing { background:rgba(99,102,241,0.05); }
        td { padding:12px 16px; font-size:14px; color:#2d3048; }
        .id-cell    { color:#b0b5c4; font-size:12px; font-family:monospace; }
        .value-cell { font-family:monospace; color:#6366f1; }
        .date-cell  { font-size:12px; color:#9196a8; }
        .row-actions { display:flex; gap:8px; }
        .btn-edit { background:rgba(99,102,241,0.1); color:#6366f1; border:none; border-radius:7px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-edit:hover { background:rgba(99,102,241,0.2); }
        .btn-del  { background:#fef2f2; color:#ef4444; border:none; border-radius:7px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-del:hover { background:#fee2e2; }
      `}</style>
    </div>
  );
}