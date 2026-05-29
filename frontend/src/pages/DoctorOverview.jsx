import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { authService } from "../services/api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const h  = () => ({ Authorization: `Bearer ${authService.getToken()}` });
const hj = () => ({ ...h(), "Content-Type": "application/json" });

const TYPE_META = {
  "Temporal Shift": { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "🕐", label: "Unusual Timing",       hint: "The patient did something at an unexpected time of day — earlier or later than usual." },
  "Duration":       { color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "⏱️",  label: "Activity Too Long / Short", hint: "An activity lasted much longer or shorter than normal for this patient." },
  "Order":          { color: "#7c3aed", bg: "#fdf4ff", border: "#e9d5ff", icon: "🔄", label: "Routine Out of Order",   hint: "The patient's usual daily sequence was disrupted — e.g. morning and evening habits were swapped." },
  "Unknown":        { color: "#64748b", bg: "#f8fafc", border: "#e2e8f0", icon: "❓", label: "Minor Variation",      hint: "A small, hard-to-classify change was detected. Likely not urgent." },
};
const tm = (t) => TYPE_META[t] || { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "📌", label: t, hint: "" };

const parseJ = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return v; } };

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ value, label, color = "#6366f1", bg = "#eef2ff", icon }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
      {icon && <span style={{ fontSize: 22 }}>{icon}</span>}
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value ?? "—"}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDICAL PLAN SECTION
// ─────────────────────────────────────────────────────────────────────────────
function PlanField({ icon, title, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase",
        letterSpacing: "0.8px", marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ fontSize: 13 }}>{icon}</span> {title}
      </div>
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
        padding: "11px 14px", fontSize: 13.5, color: "#1e293b", lineHeight: 1.75,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {value}
      </div>
    </div>
  );
}

