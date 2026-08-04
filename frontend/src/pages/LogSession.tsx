import { FormEvent, useEffect, useState } from "react";
import { api, AyahMeta, JuzAyah, JuzAyahList, SessionDetail, Student, User } from "../api";

export default function LogSession({ user }: { user: User }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<SessionDetail | null>(null);

  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<"new" | "revision">("new");
  const [juz, setJuz] = useState("");
  const [juzAyahList, setJuzAyahList] = useState<JuzAyahList | null>(null);
  const [ayahFrom, setAyahFrom] = useState("");
  const [ayahTo, setAyahTo] = useState("");
  const [meta, setMeta] = useState<AyahMeta | null>(null);
  const [date, setDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    api.students().then(setStudents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!juz) {
      setJuzAyahList(null);
      setAyahFrom("");
      setAyahTo("");
      setMeta(null);
      return;
    }
    api
      .juzAyahs(Number(juz))
      .then((data) => {
        setJuzAyahList(data);
        if (data.ayahs.length > 0) {
          setAyahFrom("1");
          setAyahTo(String(data.ayahs.length));
        } else {
          setAyahFrom("");
          setAyahTo("");
        }
      })
      .catch(() => setJuzAyahList(null));
  }, [juz]);

  useEffect(() => {
    if (!juz || !ayahFrom || !ayahTo) {
      setMeta(null);
      return;
    }
    const from = Number(ayahFrom);
    const to = Number(ayahTo);
    if (from > to) {
      setMeta(null);
      return;
    }
    api
      .ayahMeta(Number(juz), from, to)
      .then(setMeta)
      .catch(() => setMeta(null));
  }, [juz, ayahFrom, ayahTo]);

  function ayahGroups() {
    if (!juzAyahList) return [];
    const groups: { surah: JuzAyah; items: JuzAyah[] }[] = [];
    for (const a of juzAyahList.ayahs) {
      const last = groups[groups.length - 1];
      if (last && last.surah.surah_number === a.surah_number) {
        last.items.push(a);
      } else {
        groups.push({ surah: a, items: [a] });
      }
    }
    return groups;
  }

  function renderAyahOptions() {
    return ayahGroups().map((g) => (
      <optgroup
        key={g.surah.surah_number}
        label={g.surah.surah_name_en ?? `Surah ${g.surah.surah_number}`}
      >
        {g.items.map((a) => (
          <option key={a.local} value={a.local}>
            Ayah {a.ayah}
          </option>
        ))}
      </optgroup>
    ));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setCreated(null);
    const from = Number(ayahFrom);
    const to = Number(ayahTo);
    if (!juz || !from || !to) {
      setError("Select the ayah range to log.");
      return;
    }
    if (from > to) {
      setError("From ayah must be before or equal to To ayah.");
      return;
    }
    try {
      const saved = await api.createSession({
        student_id: Number(studentId),
        kind,
        juz: Number(juz),
        from_ayah: from,
        to_ayah: to,
        deadline: deadline || undefined,
        date: date || undefined,
        note: note || undefined,
      });
      setMessage("Session logged.");
      setCreated(saved);
      setJuz("");
      setJuzAyahList(null);
      setAyahFrom("");
      setAyahTo("");
      setMeta(null);
      setDeadline("");
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
        <p className="muted">
          Select the ayah range the student will cover within this juz (using
          the 16-line mushaf). Surah, ruku and page info below are shown as
          reference only.
        </p>
        <div className="row">
          <label>
            From ayah
            <select
              value={ayahFrom}
              onChange={(e) => setAyahFrom(e.target.value)}
              required
              disabled={!juzAyahList}
            >
              <option value="">—</option>
              {renderAyahOptions()}
            </select>
          </label>
          <label>
            To ayah
            <select
              value={ayahTo}
              onChange={(e) => setAyahTo(e.target.value)}
              required
              disabled={!juzAyahList}
            >
              <option value="">—</option>
              {renderAyahOptions()}
            </select>
          </label>
        </div>
        {meta && (
          <div className="card ref-panel">
            <p className="muted">Reference</p>
            <p>
              <strong>Ayahs:</strong> {meta.from_ayah}–{meta.to_ayah} of Juz{" "}
              {meta.juz}
            </p>
            <p>
              <strong>Surah:</strong>{" "}
              {meta.surahs.map((s) => s.name_en).join(", ")}
            </p>
            <p>
              <strong>Ruku:</strong>{" "}
              {meta.ruku_from === meta.ruku_to
                ? meta.ruku_from
                : `${meta.ruku_from}–${meta.ruku_to}`}
            </p>
            <p>
              <strong>Pages:</strong> {meta.from_page}–{meta.to_page}
            </p>
          </div>
        )}
        <label>
          Date (defaults to today)
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Deadline (optional)
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <label>
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        {created && (
          <div className="card">
            Juz {created.juz}, ayahs {created.from_ayah}–
            {created.to_ayah} · {created.surah_name_en}, pages {created.from_page}–
            {created.to_page}
            {created.deadline && ` · Deadline: ${created.deadline}`}
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
