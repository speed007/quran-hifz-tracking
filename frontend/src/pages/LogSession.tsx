import { FormEvent, useEffect, useState } from "react";
import { api, SessionDetail, Student, User } from "../api";

export default function LogSession({ user }: { user: User }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<SessionDetail | null>(null);

  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<"new" | "revision">("new");
  const [juz, setJuz] = useState("");
  const [rukuFrom, setRukuFrom] = useState("");
  const [rukuTo, setRukuTo] = useState("");
  const [fromPage, setFromPage] = useState("");
  const [toPage, setToPage] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [surahRef, setSurahRef] = useState<string | null>(null);
  const [rukuList, setRukuList] = useState<number[]>([]);
  const [firstRuku, setFirstRuku] = useState(0);

  useEffect(() => {
    api.students().then(setStudents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!juz) {
      setRukuList([]);
      setRukuFrom("");
      setRukuTo("");
      setFromPage("");
      setToPage("");
      setSurahRef(null);
      return;
    }
    api
      .rukusInJuz(Number(juz))
      .then((data) => {
        setFirstRuku(data.first_ruku);
        setRukuList(data.rukus);
        if (data.rukus.length > 0) {
          setRukuFrom("1");
          setRukuTo(String(data.rukus.length));
        } else {
          setRukuFrom("");
          setRukuTo("");
        }
      })
      .catch(() => setRukuList([]));
  }, [juz]);

  useEffect(() => {
    if (!rukuFrom || !rukuTo) {
      setFromPage("");
      setToPage("");
      setSurahRef(null);
      return;
    }
    const localFrom = Number(rukuFrom);
    const localTo = Number(rukuTo);
    if (localFrom > localTo) {
      setFromPage("");
      setToPage("");
      setSurahRef(null);
      return;
    }
    const globalFrom = firstRuku + localFrom - 1;
    const globalTo = firstRuku + localTo - 1;
    const promises = [];
    for (let r = globalFrom; r <= globalTo; r++) {
      promises.push(api.rukuPages(r));
    }
    Promise.all(promises)
      .then((results) => {
        const allFrom = results.map((r) => r.from_page);
        const allTo = results.map((r) => r.to_page);
        setFromPage(String(Math.min(...allFrom)));
        setToPage(String(Math.max(...allTo)));
        const names = new Set(
          results.map((r) => r.surah_name_en).filter(Boolean)
        );
        setSurahRef([...names].join(", ") || null);
      })
      .catch(() => {
        setFromPage("");
        setToPage("");
        setSurahRef(null);
      });
  }, [rukuFrom, rukuTo, firstRuku]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setCreated(null);
    try {
      const saved = await api.createSession({
        student_id: Number(studentId),
        kind,
        from_page: Number(fromPage),
        to_page: Number(toPage) || Number(fromPage),
        date: date || undefined,
        note: note || undefined,
      });
      setMessage("Session logged.");
      setCreated(saved);
      setJuz("");
      setRukuFrom("");
      setRukuTo("");
      setFromPage("");
      setToPage("");
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (user.role === "user") {
    return <div className="card">Only admins can log sessions.</div>;
  }

  return (
    <div>
      <h1>Log a session</h1>
      <form className="card form" onSubmit={submit}>
        <label>
          Student
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            required
          >
            <option value="">Choose…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "new" | "revision")}
          >
            <option value="new">Memorised (new)</option>
            <option value="revision">Revision</option>
          </select>
        </label>
        <label>
          Juz
          <select value={juz} onChange={(e) => setJuz(e.target.value)} required>
            <option value="">Choose…</option>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Juz {n}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>
            Ruku from
            <select
              value={rukuFrom}
              onChange={(e) => setRukuFrom(e.target.value)}
              required
            >
              <option value="">—</option>
              {rukuList.map((r, i) => (
                <option key={r} value={i + 1}>
                  Ruku {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ruku to
            <select
              value={rukuTo}
              onChange={(e) => setRukuTo(e.target.value)}
              required
            >
              <option value="">—</option>
              {rukuList.map((r, i) => (
                <option key={r} value={i + 1}>
                  Ruku {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            From page
            <input
              type="number"
              min={1}
              max={604}
              value={fromPage}
              onChange={(e) => setFromPage(e.target.value)}
              required
            />
          </label>
          <label>
            To page
            <input
              type="number"
              min={1}
              max={604}
              value={toPage}
              onChange={(e) => setToPage(e.target.value)}
            />
          </label>
        </div>
        {surahRef && (
          <p className="muted">Surah: {surahRef}</p>
        )}
        {rukuFrom && rukuTo && (
          <p className="success">
            Ruku {rukuFrom === rukuTo ? rukuFrom : `${rukuFrom}–${rukuTo}`}
            {fromPage && toPage
              ? ` · pages ${fromPage}–${toPage}`
              : ""}
          </p>
        )}
        <label>
          Date (defaults to today)
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        {created && (
          <div className="card">
            {created.surah_name_en}, pages {created.from_page}–{created.to_page}
            {created.juz_from != null &&
              created.juz_to != null &&
              ` · Juz ${created.juz_from === created.juz_to ? created.juz_from : `${created.juz_from}–${created.juz_to}`}`}
            {created.ruku_from != null &&
              created.ruku_to != null &&
              ` · Ruku ${created.ruku_from === created.ruku_to ? created.ruku_from : `${created.ruku_from}–${created.ruku_to}`}`}
          </div>
        )}
        <button type="submit">Save session</button>
      </form>
    </div>
  );
}