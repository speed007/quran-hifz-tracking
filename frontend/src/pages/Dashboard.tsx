import { Fragment, useEffect, useState } from "react";
import { api, SessionDetail, Stats, User } from "../api";

export default function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [ticking, setTicking] = useState<number | null>(null);
  const [ratingFor, setRatingFor] = useState<number | null>(null);
  const [draftRating, setDraftRating] = useState(0);
  const [draftFeedback, setDraftFeedback] = useState("");

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
  const juzs = isStudent ? stats.juz_summary?.[user.student_id ?? -1] ?? [] : [];

  async function toggleComplete(s: SessionDetail, completed: boolean) {
    setTicking(s.id);
    try {
      await api.setSessionCompleted(s.id, completed);
      setStats(await api.stats());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTicking(null);
    }
  }

  function openRatingEditor(s: SessionDetail) {
    setDraftRating(s.rating ?? 0);
    setDraftFeedback(s.feedback ?? "");
    setRatingFor(s.id);
  }

  async function saveRating() {
    if (ratingFor == null) return;
    try {
      await api.setSessionRating(ratingFor, {
        rating: draftRating > 0 ? draftRating : null,
        feedback: draftFeedback.trim() ? draftFeedback.trim() : null,
      });
      setStats(await api.stats());
      setRatingFor(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function stars(rating: number) {
    return <span className="stars-inline" title={`${rating}/5`}>{"★".repeat(rating)}</span>;
  }

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

      {isStudent && juzs.length > 0 && (
        <>
          <h2>Juz progress</h2>
          <div className="cards">
            {juzs.map((j) => (
              <div className="card" key={j.juz}>
                <h3>
                  Juz {j.juz} {j.complete ? "✓" : ""}
                </h3>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{ width: `${(j.pages_memorised / j.total_pages) * 100}%` }}
                  />
                </div>
                <p>
                  {j.pages_memorised} of {j.total_pages} pages
                </p>
                <p className="muted">
                  {j.avg_rating != null
                    ? `${"★".repeat(Math.round(j.avg_rating))} ${j.avg_rating} / 5`
                    : "No ratings yet"}
                  {j.duration_days != null &&
                    ` · took ${j.duration_days} day${j.duration_days === 1 ? "" : "s"}`}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Recent sessions</h2>
      <table>
        <thead>
          <tr>
            <th>Done</th>
            <th>Date</th>
            <th>Student</th>
            <th>Type</th>
            <th className="hide-mobile">Surah</th>
            <th>Pages</th>
            <th>Deadline</th>
            <th>Juz</th>
            <th>Ruku</th>
            <th className="hide-mobile">Logged by</th>
            {isStudent ? (
              <>
                <th>Stars</th>
                <th>Feedback</th>
              </>
            ) : (
              <th>Rating</th>
            )}
          </tr>
        </thead>
        <tbody>
          {displaySessions.map((s) => {
            const overdue = !s.completed && !!s.deadline && new Date(s.deadline) < new Date();
            return (
              <Fragment key={s.id}>
                <tr className={`${overdue ? "overdue" : ""} ${s.completed ? "completed-row" : ""}`}>
                  <td>
                    {isStudent ? (
                      <input
                        type="checkbox"
                        checked={!!s.completed}
                        disabled={ticking === s.id}
                        aria-label={`Mark ${s.surah_name_en ?? "session"} ${s.completed ? "as pending" : "as completed"}`}
                        onChange={(e) => toggleComplete(s, e.target.checked)}
                      />
                    ) : (
                      <span className={s.completed ? "done-badge" : "pending-badge"}>
                        {s.completed ? "✓ Done" : "Pending"}
                      </span>
                    )}
                  </td>
                  <td>{s.date}</td>
                  <td>{s.student_name}</td>
                  <td>{s.kind === "new" ? "Memorised" : "Revision"}</td>
                  <td className="hide-mobile">{s.surah_name_en}</td>
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
                  <td className="hide-mobile">{s.logged_by_name}</td>
                  {isStudent ? (
                    <>
                      <td>{s.rating ? stars(s.rating) : <span className="muted">–</span>}</td>
                      <td className="feedback-cell">{s.feedback || <span className="muted">–</span>}</td>
                    </>
                  ) : (
                    <td>
                      {s.completed ? (
                        <div className="rate-cell">
                          {s.rating ? stars(s.rating) : <span className="muted">–</span>}
                          <button className="link-button rate-btn" onClick={() => openRatingEditor(s)}>
                            {s.rating != null ? "Edit" : "Rate"}
                          </button>
                        </div>
                      ) : (
                        <span className="muted">waiting</span>
                      )}
                    </td>
                  )}
                </tr>
                {!isStudent && ratingFor === s.id && (
                  <tr key={`rating-${s.id}`} className="rating-editor-row">
                    <td colSpan={11}>
                      <div className="rating-editor">
                        <div className="stars" role="radiogroup" aria-label="Star rating">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              className={`star ${n <= draftRating ? "on" : ""}`}
                              aria-label={`${n} star${n > 1 ? "s" : ""}`}
                              onClick={() => setDraftRating(draftRating === n ? 0 : n)}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={draftFeedback}
                          maxLength={1000}
                          placeholder="Feedback for the student…"
                          onChange={(e) => setDraftFeedback(e.target.value)}
                        />
                        <div className="row editor-actions">
                          <button onClick={saveRating}>Save</button>
                          <button className="secondary" onClick={() => setRatingFor(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {displaySessions.length === 0 && (
            <tr>
              <td colSpan={isStudent ? 12 : 11} className="muted">
                No sessions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
