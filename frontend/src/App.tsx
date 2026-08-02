import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { api, User } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LogSession from "./pages/LogSession";
import Students from "./pages/Students";
import SettingsPage from "./pages/Settings";
import Users from "./pages/Users";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  if (loading) return <div className="center">Loading…</div>;

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <nav className="nav">
        <span className="brand">Qur'an Hifz</span>
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/log">Log session</NavLink>
        <NavLink to="/students">Students</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        {user.role !== "user" && <NavLink to="/users">Users</NavLink>}
        <button className="link-button" onClick={handleLogout}>
          Log out
        </button>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/log" element={<LogSession user={user} />} />
          <Route path="/students" element={<Students user={user} />} />
          <Route path="/settings" element={<SettingsPage user={user} />} />
          {user.role !== "user" && <Route path="/users" element={<Users user={user} />} />}
        </Routes>
      </main>
    </div>
  );
}
