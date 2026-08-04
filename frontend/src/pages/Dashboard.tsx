import { Fragment, useEffect, useState } from "react";
import { api, SessionDetail, Stats, User } from "../api";
import RatingEditor from "../components/RatingEditor";

export default function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [ticking, setTicking] = useState<number | null>(null);
  const [ratingFor, setRatingFor] = useState<number | null>(null);

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
    setRatingFor(s.id);
  }

  async function saveRating(id: number, rating: number | null, feedback: string | null) {
    try {
      await api.setSessionRating(id, { rating, feedback });
      setStats(await api.stats());
      setRatingFor(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function stars(rating: number) {
    return <span className="stars-inline" title={`${rating}/5`}>{"★".repeat(rating)}</span>;
  }

  function rateButton(s: SessionDetail) {
    return (
      <button
        type="button"
        className="rate-btn"
        onClick={() => openRatingEditor(s)}
        title={s.rating != null ? "Edit stars and notes" : "Give stars and notes"}
      >
        {s.rating != null ? "★ Edit" : "★ Rate"}
      </button>
    );
  }

  function sectionLabel(s: SessionDetail): string {
    if (s.juz != null && s.from_ayah != null) {
      const to = s.to_ayah != null && s.to_ayah !== s.from_ayah ? `–${s.to_ayah}` : "";
      return `Juz ${s.juz} · ayah ${s.from_ayah}${to}`;
    }
    if (s.juz_from != null && s.juz_to != null) {
      return s.juz_from === s.juz_to
        ? `Juz ${s.juz_from}`
        : `Juz ${s.juz_from}–${s.juz_to}`;
    }
    return "–";
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

      {!isStudent && stats.rateable_sessions.length > 0 && (
        <>
          <h2>Ready to rate</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>Surah</th>
                <th>Pages</th>
                <th>Juz</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {stats.rateable_sessions.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    <td>{s.date}</td>
                    <td>{s.student_name}</td>
                    <td>{s.surah_name_en}</td>
                    <td>
                      {s.from_page}–{s.to_page}
                    </td>
                    <td>{sectionLabel(s)}</td>
                    <td>{rateButton(s)}</td>
                  </tr>
                  {ratingFor === s.id && (
                    <tr className="rating-editor-row">
                      <td colSpan={6}>
                        <RatingEditor
                          rating={s.rating}
                          feedback={s.feedback}
                          onSave={(r, f) => saveRating(s.id, r, f)}
                          onCancel={() => setRatingFor(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}

      {isStudent && stats.rated_sessions.length > 0 && (
        <>
          <h2>Ratings &amp; notes</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Section</th>
                <th>Surah</th>
                <th>Pages</th>
                <th>Stars</th>
                <th>Notes from your tutor</th>
              </tr>
            </thead>
            <tbody>
              {stats.rated_sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.date}</td>
                  <td>{sectionLabel(s)}</td>
                  <td>{s.surah_name_en}</td>
                  <td>
                    {s.from_page}–{s.to_page}
                  </td>
                  <td>{s.rating ? stars(s.rating) : <span className="muted">–</span>}</td>
                  <td className="feedback-cell">
                    {s.feedback || <span className="muted">No notes</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <th>Rating</th>
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
                  <td>{sectionLabel(s)}</td>
                  <td>
                    {s.ruku_from != null && s.ruku_to != null
                      ? s.ruku_from === s.ruku_to
                        ? `Ruku ${s.ruku_from}`
                        : `Ruku ${s.ruku_from}–${s.ruku_to}`
                      : "–"}
                  </td>
                  <td className="hide-mobile">{s.logged_by_name}</td>
                  <td>
                    {s.completed ? (
                      <div className="rate-cell">
                        {s.rating ? stars(s.rating) : <span className="muted">–</span>}
                        {!isStudent && rateButton(s)}
                      </div>
                    ) : (
                      <span className="muted">waiting</span>
                    )}
                  </td>
                </tr>
                {!isStudent && ratingFor === s.id && (
                  <tr key={`rating-${s.id}`} className="rating-editor-row">
                    <td colSpan={11}>
                      <RatingEditor
                        rating={s.rating}
                        feedback={s.feedback}
                        onSave={(r, f) => saveRating(s.id, r, f)}
                        onCancel={() => setRatingFor(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {displaySessions.length === 0 && (
            <tr>
              <td colSpan={11} className="muted">
                No sessions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
