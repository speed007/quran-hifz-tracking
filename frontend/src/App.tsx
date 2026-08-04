import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { api, User } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import HistoryPage from "./pages/History";
import LogSession from "./pages/LogSession";
import Students from "./pages/Students";
import SettingsPage from "./pages/Settings";
import Users from "./pages/Users";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("hifz-theme");
    setTheme(stored === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("hifz-theme", theme);
  }, [theme]);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    navigate("/login");
  }

  function handleLogin(user: User) {
    setUser(user);
    navigate("/");
  }

  if (loading) return <div className="center">Loading…</div>;

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="app">
      <nav className="nav">
        <span className="brand">Qur'an Hifz</span>
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/history">History</NavLink>
        {user.role !== "user" && <NavLink to="/log">Log session</NavLink>}
        {user.role !== "user" && <NavLink to="/students">Students</NavLink>}
        {user.role !== "user" && <NavLink to="/settings">Settings</NavLink>}
        {user.role === "creator" && <NavLink to="/users">Users</NavLink>}
        <button
          className="link-button theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle light/dark theme"
        >
          {theme === "dark" ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
              </svg>
              Light
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
              Dark
            </>
          )}
        </button>
        <button className="link-button" onClick={handleLogout}>
          Log out
        </button>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/history" element={<HistoryPage user={user} />} />
          {user.role !== "user" && <Route path="/log" element={<LogSession user={user} />} />}
          {user.role !== "user" && <Route path="/students" element={<Students user={user} />} />}
          {user.role !== "user" && <Route path="/settings" element={<SettingsPage user={user} />} />}
          {user.role === "creator" && <Route path="/users" element={<Users user={user} />} />}
        </Routes>
      </main>
    </div>
  );
}
