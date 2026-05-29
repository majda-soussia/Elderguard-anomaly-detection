import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const h   = () => ({ Authorization: `Bearer ${authService.getToken()}` });
const hj  = () => ({ ...h(), "Content-Type": "application/json" });

const TYPE_COLOR = {
  "Temporal Shift": "#6366f1",
  "Duration":       "#f59e0b",
  "Order":          "#ec4899",
  "Unknown":        "#9ca3af",
};

const inputStyle = {
  background: "#fff",
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  padding: "9px 12px",
  color: "#1e293b",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function MessageThread({ resultId, user }) {
  const [thread, setThread]   = useState([]);
  const [body, setBody]       = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState("");
  const bottomRef = useRef(null);

  const load = () =>
    fetch(`${API}/messages/thread/${resultId}`, { headers: h() })
      .then(r => r.json())
      .then(d => setThread(Array.isArray(d) ? d : []));

  useEffect(() => { if (resultId) load(); }, [resultId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread]);

  const send = async () => {
    if (!body.trim()) return;
  
    setSending(true);
    setError("");
  
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: hj(),
        body: JSON.stringify({
          analysis_result_id: Number(resultId),
          recipient_type: "caregiver",
          body
        }),
      });
  
      const data = await res.json();   // 🔥 IMPORTANT
  
      if (!res.ok) {
        console.error("BACKEND ERROR:", data); // 👈 THIS IS KEY
        throw new Error(data.error || data.detail);
      }
  
      setBody("");
      await load();
  
    } catch (e) {
      console.error("FRONT ERROR:", e.message);
      setError(e.message);
    } finally {
      setSending(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4, marginBottom: 14, maxHeight: 340 }}>
        {thread.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0", color: "#b0b5c4", fontSize: 13 }}>
            No messages yet — start the conversation with the caregiver.
          </div>
        ) : thread.map(msg => {
          const isMe = msg.sender_id === user?.id;
          return (
            <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "72%",
                background: isMe ? "rgba(99,102,241,0.08)" : "#f4f6fb",
                border: `1px solid ${isMe ? "rgba(99,102,241,0.25)" : "#e8eaf0"}`,
                borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                padding: "10px 14px",
              }}>
                <div style={{ fontSize: 11, color: "#9196a8", marginBottom: 4 }}>
                  <strong style={{ color: isMe ? "#6366f1" : "#475569" }}>{msg.sender_name}</strong>
                  {" · "}{msg.sender_role}
                  {msg.recipient_type && (
                    <span style={{ marginLeft: 8, background: "#e8eaf0", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>
                      → {msg.recipient_type}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13.5, color: "#1e293b", lineHeight: 1.55 }}>{msg.body}</div>
                <div style={{ fontSize: 10, color: "#b0b5c4", marginTop: 5, textAlign: "right" }}>
                  {new Date(msg.sent_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 8 }}>⚠️ {error}</div>
      )}

      <div style={{ background: "#f8fafc", border: "1px solid #e8eaf0", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 11, color: "#9196a8", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          📩 Reply to Caregiver
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }}
          placeholder="Write your message to the caregiver… (Ctrl+Enter to send)"
          rows={3}
          style={{ width: "100%", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", color: "#1e293b", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = "#6366f1"}
          onBlur={e => e.target.style.borderColor = "#e2e8f0"}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={send} disabled={sending || !body.trim()} style={{
            background: sending || !body.trim() ? "#e8eaf0" : "linear-gradient(135deg,#6366f1,#818cf8)",
            color: sending || !body.trim() ? "#9196a8" : "#fff",
            border: "none", borderRadius: 9, padding: "9px 22px", fontSize: 13, fontWeight: 600,
            cursor: sending || !body.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
            boxShadow: sending || !body.trim() ? "none" : "0 3px 12px rgba(99,102,241,0.3)",
          }}>
            {sending ? "Sending…" : "Send ✈"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DoctorDashboard() {
  const { pathname } = useLocation();
  // If accessed via /doctor/messages, open the messages tab by default
  const defaultTab = pathname.includes("messages") ? "messages" : "anomalies";

  const [results, setResults]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [interps, setInterps]   = useState([]);
  const [form, setForm]         = useState({ anomaly_index: 0, diagnosis: "", solution: "" });
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState(defaultTab);
  const [error, setError]       = useState("");

  const user = authService.getUser?.() || {};

  useEffect(() => {
    // ✅ FIXED: use the correct endpoint /analyze/results
    fetch(`${API}/analyze/results`, { headers: h() })
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then(d => setResults(Array.isArray(d) ? d : []))
      .catch(err => {
        console.error("Failed to load analysis results:", err.message);
        setError("Could not load analysis results. Make sure the /analyze/results endpoint exists.");
      })
      .finally(() => setLoading(false));
  }, []);

  const selectResult = (r) => {
    setSelected(r);
    setTab("anomalies");
    setForm({ anomaly_index: 0, diagnosis: "", solution: "" });
    fetch(`${API}/interpretations/${r.id}`, { headers: h() })
      .then(res => res.json())
      .then(d => setInterps(Array.isArray(d) ? d : []))
      .catch(() => setInterps([]));
  };

  const saveInterp = async () => {
    if (!form.diagnosis.trim() || !selected) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/interpretations`, {
        method: "POST", headers: hj(),
        body: JSON.stringify({ analysis_result_id: selected.id, ...form }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to save");
      const updated = await fetch(`${API}/interpretations/${selected.id}`, { headers: h() })
        .then(r => r.json());
      setInterps(Array.isArray(updated) ? updated : []);
      setForm({ anomaly_index: 0, diagnosis: "", solution: "" });
    } catch (e) {
      alert("Error saving: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, height: "calc(100vh - 96px)" }}>

      {/* Left: Result List */}
      <div style={{ background: "#fff", border: "1px solid #e8eaf0", borderRadius: 16, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
          🩺 Analysis Results
        </div>

        {loading && (
          <div style={{ color: "#b0b5c4", fontSize: 13, textAlign: "center", padding: 20 }}>Loading…</div>
        )}

        {!loading && error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
            ⚠️ {error}
            <div style={{ marginTop: 6, fontSize: 11, color: "#9196a8" }}>
              Add a GET /analyze/results route to your backend (see fix below).
            </div>
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <div style={{ color: "#b0b5c4", fontSize: 13, textAlign: "center", padding: 20 }}>
            No results available yet. Ask a caregiver to run an analysis first.
          </div>
        )}

        {results.map(r => (
          <button key={r.id} onClick={() => selectResult(r)} style={{
            width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
            background: selected?.id === r.id ? "rgba(99,102,241,0.08)" : "#f8fafc",
            border: `1.5px solid ${selected?.id === r.id ? "#6366f1" : "#e8eaf0"}`,
            transition: "0.15s", fontFamily: "inherit",
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", marginBottom: 3 }}>
              {r.home_name || `Analysis #${r.id}`}
            </div>
            <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, marginBottom: 2 }}>
              ⚠️ {r.total_anomalies} anomal{r.total_anomalies === 1 ? "y" : "ies"}
              <span style={{ color: "#9196a8", fontWeight: 400 }}> · {r.pipeline}</span>
            </div>
            {r.file_name && (
              <div style={{ fontSize: 11, color: "#9196a8", marginBottom: 2 }}>📄 {r.file_name}</div>
            )}
            <div style={{ fontSize: 11, color: "#b0b5c4" }}>
              {new Date(r.analyzed_at || r.created_at).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>

      {/* Right: Detail */}
      {!selected ? (
        <div style={{ background: "#fff", border: "1px solid #e8eaf0", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span style={{ fontSize: 40 }}>🩺</span>
          <div style={{ color: "#9196a8", fontSize: 14 }}>Select an analysis result to review</div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e8eaf0", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e8eaf0", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>
                {selected.home_name || `Analysis #${selected.id}`}
              </div>
              <div style={{ fontSize: 12, color: "#9196a8", marginTop: 2 }}>
                {selected.total_days} days · {selected.total_anomalies} anomalies · {selected.pipeline}
                <span style={{ marginLeft: 10, color: "#6366f1", fontWeight: 600 }}>
                  threshold: {parseFloat(selected.threshold).toFixed(5)}
                </span>
              </div>
            </div>
            {selected.type_counts && Object.entries(selected.type_counts).map(([type, count]) => (
              <span key={type} style={{
                background: `${TYPE_COLOR[type] || "#9ca3af"}18`,
                color: TYPE_COLOR[type] || "#9ca3af",
                borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700,
              }}>
                {type}: {count}
              </span>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e8eaf0", padding: "0 20px" }}>
            {[
              { key: "anomalies", label: "🔍 Anomalies & Diagnosis" },
              { key: "messages",  label: "📩 Messages" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "#6366f1" : "#9196a8",
                padding: "12px 16px",
                borderBottom: `2px solid ${tab === t.key ? "#6366f1" : "transparent"}`,
                marginBottom: -1, transition: "0.15s",
              }}>{t.label}</button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

            {tab === "anomalies" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 12 }}>
                    Detected Anomalies
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(selected.anomalies || []).length === 0 && (
                      <div style={{ color: "#b0b5c4", fontSize: 13 }}>No anomalies detected.</div>
                    )}
                    {(selected.anomalies || []).map((a, i) => {
                      const col    = TYPE_COLOR[a.anomaly_type] || TYPE_COLOR["Unknown"];
                      const interp = interps.find(x => x.anomaly_index === i);
                      return (
                        <div key={i} style={{
                          background: "#f8fafc", border: "1px solid #e8eaf0",
                          borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${col}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: interp ? 10 : 0 }}>
                            <span style={{ fontSize: 11, color: "#b0b5c4" }}>#{i + 1}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{a.date}</span>
                            <span style={{
                              background: `${col}18`, color: col,
                              borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700,
                            }}>{a.anomaly_type}</span>
                            <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 11, color: "#b0b5c4" }}>
                              err: {a.reconstruction_error?.toFixed(5)}
                            </span>
                            {/* Quick-fill button */}
                            <button
                              onClick={() => setForm(f => ({ ...f, anomaly_index: i }))}
                              style={{
                                background: "rgba(99,102,241,0.08)", color: "#6366f1",
                                border: "none", borderRadius: 6, padding: "3px 9px",
                                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                              }}
                            >
                              + Diagnose
                            </button>
                          </div>
                          {interp && (
                            <div style={{
                              background: "rgba(52,211,153,0.06)",
                              border: "1px solid rgba(52,211,153,0.25)",
                              borderRadius: 8, padding: "10px 12px", fontSize: 13,
                            }}>
                              <div style={{ color: "#059669", fontWeight: 700, marginBottom: 5, fontSize: 12 }}>
                                🩺 Dr. {interp.doctor_name}
                              </div>
                              <div style={{ color: "#1e293b", marginBottom: 4 }}>
                                <strong style={{ color: "#475569" }}>Diagnosis: </strong>{interp.diagnosis}
                              </div>
                              {interp.solution && (
                                <div style={{ color: "#1e293b" }}>
                                  <strong style={{ color: "#475569" }}>Solution: </strong>{interp.solution}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add interpretation form */}
                <div style={{ background: "#f8fafc", border: "1px solid #e8eaf0", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 14 }}>
                    ➕ Add Interpretation
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 6 }}>
                        Anomaly Index #
                      </label>
                      <input
                        type="number" min={0}
                        value={form.anomaly_index}
                        onChange={e => setForm(f => ({ ...f, anomaly_index: +e.target.value }))}
                        style={{ ...inputStyle, width: 90 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 6 }}>
                        Clinical Diagnosis
                      </label>
                      <textarea
                        rows={2} value={form.diagnosis}
                        onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                        placeholder="Your clinical interpretation of this anomaly…"
                        style={{ ...inputStyle, width: "100%", resize: "none" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#9196a8", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 6 }}>
                        Recommended Solution
                      </label>
                      <textarea
                        rows={2} value={form.solution}
                        onChange={e => setForm(f => ({ ...f, solution: e.target.value }))}
                        placeholder="Recommended action for the caregiver…"
                        style={{ ...inputStyle, width: "100%", resize: "none" }}
                      />
                    </div>
                    <button
                      onClick={saveInterp}
                      disabled={saving || !form.diagnosis.trim()}
                      style={{
                        background: saving || !form.diagnosis.trim() ? "#e8eaf0" : "linear-gradient(135deg,#059669,#34d399)",
                        color: saving || !form.diagnosis.trim() ? "#9196a8" : "#fff",
                        border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 13, fontWeight: 700,
                        cursor: saving || !form.diagnosis.trim() ? "not-allowed" : "pointer",
                        fontFamily: "inherit", alignSelf: "flex-start",
                        boxShadow: saving || !form.diagnosis.trim() ? "none" : "0 3px 12px rgba(52,211,153,0.3)",
                      }}
                    >
                      {saving ? "Saving…" : "💾 Save Interpretation"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "messages" && <MessageThread resultId={selected.id} user={user} />}
          </div>
        </div>
      )}
    </div>
  );
}