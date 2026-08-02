import { FormEvent, useEffect, useState } from "react";
import { api, Stats, User } from "../api";

export default function Students({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError((e as Error).message));
  }, [reload]);

  const isAdmin = user.role === "admin";

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
            {isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {stats.students.map((student) => {
            const p = stats.progress[student.id];
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
