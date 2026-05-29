import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authService } from "../services/api";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ email: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
            const data = await authService.login(form.email, form.password);

      // safer: get user from authService (already stored)
      const user = authService.getUser();

      if (user?.role === "doctor") {
        navigate("/doctor/dashboard", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
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
            Intelligent monitoring system for elderly daily activities.
            Stay safe. Stay connected.
          </p>
          <div className="auth-left-badges">
            <span className="badge">👩‍⚕️ Caregivers</span>
            <span className="badge">🧑‍⚕️ Doctors</span>
            <span className="badge">👨‍👩‍👧 Families</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="auth-right">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p className="auth-sub">Sign in to your account</p>

          {error && <div className="auth-error">⚠️ {error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
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

            <div className="field">
              <input
                type="password"
                name="password"
                placeholder=" "
                value={form.password}
                onChange={handleChange}
                required
              />
              <label>Password</label>
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? (
                <span className="btn-loading">
                  <span className="spinner" /> Signing in...
                </span>
              ) : (
                "Sign in →"
              )}
            </button>
          </form>

          <p className="auth-footer">
            Don't have an account? <Link to="/signup">Create one</Link>
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

        .logo-icon {
          font-size: 36px;
        }

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

        .auth-left-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .badge {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.15);
          backdrop-filter: blur(10px);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
        }

        /* ── RIGHT ── */
        .auth-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          padding: 40px;
        }

        .auth-card {
          width: 100%;
          max-width: 400px;
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
          margin-bottom: 32px;
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
          gap: 18px;
        }

        /* Floating label */
        .field {
          position: relative;
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

        /* Submit button */
        .submit-btn {
          margin-top: 6px;
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
          letter-spacing: 0.2px;
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

        .auth-footer a:hover {
          text-decoration: underline;
        }

        @media (max-width: 768px) {
          .auth-left { display: none; }
          .auth-right { padding: 24px; }
        }
      `}</style>
    </div>
  );
}