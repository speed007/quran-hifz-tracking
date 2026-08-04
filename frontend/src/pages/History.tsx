import { useEffect, useState } from "react";
import { api, History, Student, User } from "../api";

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function stars(rating: number) {
  return <span className="stars-inline" title={`${rating}/5`}>{"★".repeat(Math.round(rating))}</span>;
}

export default function HistoryPage({ user }: { user: User }) {
  const isStudent = user.role === "user";
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(
    isStudent ? (user.student_id ?? null) : null
  );
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isStudent) {
      api.students().then((list) => {
        setStudents(list);
        if (list.length > 0) setStudentId((prev) => prev ?? list[0].id);
      }).catch((e) => setError((e as Error).message));
    }
  }, [isStudent]);

  useEffect(() => {
    if (studentId == null) {
      setData(null);
      return;
    }
    api.history(isStudent ? undefined : studentId)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [isStudent, studentId]);

  if (error) return <div className="card error">{error}</div>;

  return (
    <div>
      <h1>History</h1>
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
      {!data && !error && <div className="center">Loading…</div>}
      {data && (
        <>
          {data.summary.season_start && (
            <p className="muted">
              Season starts {data.summary.season_start}
              {data.summary.first_session &&
                ` · first session ${data.summary.first_session} → last ${data.summary.last_session}`}
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

          {data.by_month.length > 0 && (
            <>
              <h2>Stars &amp; progress per month</h2>
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
                    <tr key={m.month}>
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
            </>
          )}

          {data.by_juz.length > 0 && (
            <>
              <h2>Per juz</h2>
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
                    <tr key={j.juz}>
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
            </>
          )}

          {data.by_month.length === 0 && data.by_juz.length === 0 && (
            <div className="card muted">No completed sessions yet.</div>
          )}
        </>
      )}
    </div>
  );
}
