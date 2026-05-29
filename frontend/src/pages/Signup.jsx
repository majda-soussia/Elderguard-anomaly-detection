import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authService } from "../services/api";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    role: "caregiver",
  });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const setRole = (role) =>
    setForm((f) => ({ ...f, role }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm)
      return setError("Passwords do not match.");

    if (form.password.length < 8)
      return setError("Password must be at least 8 characters.");

    setLoading(true);
    try {
      await authService.signup(form.name, form.email, form.password, form.role);
      navigate("/login");
    } catch (err) {
      setError(err.message || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      {/* LEFT SIDE */}
      <div className="auth-left">
        <div className="auth-left-content">
          <div className="auth-logo">
            <span className="logo-icon">🛡️</span>
            <h1>ElderGuard</h1>
          </div>
          <p>
            Create your account and start monitoring daily activity patterns
            with intelligent anomaly detection.
          </p>

          <div className="feature-list">
            <div className="feature-item">
              <span className="feature-icon">🔔</span>
              <span>Automatic anomaly alerts</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">📊</span>
              <span>Daily activity dashboards</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🧑‍⚕️</span>
              <span>Doctor & caregiver collaboration</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">👨‍👩‍👧</span>
              <span>Family notifications</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="auth-right">
        <div className="auth-card">
          <h2>Create account</h2>
          <p className="auth-sub">Get started in seconds</p>

          {error && <div className="auth-error">⚠️ {error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">

            {/* ── Role Selector ── */}
            <div className="role-section">
              <p className="role-label">I am joining as</p>
              <div className="role-options">
                <button
                  type="button"
                  className={`role-btn ${form.role === "caregiver" ? "active" : ""}`}
                  onClick={() => setRole("caregiver")}
                >
                  <span className="role-emoji">👩‍⚕️</span>
                  <span className="role-name">Caregiver</span>
                  <span className="role-desc">Monitor & alert</span>
                </button>
                <button
                  type="button"
                  className={`role-btn ${form.role === "doctor" ? "active" : ""}`}
                  onClick={() => setRole("doctor")}
                >
                  <span className="role-emoji">🧑‍⚕️</span>
                  <span className="role-name">Doctor</span>
                  <span className="role-desc">Diagnose & advise</span>
                </button>
              </div>
            </div>

            {/* ── Fields ── */}
            <div className="field">
              <input
                type="text"
                name="name"
                placeholder=" "
                value={form.name}
                onChange={handleChange}
                required
              />
              <label>Full name</label>
            </div>

            <div className="field">
              <input
                type="email"
                name="email"
                placeholder=" "
                value={form.email}
                onChange={handleChange}
                required
              />
              <label>Email address</label>
            </div>

            <div className="fields-row">
              <div className="field">
                <input
                  type="password"
                  name="password"
                  placeholder=" "
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                />
                <label>Password</label>
              </div>

              <div className="field">
                <input
                  type="password"
                  name="confirm"
                  placeholder=" "
                  value={form.confirm}
                  onChange={handleChange}
                  required
                />
                <label>Confirm password</label>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? (
                <span className="btn-loading">
                  <span className="spinner" /> Creating account...
                </span>
              ) : (
                `Create ${form.role === "doctor" ? "Doctor" : "Caregiver"} account →`
              )}
            </button>
          </form>

          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .auth-container {
          display: flex;
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
        }

        /* ── LEFT ── */
        .auth-left {
          flex: 1;
          background: linear-gradient(145deg, #0f172a 0%, #1e3a5f 50%, #0f4c81 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px;
          position: relative;
          overflow: hidden;
        }

        .auth-left::before {
          content: '';
          position: absolute;
          width: 400px; height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%);
          top: -100px; right: -100px;
        }

        .auth-left::after {
          content: '';
          position: absolute;
          width: 300px; height: 300px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 70%);
          bottom: -80px; left: -80px;
        }

        .auth-left-content {
          position: relative;
          z-index: 1;
          max-width: 340px;
        }

        .auth-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .logo-icon { font-size: 36px; }

        .auth-left h1 {
          font-family: 'Sora', sans-serif;
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .auth-left p {
          font-size: 15px;
          opacity: 0.8;
          line-height: 1.7;
          margin-bottom: 32px;
        }

        .feature-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          opacity: 0.9;
        }

        .feature-icon {
          width: 32px; height: 32px;
          background: rgba(255,255,255,0.1);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }

        /* ── RIGHT ── */
        .auth-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          padding: 40px;
          overflow-y: auto;
        }

        .auth-card {
          width: 100%;
          max-width: 440px;
          padding: 8px 0;
        }

        .auth-card h2 {
          font-family: 'Sora', sans-serif;
          font-size: 28px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 6px;
        }

        .auth-sub {
          color: #94a3b8;
          font-size: 14px;
          margin-bottom: 28px;
        }

        .auth-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 12px 16px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 13px;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* ── Role Selector ── */
        .role-section { margin-bottom: 4px; }

        .role-label {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
          margin-bottom: 10px;
        }

        .role-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .role-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 16px 12px;
          border-radius: 12px;
          border: 2px solid #e2e8f0;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 0;
        }

        .role-btn:hover {
          border-color: #c7d2fe;
          background: #f5f3ff;
        }

        .role-btn.active {
          border-color: #6366f1;
          background: #eef2ff;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }

        .role-emoji { font-size: 24px; }

        .role-name {
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
        }

        .role-btn.active .role-name { color: #6366f1; }

        .role-desc {
          font-size: 11px;
          color: #94a3b8;
        }

        /* ── Fields ── */
        .field { position: relative; }

        .fields-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .field input {
          width: 100%;
          padding: 16px 14px 8px;
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          background: white;
          outline: none;
          font-size: 15px;
          color: #0f172a;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.2s;
        }

        .field input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
        }

        .field label {
          position: absolute;
          top: 50%;
          left: 14px;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 14px;
          pointer-events: none;
          transition: 0.2s;
          background: white;
          padding: 0 4px;
        }

        .field input:focus + label,
        .field input:not(:placeholder-shown) + label {
          top: 10px;
          font-size: 11px;
          color: #6366f1;
          font-weight: 500;
          transform: none;
        }

        /* ── Submit ── */
        .submit-btn {
          margin-top: 4px;
          background: linear-gradient(135deg, #6366f1, #818cf8);
          color: white;
          border: none;
          padding: 15px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: 0.2s;
          box-shadow: 0 4px 15px rgba(99,102,241,0.3);
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99,102,241,0.4);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .btn-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          display: inline-block;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .auth-footer {
          margin-top: 24px;
          font-size: 13px;
          color: #94a3b8;
          text-align: center;
        }

        .auth-footer a {
          color: #6366f1;
          text-decoration: none;
          font-weight: 600;
        }

        .auth-footer a:hover { text-decoration: underline; }

        @media (max-width: 768px) {
          .auth-left { display: none; }
          .auth-right { padding: 24px; }
          .fields-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}