import { FormEvent, useEffect, useState } from "react";
import { api, User } from "../api";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [linkCode, setLinkCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.users().then(setUsers).catch((e) => setError((e as Error).message));
  }, [reload]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.createUser({ name, username, password, role });
      setName("");
      setUsername("");
      setPassword("");
      setRole("user");
      setMessage("User created.");
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleActive(user: User) {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function makeLinkCode() {
    setError("");
    try {
      const res = await api.linkCode();
      setLinkCode(res.code);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <h1>Users</h1>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <h2>Add user</h2>
      <form className="card form" onSubmit={add}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
            <option value="user">User (read-only)</option>
            <option value="admin">Admin (full access)</option>
          </select>
        </label>
        <button type="submit">Create user</button>
      </form>

      <h2>Existing users</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Role</th>
            <th>Telegram linked</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.username}</td>
              <td>{u.role}</td>
              <td>{u.telegram_id ? "Yes" : "No"}</td>
              <td>{u.is_active ? "Yes" : "No"}</td>
              <td>
                <button className="danger" onClick={() => toggleActive(u)}>
                  {u.is_active ? "Disable" : "Enable"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Telegram linking</h2>
      <p className="muted">
        To link a Telegram account, create a code, then the user sends{" "}
        <code>/start &lt;code&gt;</code> to the bot.
      </p>
      <button onClick={makeLinkCode}>Generate link code</button>
      {linkCode && (
        <p className="success">
          Send <code>/start {linkCode}</code> to the bot.
        </p>
      )}
    </div>
  );
}
