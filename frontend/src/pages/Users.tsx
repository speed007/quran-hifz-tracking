import { FormEvent, useEffect, useState } from "react";
import { api, Student, User } from "../api";

export default function Users({ user }: { user: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [studentId, setStudentId] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const isCreator = user.role === "creator";

  useEffect(() => {
    api.users().then(setUsers).catch((e) => setError((e as Error).message));
    api.students().then(setStudents).catch(() => {});
  }, [reload]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.createUser({
        name,
        username,
        password,
        role,
        student_id: studentId ? Number(studentId) : null,
      });
      setName("");
      setUsername("");
      setPassword("");
      setRole("user");
      setStudentId("");
      setMessage("User created.");
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleActive(target: User) {
    setError("");
    try {
      await api.updateUser(target.id, { is_active: !target.is_active });
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function resetPassword(target: User) {
    const value = window.prompt(`New password for ${target.username} (min 6 characters):`);
    if (!value) return;
    setError("");
    try {
      await api.updateUser(target.id, { password: value });
      setMessage(`Password reset for ${target.username}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(target: User) {
    if (!window.confirm(`Delete user "${target.username}"? This cannot be undone.`)) return;
    setError("");
    try {
      await api.deleteUser(target.id);
      setMessage(`User ${target.username} deleted.`);
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function canManage(target: User) {
    if (target.role === "creator") return false;
    if (target.id === user.id) return false;
    if (isCreator) return true;
    return target.role === "user";
  }

  function canDelete(target: User) {
    return canManage(target) && isCreator;
  }

  function roleLabel(role: string) {
    if (role === "creator") return "Creator";
    if (role === "admin") return "Admin";
    return "User (read-only)";
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

  async function changeStudent(target: User, value: string) {
    setError("");
    try {
      await api.updateUser(target.id, {
        student_id: value ? Number(value) : null,
      });
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
      setReload((n) => n + 1);
    }
  }

  function studentName(studentId: number | null) {
    if (studentId == null) return <span className="muted">—</span>;
    const s = students.find((x) => x.id === studentId);
    return s ? s.name : <span className="muted">#{studentId}</span>;
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
            {isCreator && <option value="admin">Admin</option>}
          </select>
        </label>
        {role === "user" && (
          <label>
            Linked student
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">— None —</option>
              {students.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit">Create user</button>
      </form>

      <h2>Existing users</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Role</th>
            <th>Student</th>
            <th>Telegram linked</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.username}</td>
              <td>{roleLabel(u.role)}</td>
              <td>
                {canManage(u) && u.role === "user" ? (
                  <select
                    value={u.student_id ? String(u.student_id) : ""}
                    onChange={(e) => changeStudent(u, e.target.value)}
                  >
                    <option value="">—</option>
                    {students.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  studentName(u.student_id)
                )}
              </td>
              <td>{u.telegram_id ? "Yes" : "No"}</td>
              <td>{u.is_active ? "Yes" : "No"}</td>
              <td>
                {u.id === user.id ? (
                  <span className="muted">You</span>
                ) : canManage(u) ? (
                  <>
                    {canDelete(u) && (
                      <button className="danger" onClick={() => remove(u)}>
                        Delete
                      </button>
                    )}
                    <button onClick={() => toggleActive(u)}>
                      {u.is_active ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => resetPassword(u)}>Reset password</button>
                  </>
                ) : (
                  <span className="muted">Protected</span>
                )}
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
