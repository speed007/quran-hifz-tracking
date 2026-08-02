import { useEffect, useState } from "react";
import { api, Stats, User } from "../api";

export default function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="card error">{error}</div>;
  if (!stats) return <div className="center">Loading…</div>;

  return (
    <div>
      <h1>Welcome, {user.name}</h1>

      <div className="cards">
        <div className="card stat">
          <strong>{stats.total_sessions}</strong>
          <span>Total sessions</span>
        </div>
        <div className="card stat">
          <strong>{stats.today_activity}</strong>
          <span>Sessions today</span>
        </div>
        <div className="card stat">
          <strong>{stats.students.length}</strong>
          <span>Students</span>
        </div>
      </div>

      <h2>Progress</h2>
      <div className="cards">
        {stats.students.map((student) => {
          const p = stats.progress[student.id];
          return (
            <div className="card" key={student.id}>
              <h3>{student.name}</h3>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{ width: `${p?.percent ?? 0}%` }}
                />
              </div>
              <p>
                {p?.memorised_pages ?? 0} of {p?.total_pages} pages (
                {p?.percent ?? 0}%)
              </p>
              {p?.current_surah && (
                <p className="muted">
                  Now at {p.current_surah.name_en} (page {p.current_page})
                </p>
              )}
            </div>
          );
        })}
      </div>

      <h2>Recent sessions</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Student</th>
            <th>Type</th>
            <th>Surah</th>
            <th>Pages</th>
            <th>Logged by</th>
          </tr>
        </thead>
        <tbody>
          {stats.recent_sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.date}</td>
              <td>{s.student_name}</td>
              <td>{s.kind === "new" ? "Memorised" : "Revision"}</td>
              <td>{s.surah_name_en}</td>
              <td>
                {s.from_page}–{s.to_page}
              </td>
              <td>{s.logged_by_name}</td>
            </tr>
          ))}
          {stats.recent_sessions.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No sessions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
