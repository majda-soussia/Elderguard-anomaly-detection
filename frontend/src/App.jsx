import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { authService } from "./services/api";

// ── Public pages ──────────────────────────────────────────
import Login  from "./pages/Login";
import Signup from "./pages/Signup";

// ── Caregiver pages ───────────────────────────────────────
import CaregiverDashboard from "./components/Dashboard";
import Alerts             from "./pages/Alerts";
import Messages           from "./pages/MessageDoctor";
import Activity           from "./pages/Analysis";
import Report from "./pages/Report";

// ── Doctor pages ──────────────────────────────────────────
import DoctorOverview   from "./pages/DoctorOverview";    // stats overview  → /doctor/dashboard
import DoctorReview     from "./pages/DoctorDashboard";   // anomaly review  → /doctor/review
import DoctorMessages   from "./pages/DoctorDashboard";   // reuse same component with prop or make separate

// ── Admin pages ───────────────────────────────────────────
import AdminDashboard from "./pages/AdminDashboard";
import AdminDatasets  from "./pages/AdminDatasets";
import AdminAnalysis  from "./pages/AdminAnalysis";
import AdminUsers     from "./pages/AdminUsers";
import AdminHomes     from "./pages/AdminHomes";

// ─── Route Guards ─────────────────────────────────────────
function RequireCaregiver({ children }) {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />;
  const role = authService.getRole();
  if (role === "doctor") return <Navigate to="/doctor/dashboard" replace />;
  if (role === "admin")  return <Navigate to="/admin/dashboard"  replace />;
  return children;
}

