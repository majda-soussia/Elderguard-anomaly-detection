const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── JWT decoder (no library needed) ─────────────────────
function decodeToken(token) {
  try {
    const payload = token.split(".")[1];
    // atob works in browser; add padding if needed
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded  = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// ─── Auth ────────────────────────────────────────────────
export const authService = {
  async login(email, password) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Login failed");
    const data = await res.json();

    // Save token
    localStorage.setItem("token", data.access_token);

    // Decode and save user info (id, name, email, role) from JWT payload
    // Also merge any user object the backend sends directly
    const decoded = decodeToken(data.access_token);
    const user = {
      id:    data.user?.id    ?? decoded?.id    ?? decoded?.sub ?? null,
      name:  data.user?.name  ?? decoded?.name  ?? "",
      email: data.user?.email ?? decoded?.email ?? email,
      role:  data.user?.role  ?? decoded?.role  ?? "caregiver",
    };
    localStorage.setItem("user", JSON.stringify(user));

    return data;
  },

  async signup(name, email, password, role = "caregiver") {
    const res = await fetch(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Signup failed");
    return res.json();
  },

  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },

  getToken() {
    return localStorage.getItem("token");
  },

  // Returns the saved user object { id, name, email, role }
  getUser() {
    try {
      const raw = localStorage.getItem("user");
      if (raw) return JSON.parse(raw);
      // Fallback: decode from token if user key is missing
      const token = this.getToken();
      if (!token) return null;
      return decodeToken(token);
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    const token = localStorage.getItem("token");
    if (!token) return false;
    // Check expiry from JWT payload
    const decoded = decodeToken(token);
    if (decoded?.exp && decoded.exp * 1000 < Date.now()) {
      this.logout(); // auto-clear expired token
      return false;
    }
    return true;
  },

  getRole() {
    return this.getUser()?.role || null;
  },
};

// ─── Helpers ─────────────────────────────────────────────
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${authService.getToken()}`,
});

// ─── CRUD: Records ────────────────────────────────────────
export const recordsService = {
  async getAll() {
    const res = await fetch(`${BASE_URL}/records`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch records");
    return res.json();
  },

  async getById(id) {
    const res = await fetch(`${BASE_URL}/records/${id}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Record not found");
    return res.json();
  },

  async create(payload) {
    const res = await fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create record");
    return res.json();
  },

  async update(id, payload) {
    const res = await fetch(`${BASE_URL}/records/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update record");
    return res.json();
  },

  async delete(id) {
    const res = await fetch(`${BASE_URL}/records/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to delete record");
    return res.json();
  },
};

// ─── Anomaly Detection ────────────────────────────────────
export const anomalyService = {
  async detect(data) {
    const res = await fetch(`${BASE_URL}/detect`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error("Detection failed");
    return res.json();
  },

  async getResults() {
    const res = await fetch(`${BASE_URL}/results`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch results");
    return res.json();
  },
};