import { Fragment, useEffect, useState } from "react";
import { api, History, SessionDetail, Student, User } from "../api";
import RatingEditor from "../components/RatingEditor";

type Breakdown = "month" | "juz" | "stars";

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function chartLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

function stars(rating: number) {
  return <span className="stars-inline" title={`${rating}/5`}>{"★".repeat(Math.round(rating))}</span>;
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

export default function HistoryPage({ user }: { user: User }) {
  const isStudent = user.role === "user";
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(
    isStudent ? (user.student_id ?? null) : null
  );
  const [kind, setKind] = useState<"" | "new" | "revision">("");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [breakdown, setBreakdown] = useState<Breakdown>("month");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [juzFilter, setJuzFilter] = useState<number | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [ratingFor, setRatingFor] = useState<number | null>(null);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("hifz-history-filters");
      if (raw) {
        const f = JSON.parse(raw) as Partial<{
          kind: "" | "new" | "revision";
          fromMonth: string;
          toMonth: string;
          juzFilter: number | null;
          ratingFilter: number | null;
          breakdown: Breakdown;
        }>;
        if (f) {
          setKind(f.kind ?? "");
          setFromMonth(f.fromMonth ?? "");
          setToMonth(f.toMonth ?? "");
          setJuzFilter(f.juzFilter ?? null);
          setRatingFilter(f.ratingFilter ?? null);
          setBreakdown(f.breakdown ?? "month");
        }
      }
    } catch {
      // ignore malformed stored filters
    }
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    localStorage.setItem(
      "hifz-history-filters",
      JSON.stringify({ kind, fromMonth, toMonth, juzFilter, ratingFilter, breakdown })
    );
  }, [filtersReady, kind, fromMonth, toMonth, juzFilter, ratingFilter, breakdown]);

  useEffect(() => {
    if (!isStudent) {
      api.students().then((list) => {
        setStudents(list);
        if (list.length > 0) setStudentId((prev) => prev ?? list[0].id);
      }).catch((e) => setError((e as Error).message));
    }
  }, [isStudent]);

  useEffect(() => {
    if (!filtersReady) return;
    if (studentId == null) {
      setData(null);
      return;
    }
    setSelectedGroup(null);
    api.history({
      student_id: isStudent ? undefined : studentId,
      kind: kind || undefined,
      from_month: fromMonth || undefined,
      to_month: toMonth || undefined,
      juz: juzFilter ?? undefined,
      rating: ratingFilter ?? undefined,
    })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [filtersReady, isStudent, studentId, kind, fromMonth, toMonth, juzFilter, ratingFilter]);

  if (error) return <div className="card error">{error}</div>;

  function groupKey(s: SessionDetail): string {
    switch (breakdown) {
      case "juz":
        return `j:${s.juz ?? s.juz_from ?? ""}`;
      case "stars":
        return `s:${s.rating ?? "unrated"}`;
      default:
        return `m:${(s.completed_at ?? s.date).slice(0, 7)}`;
    }
  }

  const visibleSessions = selectedGroup
    ? (data?.sessions ?? []).filter((s) => groupKey(s) === selectedGroup)
    : data?.sessions ?? [];

  function groupLabel(): string {
    if (!selectedGroup) return "All sessions";
    switch (breakdown) {
      case "juz":
        return `Sessions in Juz ${selectedGroup.slice(2)}`;
      case "stars":
        return selectedGroup === "s:unrated"
          ? "Sessions not yet rated"
          : `Sessions rated ${selectedGroup.slice(2)}★`;
      default:
        return `Sessions in ${monthLabel(selectedGroup.slice(2))}`;
    }
  }

  async function saveRating(id: number, rating: number | null, feedback: string | null) {
    try {
      await api.setSessionRating(id, { rating, feedback });
      setData(await api.history({
        student_id: isStudent ? undefined : studentId ?? undefined,
        kind: kind || undefined,
        from_month: fromMonth || undefined,
        to_month: toMonth || undefined,
        juz: juzFilter ?? undefined,
        rating: ratingFilter ?? undefined,
      }));
      setRatingFor(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function rateButton(s: SessionDetail) {
    if (isStudent) return null;
    return (
      <button
        type="button"
        className="rate-btn"
        onClick={() => setRatingFor(s.id)}
        title={s.rating != null ? "Edit stars and notes" : "Give stars and notes"}
      >
        {s.rating != null ? "★ Edit" : "★ Rate"}
      </button>
    );
  }

  return (
    <div>
      <h1>History</h1>

      <div className="card filters">
        {!isStudent && (
          <label>
            Student
            <select
              value={studentId ?? ""}
              onChange={(e) => setStudentId(Number(e.target.value))}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as "" | "new" | "revision")}>
            <option value="">All</option>
            <option value="new">Memorised</option>
            <option value="revision">Revision</option>
          </select>
        </label>
        <label>
          From month
          <input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} />
        </label>
        <label>
          To month
          <input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} />
        </label>
        <label>
          Juz
          <select value={juzFilter ?? ""} onChange={(e) => setJuzFilter(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Any</option>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Juz {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stars
          <select value={ratingFilter ?? ""} onChange={(e) => setRatingFilter(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Any</option>
            <option value="-1">Not rated</option>
            <option value="1">1★</option>
            <option value="2">2★</option>
            <option value="3">3★</option>
            <option value="4">4★</option>
            <option value="5">5★</option>
          </select>
        </label>
        {(kind !== "" || juzFilter != null || ratingFilter != null || fromMonth || toMonth) && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setKind("");
              setJuzFilter(null);
              setRatingFilter(null);
              setFromMonth("");
              setToMonth("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="segmented" role="tablist" aria-label="Break down by">
        {(["month", "juz", "stars"] as Breakdown[]).map((b) => (
          <button
            key={b}
            type="button"
            className={breakdown === b ? "active" : ""}
            onClick={() => {
              setBreakdown(b);
              setSelectedGroup(null);
            }}
          >
            {b === "month" ? "Month" : b === "juz" ? "Juz" : "Stars"}
          </button>
        ))}
      </div>

      {!data && !error && <div className="center">Loading…</div>}

      {data && (
        <>
          {data.summary.first_session && (
            <p className="muted">
              {data.summary.first_session} → {data.summary.last_session}
            </p>
          )}
          <div className="cards">
            <div className="card stat">
              <strong>{data.summary.total_sessions}</strong>
              <span>Sessions</span>
            </div>
            <div className="card stat">
              <strong>{data.summary.completed_sessions}</strong>
              <span>Completed</span>
            </div>
            <div className="card stat">
              <strong>{data.summary.total_stars}</strong>
              <span>Stars earned</span>
            </div>
            <div className="card stat">
              <strong>{data.summary.avg_rating != null ? data.summary.avg_rating : "–"}</strong>
              <span>Average rating</span>
            </div>
            <div className="card stat">
              <strong>{data.summary.pages_memorised}</strong>
              <span>Pages</span>
            </div>
            <div className="card stat">
              <strong>{data.summary.ayahs_memorised}</strong>
              <span>Ayahs</span>
            </div>
            <div className="card stat">
              <strong>{data.summary.juzs_completed}</strong>
              <span>Juzs completed</span>
            </div>
          </div>

          {breakdown === "month" && data.by_month.length > 0 && (
            <h2>Months — click a row to drill down</h2>
          )}
          {breakdown === "month" && data.by_month.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Sessions</th>
                  <th>Pages</th>
                  <th>Ayahs</th>
                  <th>Stars</th>
                  <th>Average</th>
                </tr>
              </thead>
              <tbody>
                {data.by_month.map((m) => (
                  <tr
                    key={m.month}
                    className={`clickable ${selectedGroup === `m:${m.month}` ? "selected" : ""}`}
                    onClick={() =>
                      setSelectedGroup(selectedGroup === `m:${m.month}` ? null : `m:${m.month}`)
                    }
                  >
                    <td>{monthLabel(m.month)}</td>
                    <td>{m.sessions}</td>
                    <td>{m.pages}</td>
                    <td>{m.ayahs}</td>
                    <td>{m.stars}</td>
                    <td>
                      {m.avg_rating != null ? (
                        <>
                          {stars(m.avg_rating)} {m.avg_rating}/5
                        </>
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {breakdown === "juz" && data.by_juz.length > 0 && (
            <h2>Juzs — click a row to drill down</h2>
          )}
          {breakdown === "juz" && data.by_juz.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Juz</th>
                  <th>Pages</th>
                  <th>Progress</th>
                  <th>Sessions</th>
                  <th>Rated</th>
                  <th>Avg stars</th>
                  <th>Time to complete</th>
                </tr>
              </thead>
              <tbody>
                {data.by_juz.map((j) => (
                  <tr
                    key={j.juz}
                    className={`clickable ${selectedGroup === `j:${j.juz}` ? "selected" : ""}`}
                    onClick={() =>
                      setSelectedGroup(selectedGroup === `j:${j.juz}` ? null : `j:${j.juz}`)
                    }
                  >
                    <td>
                      Juz {j.juz} {j.complete ? "✓" : ""}
                    </td>
                    <td>
                      {j.pages_memorised} of {j.total_pages}
                    </td>
                    <td>
                      <div className="bar">
                        <div
                          className="bar-fill"
                          style={{ width: `${Math.min(j.percent, 100)}%` }}
                        />
                      </div>
                    </td>
                    <td>{j.sessions}</td>
                    <td>{j.rated_sessions}</td>
                    <td>
                      {j.avg_rating != null ? (
                        <>
                          {stars(j.avg_rating)} {j.avg_rating}/5
                        </>
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                    <td>
                      {j.duration_days != null
                        ? `${j.duration_days} day${j.duration_days === 1 ? "" : "s"}`
                        : <span className="muted">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {breakdown === "stars" && data.by_stars.length > 0 && (
            <h2>Stars — click a row to drill down</h2>
          )}
          {breakdown === "stars" && data.by_stars.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Stars</th>
                  <th>Sessions</th>
                  <th>Pages</th>
                  <th>Ayahs</th>
                </tr>
              </thead>
              <tbody>
                {data.by_stars.map((b) => {
                  const key = b.rating != null ? `s:${b.rating}` : "s:unrated";
                  return (
                    <tr
                      key={key}
                      className={`clickable ${selectedGroup === key ? "selected" : ""}`}
                      onClick={() => setSelectedGroup(selectedGroup === key ? null : key)}
                    >
                      <td>
                        {b.rating != null ? stars(b.rating) : <span className="muted">Not rated</span>}
                      </td>
                      <td>{b.sessions}</td>
                      <td>{b.pages}</td>
                      <td>{b.ayahs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {breakdown === "month" && data.by_month.length === 0 && (
            <div className="card muted">No sessions match these filters.</div>
          )}
          {breakdown === "juz" && data.by_juz.length === 0 && (
            <div className="card muted">No sessions match these filters.</div>
          )}
          {breakdown === "stars" && data.by_stars.length === 0 && (
            <div className="card muted">No sessions match these filters.</div>
          )}

          <h2>{groupLabel()}</h2>
          {visibleSessions.length === 0 ? (
            <div className="card muted">No sessions to show.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {!isStudent && <th>Student</th>}
                  <th>Type</th>
                  <th>Section</th>
                  <th>Ruku</th>
                  <th>Stars</th>
                  <th>Notes</th>
                  {!isStudent && <th>Rate</th>}
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((s) => (
                  <Fragment key={s.id}>
                    <tr>
                      <td>{s.completed_at ? s.completed_at.slice(0, 10) : s.date}</td>
                      {!isStudent && <td>{s.student_name}</td>}
                      <td>{s.kind === "new" ? "Memorised" : "Revision"}</td>
                      <td>{sectionLabel(s)}</td>
                      <td>
                        {s.ruku_from != null && s.ruku_to != null
                          ? s.ruku_from === s.ruku_to
                            ? `Ruku ${s.ruku_from}`
                            : `Ruku ${s.ruku_from}–${s.ruku_to}`
                          : "–"}
                      </td>
                      <td>
                        {s.rating ? stars(s.rating) : <span className="muted">–</span>}
                      </td>
                      <td className="feedback-cell">
                        {s.completion === "partial" ? (
                          <span className="partial-info">
                            <strong>Partial</strong>
                            {s.partial_from_ayah != null && s.partial_to_ayah != null
                              ? ` (ayahs ${s.partial_from_ayah}–${s.partial_to_ayah}): `
                              : ": "}
                            {s.partial_note}
                          </span>
                        ) : (
                          s.feedback || <span className="muted">No notes</span>
                        )}
                      </td>
                      {!isStudent && <td>{rateButton(s)}</td>}
                    </tr>
                    {!isStudent && ratingFor === s.id && (
                      <tr className="rating-editor-row">
                        <td colSpan={8}>
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
          )}

          {breakdown === "month" && data.by_month.length > 0 && (
            <div className="card chart" aria-label="Pages memorised per month">
              {data.by_month.map((m) => {
                const max = Math.max(...data.by_month.map((x) => x.pages));
                const height = max ? Math.max(Math.round((m.pages / max) * 100), 6) : 6;
                return (
                  <div
                    key={m.month}
                    className="chart-col"
                    title={`${monthLabel(m.month)}: ${m.pages} pages`}
                  >
                    <div className="chart-bar" style={{ height: `${height}%` }} />
                    <span className="chart-label">{chartLabel(m.month)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
