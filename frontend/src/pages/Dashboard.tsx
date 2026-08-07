import { Fragment, useEffect, useState } from "react";
import { api, SessionDetail, Stats, User } from "../api";
import RatingEditor from "../components/RatingEditor";

function groupSessions(sessions: SessionDetail[]) {
  const map = new Map<number, SessionDetail[]>();
  for (const s of sessions) {
    const arr = map.get(s.student_id) ?? [];
    arr.push(s);
    map.set(s.student_id, arr);
  }
  return Array.from(map.entries())
    .map(([student_id, arr]) => ({
      student_id,
      name: arr[0].student_name ?? "Unknown",
      sessions: arr,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function Dashboard({ user }: { user: User }) {
  const isStudent = user.role === "user";
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [ticking, setTicking] = useState<number | null>(null);
  const [ratingFor, setRatingFor] = useState<number | null>(null);
  const [partialFor, setPartialFor] = useState<number | null>(null);
  const [partialFrom, setPartialFrom] = useState("");
  const [partialTo, setPartialTo] = useState("");
  const [partialNote, setPartialNote] = useState("");
  const [recentStudentId, setRecentStudentId] = useState<number | null>(null);
  const [recentDays, setRecentDays] = useState<number | null>(null);
  const [recentStatus, setRecentStatus] = useState<"" | "rated" | "unrated" | "waiting">("");

  async function loadStats() {
    return api.stats({
      student_id: isStudent ? undefined : recentStudentId ?? undefined,
      days: recentDays ?? undefined,
    });
  }

  useEffect(() => {
    loadStats()
      .then(setStats)
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, recentStudentId, recentDays]);

  if (error) return <div className="card error">{error}</div>;
  if (!stats) return <div className="center">Loading…</div>;

  const displayStudents = isStudent ? stats.students.filter((s) => s.id === user.student_id) : stats.students;
  const displaySessions = isStudent ? stats.recent_sessions.filter((s) => s.student_id === user.student_id) : stats.recent_sessions;
  const juzs = isStudent ? stats.juz_summary?.[user.student_id ?? -1] ?? [] : [];
  const filteredSessions =
    recentStatus === "rated"
      ? displaySessions.filter((s) => s.rating != null)
      : recentStatus === "unrated"
        ? displaySessions.filter((s) => s.completed && s.rating == null)
        : recentStatus === "waiting"
          ? displaySessions.filter((s) => !s.completed)
          : displaySessions;
  const sessionGroups = isStudent
    ? [{ student_id: user.student_id ?? -1, name: user.name, sessions: filteredSessions }]
    : groupSessions(filteredSessions);

  async function completeSession(
    s: SessionDetail,
    body: {
      completed: boolean;
      completion?: "full" | "partial";
      partial_from_ayah?: number;
      partial_to_ayah?: number;
      partial_note?: string;
    }
  ) {
    setTicking(s.id);
    try {
      await api.setSessionCompleted(s.id, body);
      setStats(await loadStats());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTicking(null);
    }
  }

  function openPartial(s: SessionDetail) {
    setPartialFor(s.id);
    setPartialFrom(String(s.from_ayah ?? 1));
    setPartialTo(String(s.to_ayah ?? s.from_ayah ?? 1));
    setPartialNote("");
  }

  async function submitPartial(s: SessionDetail) {
    const from = Number(partialFrom);
    const to = Number(partialTo);
    if (!from || !to || from > to) {
      setError("Select a valid partial ayah range.");
      return;
    }
    if (!partialNote.trim()) {
      setError("A note is required when completing partially.");
      return;
    }
    await completeSession(s, {
      completed: true,
      completion: "partial",
      partial_from_ayah: from,
      partial_to_ayah: to,
      partial_note: partialNote.trim(),
    });
    setPartialFor(null);
  }

  function openRatingEditor(s: SessionDetail) {
    setRatingFor(s.id);
  }

  async function saveRating(id: number, rating: number | null, feedback: string | null) {
    try {
      await api.setSessionRating(id, { rating, feedback });
      setStats(await loadStats());
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

  function sectionReference(s: SessionDetail): string {
    if (s.juz != null && s.from_ayah != null) {
      const total = (s.to_ayah ?? s.from_ayah) - s.from_ayah + 1;
      const segments = (s.surah_segments ?? []).map(
        (seg) => `ayah ${seg.from_ayah}–${seg.to_ayah} ${seg.name_en}`
      );
      if (segments.length > 0) {
        return `Juz ${s.juz} · ${segments.join(" · ")} · ${total} ayahs total`;
      }
      const to = s.to_ayah != null && s.to_ayah !== s.from_ayah ? `–${s.to_ayah}` : "";
      return `Juz ${s.juz} · ayah ${s.from_ayah}${to}`;
    }
    if (s.juz_from != null && s.juz_to != null) {
      const base = s.juz_from === s.juz_to ? `Juz ${s.juz_from}` : `Juz ${s.juz_from}–${s.juz_to}`;
      return s.surah_name_en ? `${base} · ${s.surah_name_en}` : base;
    }
    return "–";
  }

  function partialNoteText(s: SessionDetail): string | null {
    if (s.completion !== "partial") return null;
    const range =
      s.partial_from_ayah != null && s.partial_to_ayah != null
        ? `Did ayahs ${s.partial_from_ayah}–${s.partial_to_ayah}. `
        : "Partial. ";
    return `${range}${s.partial_note ?? ""}`;
  }

  function partialInfo(s: SessionDetail) {
    const note = partialNoteText(s);
    if (!note) return null;
    return (
      <p className="muted partial-info" title={note}>
        {note}
      </p>
    );
  }

  function partialAyahOptions(s: SessionDetail) {
    if (s.from_ayah == null || s.to_ayah == null) return null;
    const options = [];
    for (let n = s.from_ayah; n <= s.to_ayah; n++) {
      options.push(
        <option key={n} value={n}>
          Ayah {n}
        </option>
      );
    }
    return options;
  }

  function renderSessionRow(s: SessionDetail) {
    const overdue = !s.completed && !!s.deadline && new Date(s.deadline) < new Date();
    const noteText = partialNoteText(s);
    return (
      <Fragment key={s.id}>
        <tr className={`${overdue ? "overdue" : ""} ${s.completed ? "completed-row" : ""}`}>
          <td>
            {isStudent ? (
              s.completed ? (
                <span className={s.completion === "partial" ? "pending-badge" : "done-badge"}>
                  {s.completion === "partial" ? "Partial" : "✓ Full"}
                </span>
              ) : (
                <select
                  className="completion-select"
                  value=""
                  disabled={ticking === s.id}
                  aria-label={`Mark ${s.surah_name_en ?? "session"} as completed`}
                  onChange={(e) => {
                    if (e.target.value === "full") {
                      completeSession(s, { completed: true, completion: "full" });
                    } else if (e.target.value === "partial") {
                      openPartial(s);
                    }
                  }}
                >
                  <option value="">Mark…</option>
                  <option value="full">Full</option>
                  <option value="partial" disabled={s.juz == null}>
                    Partial
                  </option>
                </select>
              )
            ) : (
              <span className={s.completed ? "done-badge" : "pending-badge"}>
                {s.completed
                  ? s.completion === "partial"
                    ? "Partial"
                    : "✓ Done"
                  : "Pending"}
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
        <tr className="session-meta-row">
          <td colSpan={10}>
            <div className="session-meta">
              <span className="session-meta-label">{sectionReference(s)}</span>
              {noteText && (
                <span className="session-meta-note" title={noteText}>
                  {noteText}
                </span>
              )}
            </div>
          </td>
        </tr>
        {!isStudent && ratingFor === s.id && (
          <tr key={`rating-${s.id}`} className="rating-editor-row">
            <td colSpan={10}>
              <RatingEditor
                rating={s.rating}
                feedback={s.feedback}
                onSave={(r, f) => saveRating(s.id, r, f)}
                onCancel={() => setRatingFor(null)}
              />
            </td>
          </tr>
        )}
        {isStudent && partialFor === s.id && (
          <tr key={`partial-${s.id}`} className="rating-editor-row">
            <td colSpan={10}>
              <div className="rating-editor">
                <p className="muted">
                  You were assigned Juz {s.juz} ayahs {s.from_ayah}–
                  {s.to_ayah}. Select the ayahs you actually did and
                  explain why you couldn't finish the whole session.
                </p>
                <div className="row">
                  <label>
                    From ayah
                    <select
                      value={partialFrom}
                      onChange={(e) => setPartialFrom(e.target.value)}
                    >
                      {partialAyahOptions(s)}
                    </select>
                  </label>
                  <label>
                    To ayah
                    <select
                      value={partialTo}
                      onChange={(e) => setPartialTo(e.target.value)}
                    >
                      {partialAyahOptions(s)}
                    </select>
                  </label>
                </div>
                <label>
                  Why didn't you finish the whole session? (required)
                  <textarea
                    value={partialNote}
                    onChange={(e) => setPartialNote(e.target.value)}
                  />
                </label>
                {error && <p className="error">{error}</p>}
                <div className="editor-actions row">
                  <button
                    type="button"
                    onClick={() => submitPartial(s)}
                    disabled={!partialNote.trim() || ticking === s.id}
                  >
                    Save partial
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPartialFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
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
                    <td>
                      {sectionLabel(s)}
                      {partialInfo(s)}
                    </td>
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

      <div className="card filters">
        {!isStudent && (
          <label>
            Student
            <select
              value={recentStudentId ?? ""}
              onChange={(e) =>
                setRecentStudentId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">All students</option>
              {stats.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Period
          <select
            value={recentDays ?? ""}
            onChange={(e) => setRecentDays(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Latest</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </label>
        <label>
          Status
          <select
            value={recentStatus}
            onChange={(e) => setRecentStatus(e.target.value as "" | "rated" | "unrated" | "waiting")}
          >
            <option value="">All</option>
            <option value="rated">Rated</option>
            <option value="unrated">Unrated</option>
            <option value="waiting">Waiting</option>
          </select>
        </label>
      </div>

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
            <th>Ruku</th>
            <th className="hide-mobile">Logged by</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {sessionGroups.map((g) => (
            <Fragment key={g.student_id}>
              <tr className="session-group-row">
                <td colSpan={10}>
                  <strong className="session-group-name">{g.name}</strong>
                </td>
              </tr>
              {g.sessions.map((s) => renderSessionRow(s))}
            </Fragment>
          ))}
          {sessionGroups.length === 0 && (
            <tr>
              <td colSpan={10} className="muted">
                No sessions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