function MedicalPlanView({ home }) {
  const raw = home?.medical_plan;
  if (!raw) return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 10, padding: "48px 24px", textAlign: "center",
    }}>
      <span style={{ fontSize: 36 }}>📋</span>
      <div style={{ fontSize: 14, color: "#94a3b8", maxWidth: 260, lineHeight: 1.6 }}>
        No health notes on file for <strong>{home?.name}</strong>. The caregiver can add these from the Data page.
      </div>
      <div style={{
        marginTop: 6, background: "#fffbeb", border: "1px solid #fde68a",
        borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#92400e",
      }}>
        ⚠️ Without health notes, it is harder to judge if an alert is serious or expected.
      </div>
    </div>
  );

  if (typeof raw === "string") {
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
          📋 Health Notes — {home.name}
        </div>
        <div style={{
          background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
          padding: "14px 16px", fontSize: 13.5, color: "#1e293b", lineHeight: 1.8,
          whiteSpace: "pre-wrap",
        }}>
          {raw}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PlanField icon="🏥" title="Conditions / Diagnosis"       value={raw.diagnosis} />
      <PlanField icon="💊" title="Current Medications"          value={raw.medications} />
      <PlanField icon="🦽" title="Mobility & Physical Limits"   value={raw.mobility_notes} />
      <PlanField icon="🛏️"  title="Sleep Schedule"               value={raw.sleep_schedule} />
      <PlanField icon="🍽️"  title="Daily Routine Notes"          value={raw.routine_notes} />
      <PlanField icon="⚠️"  title="When Alerts May Be Expected"  value={raw.anomaly_context} />
      <PlanField icon="📞" title="Emergency Contact"            value={raw.emergency_contact} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANOMALY ROW
// ─────────────────────────────────────────────────────────────────────────────
function AnomalyRow({ anomaly, index, interp, medicalPlan, onDiagnose }) {
  const [expanded, setExpanded] = useState(false);
  const t = tm(anomaly.anomaly_type);

  const planText = typeof medicalPlan === "string"
    ? medicalPlan
    : medicalPlan ? JSON.stringify(medicalPlan) : "";

  const mobilityKeywords = ["mobility", "wheelchair", "limited", "cannot walk", "bed-bound", "sedentary", "immobile"];
  const likelyExpected = planText && mobilityKeywords.some(k => planText.toLowerCase().includes(k));

  return (
    <div style={{
      border: `1px solid ${t.border}`, borderLeft: `4px solid ${t.color}`,
      borderRadius: 10, overflow: "hidden", transition: "box-shadow 0.15s",
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          background: expanded ? t.bg : "#fff", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 11, color: "#b0b5c4", minWidth: 24, textAlign: "right" }}>
          #{index + 1}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", minWidth: 96 }}>
          {anomaly.date}
        </span>
        <span style={{
          background: t.bg, color: t.color, border: `1px solid ${t.border}`,
          borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
        }}>
          {t.icon} {t.label}
        </span>

        {likelyExpected && !interp && (
          <span style={{
            background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0",
            borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700,
          }}>
            ✓ Likely expected
          </span>
        )}
        {interp && (
          <span style={{
            background: "rgba(52,211,153,0.08)", color: "#059669",
            border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700,
          }}>
            🩺 Reviewed
          </span>
        )}

        <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 11, color: "#b0b5c4" }}>
          score {anomaly.reconstruction_error?.toFixed(5)}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDiagnose(index); }}
          style={{
            background: "rgba(99,102,241,0.09)", color: "#6366f1", border: "none",
            borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          + Add Notes
        </button>
        <span style={{ color: "#c7d2fe", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${t.border}`, background: t.bg }}>
          <div style={{ fontSize: 12, color: t.color, fontWeight: 600, marginBottom: 8 }}>
            {t.hint}
          </div>

          {likelyExpected && (
            <div style={{
              background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8,
              padding: "10px 13px", fontSize: 12, color: "#065f46", marginBottom: 10, lineHeight: 1.6,
            }}>
              <strong>📋 Health Context:</strong> The patient's health notes mention limited mobility.
              This alert may reflect expected behaviour and may not need urgent action.
              Please review before contacting the caregiver.
            </div>
          )}

          {interp ? (
            <div style={{
              background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.25)",
              borderRadius: 8, padding: "12px 14px", fontSize: 13,
            }}>
              <div style={{ color: "#059669", fontWeight: 700, marginBottom: 6, fontSize: 12 }}>
                🩺 Dr. {interp.doctor_name}
              </div>
              <div style={{ color: "#1e293b", marginBottom: interp.solution ? 6 : 0 }}>
                <strong style={{ color: "#475569" }}>Notes: </strong>{interp.diagnosis}
              </div>
              {interp.solution && (
                <div style={{ color: "#1e293b" }}>
                  <strong style={{ color: "#475569" }}>What to do: </strong>{interp.solution}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
              No notes added yet. Click "+ Add Notes" to review this alert.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE THREAD
// ─────────────────────────────────────────────────────────────────────────────
function MessageThread({ resultId, user }) {
  const [thread, setThread]   = useState([]);
  const [body, setBody]       = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState("");
  const bottomRef = useRef(null);

  const load = () =>
    fetch(`${API}/messages/thread/${resultId}`, { headers: h() })
      .then(r => r.json()).then(d => setThread(Array.isArray(d) ? d : []));

  useEffect(() => { if (resultId) load(); }, [resultId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread]);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true); setError("");
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST", headers: hj(),
        body: JSON.stringify({ analysis_result_id: Number(resultId), recipient_type: "caregiver", body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail);
      setBody(""); await load();
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, maxHeight: 340 }}>
        {thread.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#b0b5c4", fontSize: 13 }}>
            No messages yet — start the conversation with the caregiver.
          </div>
        ) : thread.map(msg => {
          const isMe = msg.sender_id === user?.id;
          return (
            <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "72%", padding: "10px 14px",
                background: isMe ? "rgba(99,102,241,0.08)" : "#f4f6fb",
                border: `1px solid ${isMe ? "rgba(99,102,241,0.25)" : "#e8eaf0"}`,
                borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              }}>
                <div style={{ fontSize: 11, color: "#9196a8", marginBottom: 4 }}>
                  <strong style={{ color: isMe ? "#6366f1" : "#475569" }}>{msg.sender_name}</strong>
                  {" · "}{msg.sender_role}
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
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ background: "#f8fafc", border: "1px solid #e8eaf0", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
          📩 Send a Message to the Caregiver
        </div>
        <textarea
          value={body} onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }}
          placeholder="Write your instructions or feedback for the caregiver… (Ctrl+Enter to send)"
          rows={3}
          style={{ width: "100%", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", color: "#1e293b", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={send} disabled={sending || !body.trim()} style={{
            background: sending || !body.trim() ? "#e8eaf0" : "linear-gradient(135deg,#6366f1,#818cf8)",
            color: sending || !body.trim() ? "#9196a8" : "#fff",
            border: "none", borderRadius: 9, padding: "9px 22px", fontSize: 13, fontWeight: 600,
            cursor: sending || !body.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
            boxShadow: sending || !body.trim() ? "none" : "0 3px 10px rgba(99,102,241,0.3)",
          }}>
            {sending ? "Sending…" : "Send ✈"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD NOTES FORM (was: Interpretation Form)
// ─────────────────────────────────────────────────────────────────────────────
function InterpretationForm({ selectedRes, defaultIndex, onSaved }) {
  const [form, setForm]     = useState({ anomaly_index: defaultIndex ?? 0, diagnosis: "", solution: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(f => ({ ...f, anomaly_index: defaultIndex ?? 0 })); }, [defaultIndex]);

  const save = async () => {
    if (!form.diagnosis.trim() || !selectedRes) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/interpretations`, {
        method: "POST", headers: hj(),
        body: JSON.stringify({ analysis_result_id: selectedRes.id, ...form }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      setForm(f => ({ ...f, diagnosis: "", solution: "" }));
      onSaved?.();
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const field = { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", color: "#1e293b", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e8eaf0", borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        🩺 Add Your Review for an Alert
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>
            Alert Number
          </label>
          <input type="number" min={0} value={form.anomaly_index}
            onChange={e => setForm(f => ({ ...f, anomaly_index: +e.target.value }))}
            style={{ ...field, width: 90 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>
            Your Assessment
          </label>
          <textarea rows={2} value={form.diagnosis}
            onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
            placeholder="What do you think this alert means for the patient? Consider their health history…"
            style={{ ...field, width: "100%", resize: "none" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>
            What the Caregiver Should Do
          </label>
          <textarea rows={2} value={form.solution}
            onChange={e => setForm(f => ({ ...f, solution: e.target.value }))}
            placeholder="e.g. Keep a close eye this week, adjust the patient's routine, schedule a check-up…"
            style={{ ...field, width: "100%", resize: "none" }}
          />
        </div>
        <button onClick={save} disabled={saving || !form.diagnosis.trim()} style={{
          background: saving || !form.diagnosis.trim() ? "#e8eaf0" : "linear-gradient(135deg,#059669,#34d399)",
          color: saving || !form.diagnosis.trim() ? "#9196a8" : "#fff",
          border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 13, fontWeight: 700,
          cursor: saving || !form.diagnosis.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
          alignSelf: "flex-start", boxShadow: saving || !form.diagnosis.trim() ? "none" : "0 3px 10px rgba(52,211,153,0.35)",
        }}>
          {saving ? "Saving…" : "💾 Save Review"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE — shown when no home is selected
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState() {
  const steps = [
    { icon: "🏠", title: "Pick a patient home above", desc: "Each card shows one home being monitored. Click it to open the patient's health review." },
    { icon: "📋", title: "Review the health notes", desc: "See the patient's conditions, medications, and daily routine — all in one place." },
    { icon: "⚠️", title: "Check alerts", desc: "Each alert shows a day when the system detected something unusual in the patient's routine." },
    { icon: "🩺", title: "Add your notes", desc: "Write what you think an alert means and what the caregiver should do next." },
    { icon: "📩", title: "Message the caregiver", desc: "Send instructions or reassurance directly to the person looking after the patient." },
  ];

  return (
    <div style={{
      background: "#fff", border: "1px solid #e8eaf0", borderRadius: 20,
      padding: "48px 40px", textAlign: "center",
    }}>
      {/* Illustration area */}
      <div style={{
        width: 90, height: 90, borderRadius: "50%",
        background: "linear-gradient(135deg, #eef2ff 0%, #f0fdf4 100%)",
        border: "3px solid #e0e7ff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 40, margin: "0 auto 24px",
        boxShadow: "0 8px 32px rgba(99,102,241,0.12)",
      }}>
        🏠
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 8px", letterSpacing: "-0.3px" }}>
        Select a patient home to get started
      </h2>
      <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 40px", maxWidth: 440, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
        Choose one of the homes above to see alerts, health notes, and start reviewing the patient's recent activity.
      </p>

      {/* How-to steps */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e8eaf0", borderRadius: 16,
        padding: "28px 32px", textAlign: "left", maxWidth: 600,
        margin: "0 auto",
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 20 }}>
          How this dashboard works
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: "#fff", border: "1.5px solid #e8eaf0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 3 }}>
                  <span style={{ color: "#6366f1", marginRight: 6 }}>{i + 1}.</span>
                  {s.title}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert type legend */}
      <div style={{ marginTop: 32, maxWidth: 600, margin: "32px auto 0" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>
          What do the alert types mean?
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <div key={key} style={{
              background: meta.bg, border: `1px solid ${meta.border}`,
              borderRadius: 10, padding: "12px 14px", textAlign: "left",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: meta.color, marginBottom: 4 }}>
                {meta.icon} {meta.label}
              </div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{meta.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function DoctorDashboard() {
  const { pathname } = useLocation();
  const defaultTab   = pathname.includes("messages") ? "messages" : "plan";

  const [homes,        setHomes]        = useState([]);
  const [selectedHome, setSelectedHome] = useState(null);
  const [results,      setResults]      = useState([]);
  const [selectedRes,  setSelectedRes]  = useState(null);
  const [interps,      setInterps]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState(defaultTab);
  const [diagnoseIdx,  setDiagnoseIdx]  = useState(null);

  const user = authService.getUser?.() || {};

  useEffect(() => {
    fetch(`${API}/homes`, { headers: h() })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setHomes(Array.isArray(d) ? d : []))
      .catch(() => setHomes([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedHome) { setResults([]); setSelectedRes(null); return; }
    fetch(`${API}/analyze/results`, { headers: h() })
      .then(r => r.json())
      .then(d => {
        const filtered = (Array.isArray(d) ? d : []).filter(r => r.home_id === selectedHome.id);
        setResults(filtered);
        setSelectedRes(filtered[0] || null);
      })
      .catch(() => setResults([]));
  }, [selectedHome]);

  const reloadInterps = () => {
    if (!selectedRes) return;
    fetch(`${API}/interpretations/${selectedRes.id}`, { headers: h() })
      .then(r => r.json()).then(d => setInterps(Array.isArray(d) ? d : []))
      .catch(() => setInterps([]));
  };
  useEffect(reloadInterps, [selectedRes]);

  const selectResult = (r) => { setSelectedRes(r); setTab("plan"); setDiagnoseIdx(null); };
  const handleDiagnose = (idx) => { setDiagnoseIdx(idx); setTab("anomalies"); };

  const anomalies  = parseJ(selectedRes?.anomalies) || [];
  const typeCounts = parseJ(selectedRes?.type_counts) || {};
  const planText   = selectedHome?.medical_plan;

  const tabStyle = (key) => ({
    background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
    fontSize: 13, fontWeight: tab === key ? 700 : 500,
    color: tab === key ? "#6366f1" : "#9196a8",
    padding: "11px 16px", borderBottom: `2px solid ${tab === key ? "#6366f1" : "transparent"}`,
    marginBottom: -1, transition: "color 0.15s",
  });

  const card = { background: "#fff", border: "1px solid #e8eaf0", borderRadius: 16, overflow: "hidden" };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", color: "#1e293b", maxWidth: 1280 }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px", color: "#0f172a", letterSpacing: "-0.5px" }}>
            🩺 Medical Dashboard
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
            Select a patient home to review their activity alerts and health notes.
          </p>
        </div>
        {selectedHome && (
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "right" }}>
            <div style={{ fontWeight: 700, color: "#475569" }}>{selectedHome.name}</div>
            {selectedHome.location && <div>📍 {selectedHome.location}</div>}
          </div>
        )}
      </div>

      {/* ── HOME SELECTOR STRIP ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>
          🏠 Patient Homes
        </div>

        {loading ? (
          <div style={{ color: "#b0b5c4", fontSize: 13 }}>Loading homes…</div>
        ) : homes.length === 0 ? (
          <div style={{
            background: "#f8fafc", border: "1px dashed #e2e8f0", borderRadius: 12,
            padding: "20px 24px", color: "#94a3b8", fontSize: 13,
          }}>
            No homes found. Ask a caregiver to add homes and patients first.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {homes.map(home => {
              const isSel   = selectedHome?.id === home.id;
              const hasPlan = !!home.medical_plan;
              const doctor  = home.contacts?.find(c => c.type === "doctor");
              const family  = home.contacts?.find(c => c.type === "family");
              return (
                <button
                  key={home.id}
                  onClick={() => { setSelectedHome(home); setTab("plan"); }}
                  style={{
                    padding: "18px 22px", borderRadius: 16, cursor: "pointer",
                    fontFamily: "inherit", textAlign: "left", transition: "all 0.2s",
                    background: isSel ? "#6366f1" : "#fff",
                    border: `2px solid ${isSel ? "#6366f1" : "#e8eaf0"}`,
                    boxShadow: isSel ? "0 6px 24px rgba(99,102,241,0.28)" : "0 2px 8px rgba(0,0,0,0.04)",
                    minWidth: 200, maxWidth: 240,
                    transform: isSel ? "translateY(-2px)" : "none",
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 8 }}>🏠</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: isSel ? "#fff" : "#0f172a", marginBottom: 4 }}>
                    {home.name}
                  </div>
                  {home.location && (
                    <div style={{ fontSize: 12, color: isSel ? "rgba(255,255,255,0.75)" : "#64748b", marginBottom: 2 }}>
                      📍 {home.location}
                    </div>
                  )}
                  {home.caregiver_name && (
                    <div style={{ fontSize: 12, color: isSel ? "rgba(255,255,255,0.65)" : "#94a3b8", marginBottom: 4 }}>
                      👩‍⚕️ {home.caregiver_name}
                    </div>
                  )}
                  {doctor && (
                    <div style={{ fontSize: 11, color: isSel ? "rgba(255,255,255,0.6)" : "#94a3b8" }}>
                      👨‍⚕️ Dr. {doctor.name}
                    </div>
                  )}
                  {family && (
                    <div style={{ fontSize: 11, color: isSel ? "rgba(255,255,255,0.6)" : "#94a3b8" }}>
                      👨‍👩‍👧 {family.name}
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
                      background: hasPlan
                        ? (isSel ? "rgba(255,255,255,0.2)" : "#ecfdf5")
                        : (isSel ? "rgba(255,255,255,0.15)" : "#fef9c3"),
                      color: hasPlan
                        ? (isSel ? "#fff" : "#059669")
                        : (isSel ? "rgba(255,255,255,0.85)" : "#854d0e"),
                    }}>
                      {hasPlan ? "✓ Health notes on file" : "⚠ No health notes yet"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      {!selectedHome ? (
        <EmptyState />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── LEFT: Analysis results list ── */}
          <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 4 }}>
              Past Analyses
            </div>

            {results.length === 0 ? (
              <div style={{ color: "#b0b5c4", fontSize: 13, textAlign: "center", padding: "28px 0" }}>
                No reports run yet for <strong>{selectedHome.name}</strong>.
              </div>
            ) : results.map(r => (
              <button key={r.id} onClick={() => selectResult(r)} style={{
                width: "100%", textAlign: "left", padding: "11px 13px", borderRadius: 10,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                background: selectedRes?.id === r.id ? "rgba(99,102,241,0.07)" : "#f8fafc",
                border: `1.5px solid ${selectedRes?.id === r.id ? "#6366f1" : "#e8eaf0"}`,
              }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", marginBottom: 3 }}>
                  📄 {selectedHome.name} 
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, color: r.total_anomalies > 0 ? "#ef4444" : "#059669" }}>
                  {r.total_anomalies > 0 ? `⚠️ ${r.total_anomalies} alert${r.total_anomalies !== 1 ? "s" : ""}` : "✅ All normal"}
                  <span style={{ color: "#9196a8", fontWeight: 400 }}> · {r.total_days} days</span>
                </div>
                <div style={{ fontSize: 11, color: "#b0b5c4" }}>
                  {new Date(r.analyzed_at || r.created_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>

          {/* ── RIGHT: Detail panel ── */}
          {!selectedRes ? (
            <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 0", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 40, opacity: 0.35 }}>🔍</span>
              <div style={{ color: "#b0b5c4", fontSize: 14 }}>Select a report from the left to review it</div>
            </div>
          ) : (
            <div style={{ ...card, display: "flex", flexDirection: "column" }}>

              {/* Result header */}
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #e8eaf0" }}>
                <div style={{ fontWeight: 800, fontSize: 17, color: "#0f172a", marginBottom: 4, letterSpacing: "-0.3px" }}>
                  {selectedHome.name} 
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
                  {selectedRes.total_days} days monitored 
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <StatCard icon="⚠️" value={selectedRes.total_anomalies} label="Alerts Found"  color="#ef4444" bg="#fef2f2" />
                  <StatCard icon="✅" value={selectedRes.total_days - selectedRes.total_anomalies} label="Normal Days" color="#059669" bg="#ecfdf5" />
                  <StatCard icon="📊" value={`${parseFloat(selectedRes.anomaly_rate ?? 0).toFixed(1)}%`} label="Alert Rate" color="#d97706" bg="#fffbeb" />
                </div>

                {Object.keys(typeCounts).length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                    {Object.entries(typeCounts).map(([type, count]) => {
                      const t = tm(type);
                      return (
                        <span key={type} style={{
                          background: t.bg, color: t.color, border: `1px solid ${t.border}`,
                          borderRadius: 20, padding: "3px 11px", fontSize: 11, fontWeight: 700,
                        }}>
                          {t.icon} {t.label}: {count}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid #e8eaf0", padding: "0 22px" }}>
                {[
                  { key: "plan",      label: "📋 Health Notes & Context" },
                  { key: "anomalies", label: "⚠️ Alerts & Your Review" },
                  { key: "messages",  label: "📩 Messages" },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ padding: 22, overflowY: "auto", maxHeight: "calc(100vh - 420px)" }}>

                {/* ── HEALTH NOTES + CONTEXT TAB ── */}
                {tab === "plan" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                        📋 Patient Health Notes
                        {!planText && (
                          <span style={{ background: "#fef9c3", color: "#854d0e", border: "1px solid #fde68a", borderRadius: 10, padding: "1px 7px", fontSize: 10 }}>
                            Missing
                          </span>
                        )}
                      </div>
                      <MedicalPlanView home={selectedHome} />
                    </div>

                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 16 }}>
                        ⚠️ Alerts — Compare with Health Notes
                      </div>

                      <div style={{
                        background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)",
                        borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#475569",
                        marginBottom: 16, lineHeight: 1.6,
                      }}>
                        💡 <strong style={{ color: "#6366f1" }}>Tip:</strong> Read the health notes on the left, then check the alerts on the right.
                        If the patient has limited mobility, some alerts may simply reflect their usual behaviour and are not a cause for concern.
                      </div>

                      {anomalies.length === 0 ? (
                        <div style={{ color: "#b0b5c4", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
                          ✅ No alerts detected in this report.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {anomalies.slice(0, 10).map((a, i) => {
                            const t = tm(a.anomaly_type);
                            const interp = interps.find(x => x.anomaly_index === i);
                            return (
                              <div key={i} style={{
                                background: "#f8fafc", border: `1px solid ${t.border}`,
                                borderLeft: `3px solid ${t.color}`, borderRadius: 10, padding: "10px 14px",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 11, color: "#b0b5c4" }}>#{i + 1}</span>
                                  <span style={{ fontSize: 13, fontWeight: 700 }}>{a.date}</span>
                                  <span style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                                    {t.icon} {t.label}
                                  </span>
                                  {interp && (
                                    <span style={{ background: "rgba(52,211,153,0.1)", color: "#059669", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                                      🩺 Reviewed
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleDiagnose(i)}
                                    style={{ marginLeft: "auto", background: "rgba(99,102,241,0.08)", color: "#6366f1", border: "none", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                                  >
                                    + Add Notes
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {anomalies.length > 10 && (
                            <button onClick={() => setTab("anomalies")} style={{ background: "none", border: "1px dashed #e2e8f0", borderRadius: 8, padding: "8px", cursor: "pointer", color: "#6366f1", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                              + {anomalies.length - 10} more — see all alerts →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── ALERTS & REVIEW TAB ── */}
                {tab === "anomalies" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {planText && (
                      <div style={{
                        background: "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(129,140,248,0.04))",
                        border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: "14px 18px",
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                          📋 Health Context — {selectedHome.name}
                        </div>
                        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7,
                          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>
                          {typeof planText === "string" ? planText : JSON.stringify(planText)}
                        </div>
                        <button onClick={() => setTab("plan")} style={{
                          marginTop: 8, background: "none", border: "none", color: "#6366f1",
                          fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit",
                        }}>
                          View full health notes →
                        </button>
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>
                        Activity Alerts — click any row to expand
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {anomalies.length === 0 ? (
                          <div style={{ color: "#b0b5c4", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
                            ✅ No alerts detected in this report.
                          </div>
                        ) : anomalies.map((a, i) => (
                          <AnomalyRow
                            key={i} anomaly={a} index={i}
                            interp={interps.find(x => x.anomaly_index === i)}
                            medicalPlan={planText}
                            onDiagnose={handleDiagnose}
                          />
                        ))}
                      </div>
                    </div>

                    <InterpretationForm
                      selectedRes={selectedRes}
                      defaultIndex={diagnoseIdx}
                      onSaved={reloadInterps}
                    />
                  </div>
                )}

                {/* ── MESSAGES TAB ── */}
                {tab === "messages" && (
                  <MessageThread resultId={selectedRes.id} user={user} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}