function RequireDoctor({ children }) {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />;
  const role = authService.getRole();
  if (role !== "doctor") return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireAdmin({ children }) {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />;
  const role = authService.getRole();
  if (role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

// ─── Nav definitions ─────────────────────────────────────
const NAV_CAREGIVER = [
  { to: "/dashboard", icon: "◈",  label: "Dashboard"      },
  { to: "/alerts",    icon: "🔔", label: "Alerts"         },
  { to: "/messages",  icon: "📩", label: "Message Doctor" },
  { to: "/activity",  icon: "📊", label: "Daily Activity" },
];

const NAV_DOCTOR = [
  { to: "/doctor/dashboard", icon: "◈",  label: "Dashboard"       },
  /*{ to: "/doctor/review",    icon: "🔍", label: "Review Anomalies" },}
  { to: "/doctor/messages",  icon: "📩", label: "Messages"         },*/
];

const NAV_ADMIN = [
  { to: "/admin/dashboard", icon: "◈",  label: "Dashboard" },
  { to: "/admin/homes",     icon: "🏠", label: "Homes"     },
  { to: "/admin/datasets",  icon: "📂", label: "Datasets"  },
  { to: "/admin/analysis",  icon: "⚡", label: "Analysis"  },
  { to: "/admin/users",     icon: "👥", label: "Users"     },
];

// ─── Sidebar ─────────────────────────────────────────────
function Sidebar() {
  const loc  = useLocation();
  const user = authService.getUser();
  const role = user?.role || "caregiver";

  const navItems =
    role === "admin"  ? NAV_ADMIN :
    role === "doctor" ? NAV_DOCTOR :
    NAV_CAREGIVER;

  const badgeConfig = {
    admin:     { bg: "#faf5ff", border: "#ddd6fe", color: "#7c3aed", icon: "🔑",  label: "Admin"     },
    doctor:    { bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a", icon: "🧑‍⚕️", label: "Doctor"    },
    caregiver: { bg: "#e0f2fe", border: "#7dd3fc", color: "#0284c7", icon: "👩‍⚕️", label: "Caregiver" },
  };
  const badge = badgeConfig[role] || badgeConfig.caregiver;

  const handleLogout = () => {
    authService.logout();
    window.location.replace("/login");
  };

  return (
    <nav style={{
      width: 240, background: "#fff", borderRight: "1px solid #e8eaf0",
      display: "flex", flexDirection: "column", padding: "24px 16px",
      fontFamily: "'DM Sans', sans-serif", gap: 4, flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 24, color: "#6366f1" }}>⬡</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1e1f2e" }}>ElderGuard</div>
          <div style={{ fontSize: 11, color: "#9aa0b4" }}>Monitoring System</div>
        </div>
      </div>

      {/* Role badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px", borderRadius: 10,
        border: `1.5px solid ${badge.border}`, background: badge.bg, marginBottom: 16,
      }}>
        <span style={{ fontSize: 22 }}>{badge.icon}</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: badge.color }}>
            {badge.label}
          </div>
          <div style={{ fontSize: 13, color: "#475569", fontWeight: 500, marginTop: 1 }}>
            {user?.name || "—"}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#9aa0b4", marginBottom: 8, paddingLeft: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Navigation
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map((n) => {
          const active = loc.pathname === n.to;
          return (
            <Link key={n.to} to={n.to} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 10,
              color: active ? "#6366f1" : "#9196a8",
              background: active ? "rgba(99,102,241,0.1)" : "transparent",
              fontWeight: active ? 600 : 400,
              textDecoration: "none", fontSize: 14, transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 14 }}>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </div>

      {role === "admin" && (
        <div style={{ marginTop: 12, background: "#faf5ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 4 }}>Admin Mode</div>
          <div style={{ fontSize: 11, color: "#9196a8", lineHeight: 1.5 }}>Full access to datasets, analysis, and users.</div>
        </div>
      )}

      <button
        onClick={handleLogout}
        style={{ marginTop: "auto", border: "none", background: "#f8f9fc", padding: "10px", borderRadius: 10, cursor: "pointer", color: "#b0b5c4", fontFamily: "inherit", fontSize: 13, transition: "all 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#ef4444"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#f8f9fc"; e.currentTarget.style.color = "#b0b5c4"; }}
      >
        ⏻ Logout
      </button>
    </nav>
  );
}

// ─── App Shell — key forces unmount on every route change ─
function AppShell({ children }) {
  const { pathname } = useLocation();
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f4f6fb" }}>
      <Sidebar />
      <main key={pathname} style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}

// ─── Smart redirect ───────────────────────────────────────
function SmartRedirect() {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />;
  const role = authService.getRole();
  if (role === "admin")  return <Navigate to="/admin/dashboard"  replace />;
  if (role === "doctor") return <Navigate to="/doctor/dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
}

// ─── Routes ───────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"  element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* ── Caregiver ── */}
        <Route path="/dashboard" element={
          <RequireCaregiver><AppShell><CaregiverDashboard /></AppShell></RequireCaregiver>
        }/>
        <Route path="/alerts" element={
          <RequireCaregiver><AppShell><Alerts /></AppShell></RequireCaregiver>
        }/>
        <Route path="/messages" element={
          <RequireCaregiver><AppShell><Messages /></AppShell></RequireCaregiver>
        }/>
        <Route path="/messages/:resultId" element={
          <RequireCaregiver><AppShell><Messages /></AppShell></RequireCaregiver>
        }/>
        <Route path="/activity" element={
          <RequireCaregiver><AppShell><Activity /></AppShell></RequireCaregiver>
        }/>

        {/* ── Doctor ──
              /doctor/dashboard  → DoctorOverview   (stats + table)
              /doctor/review     → DoctorDashboard  (anomaly review + diagnosis)
              /doctor/messages   → DoctorDashboard  with messages tab auto-open
        */}
        <Route path="/doctor/dashboard" element={
          <RequireDoctor><AppShell><DoctorOverview /></AppShell></RequireDoctor>
        }/>
        {/*<Route path="/doctor/review" element={
          <RequireDoctor><AppShell><DoctorReview /></AppShell></RequireDoctor>
        }/>
        <Route path="/doctor/review/:resultId" element={
          <RequireDoctor><AppShell><DoctorReview /></AppShell></RequireDoctor>
        }/>*/}
        <Route path="/doctor/messages" element={
          <RequireDoctor><AppShell><DoctorMessages /></AppShell></RequireDoctor>
        }/>
        <Route path="/doctor/messages/:resultId" element={
          <RequireDoctor><AppShell><DoctorMessages /></AppShell></RequireDoctor>
        }/>

        {/* ── Admin ── */}
        <Route path="/admin/dashboard" element={
          <RequireAdmin><AppShell><AdminDashboard /></AppShell></RequireAdmin>
        }/>
        <Route path="/admin/homes" element={
          <RequireAdmin><AppShell><AdminHomes /></AppShell></RequireAdmin>
        }/>
        <Route path="/admin/datasets" element={
          <RequireAdmin><AppShell><AdminDatasets /></AppShell></RequireAdmin>
        }/>
        <Route path="/admin/analysis" element={
          <RequireAdmin><AppShell><AdminAnalysis /></AppShell></RequireAdmin>
        }/>
        <Route path="/admin/users" element={
          <RequireAdmin><AppShell><AdminUsers /></AppShell></RequireAdmin>
        }/>

        {/* Catch-all */}
        <Route path="*" element={<SmartRedirect />} />
        <Route path="/report" element={<Report />} />
      </Routes>
    </BrowserRouter>
  );
}