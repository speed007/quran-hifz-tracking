import { FormEvent, useEffect, useState } from "react";
import { api, Stats, Student, User } from "../api";

export default function Students({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const [logins, setLogins] = useState<Record<number, User>>({});
  const [loginFormFor, setLoginFormFor] = useState<number | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const isAdmin = user.role !== "user";

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError((e as Error).message));
  }, [reload]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .studentLogins()
      .then((rows) =>
        setLogins(
          Object.fromEntries(
            rows.map((r) => [r.student_id ?? -1, r])
          )
        )
      )
      .catch(() => {});
  }, [isAdmin, reload]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.createStudent(name.trim());
      setName("");
      setMessage("Student added.");
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this student and all their sessions?")) return;
    try {
      await api.deleteStudent(id);
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startLogin(student: Student) {
    setLoginFormFor(student.id);
    setLoginName(student.name);
    setLoginUsername("");
    setLoginPassword("");
  }

  async function createLogin(studentId: number) {
    setError("");
    setMessage("");
    try {
      await api.createUser({
        name: loginName.trim() || studentName(studentId),
        username: loginUsername.trim(),
        password: loginPassword,
        role: "user",
        student_id: studentId,
      });
      setLoginFormFor(null);
      setMessage("Login created.");
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function resetLoginPassword(target: User) {
    const value = prompt(`New password for ${target.username} (min 6 characters):`);
    if (!value) return;
    setError("");
    try {
      await api.updateUser(target.id, { password: value });
      setMessage(`Password reset for ${target.username}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleLoginActive(target: User) {
    setError("");
    try {
      await api.updateUser(target.id, { is_active: !target.is_active });
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeLogin(target: User) {
    if (!confirm(`Delete login "${target.username}"? This cannot be undone.`)) return;
    setError("");
    try {
      await api.deleteUser(target.id);
      setMessage(`Login ${target.username} deleted.`);
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function studentName(studentId: number) {
    return stats?.students.find((s) => s.id === studentId)?.name ?? "";
  }

  if (error) return <div className="card error">{error}</div>;
  if (!stats) return <div className="center">Loading…</div>;

  return (
    <div>
      <h1>Students</h1>
      {isAdmin && (
        <form className="card form row" onSubmit={add}>
          <input
            placeholder="Student name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button type="submit">Add student</button>
        </form>
      )}
      {message && <p className="success">{message}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Pages memorised</th>
            <th>Progress</th>
            <th>Current page</th>
            {isAdmin && <th>Login</th>}
            {isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {stats.students.map((student) => {
            const p = stats.progress[student.id];
            const login = logins[student.id];
            return (
              <tr key={student.id}>
                <td>{student.name}</td>
                <td>
                  {p?.memorised_pages ?? 0} / {p?.total_pages}
                </td>
                <td>{p?.percent ?? 0}%</td>
                <td>
                  {p?.current_page ? `Page ${p.current_page}` : "—"}
                </td>
                {isAdmin && (
                  <td>
                    {login ? (
                      <div className="login-cell">
                        <span className={login.is_active ? "" : "muted"}>
                          {login.username}
                        </span>
                        <div className="row-actions">
                          <button className="link-button" onClick={() => resetLoginPassword(login)}>
                            Reset password
                          </button>
                          <button className="link-button" onClick={() => toggleLoginActive(login)}>
                            {login.is_active ? "Disable" : "Enable"}
                          </button>
                          <button className="link-button danger" onClick={() => removeLogin(login)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : loginFormFor === student.id ? (
                      <form
                        className="login-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          createLogin(student.id);
                        }}
                      >
                        <input
                          placeholder="Display name"
                          value={loginName}
                          onChange={(e) => setLoginName(e.target.value)}
                          required
                        />
                        <input
                          placeholder="Username"
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value)}
                          required
                        />
                        <input
                          type="password"
                          placeholder="Password (min 6)"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          minLength={6}
                          required
                        />
                        <button type="submit">Create login</button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setLoginFormFor(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button onClick={() => startLogin(student)}>Create login</button>
                    )}
                  </td>
                )}
                {isAdmin && (
                  <td>
                    <button
                      className="danger"
                      onClick={() => remove(student.id)}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {stats.students.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No students yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
