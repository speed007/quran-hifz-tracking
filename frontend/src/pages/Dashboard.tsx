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

  const isStudent = user.role === "user";

  const displayStudents = isStudent ? stats.students.filter((s) => s.id === user.student_id) : stats.students;
  const displaySessions = isStudent ? stats.recent_sessions.filter((s) => s.student_id === user.student_id) : stats.recent_sessions;

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
        {displayStudents.map((student) => {
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
                {p?.percent ?? 0}%) · {p?.rukus_memorised ?? 0} of {p?.total_rukus}{" "}
                rukus
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
            <th>Deadline</th>
            <th>Juz</th>
            <th>Ruku</th>
            <th>Logged by</th>
          </tr>
        </thead>
        <tbody>
          {displaySessions.map((s) => {
            const overdue =
              s.deadline && new Date(s.deadline) < new Date() && s.date > s.deadline;
            return (
              <tr key={s.id} className={overdue ? "overdue" : ""}>
                <td>{s.date}</td>
                <td>{s.student_name}</td>
                <td>{s.kind === "new" ? "Memorised" : "Revision"}</td>
                <td>{s.surah_name_en}</td>
                <td>
                  {s.from_page}–{s.to_page}
                </td>
                <td>
                  {s.deadline
                    ? `${s.deadline}${overdue ? " ⚠️" : ""}`
                    : "–"}
                </td>
                <td>
                  {s.juz_from != null && s.juz_to != null
                    ? s.juz_from === s.juz_to
                      ? `Juz ${s.juz_from}`
                      : `Juz ${s.juz_from}–${s.juz_to}`
                    : "–"}
                </td>
                <td>
                  {s.ruku_from != null && s.ruku_to != null
                    ? s.ruku_from === s.ruku_to
                      ? `Ruku ${s.ruku_from}`
                      : `Ruku ${s.ruku_from}–${s.ruku_to}`
                    : "–"}
                </td>
                <td>{s.logged_by_name}</td>
              </tr>
            );
          })}
          {displaySessions.length === 0 && (
            <tr>
              <td colSpan={9} className="muted">
                No sessions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
