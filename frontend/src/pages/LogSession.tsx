import { FormEvent, useEffect, useState } from "react";
import { api, SectionMeta, SessionDetail, Student, Surah, User } from "../api";

export default function LogSession({ user }: { user: User }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<SessionDetail | null>(null);

  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<"new" | "revision">("new");
  const [surahId, setSurahId] = useState("");
  const [fromPage, setFromPage] = useState("");
  const [toPage, setToPage] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [sectionMeta, setSectionMeta] = useState<SectionMeta | null>(null);

  useEffect(() => {
    api.students().then(setStudents).catch(() => {});
    api.surahs().then(setSurahs).catch(() => {});
  }, []);

  const selectedSurah = surahs.find((s) => s.id === Number(surahId));

  useEffect(() => {
    const sid = Number(surahId);
    const f = Number(fromPage);
    const t = Number(toPage) || f;
    setSectionMeta(null);
    if (!selectedSurah || !sid || !f) return;
    if (f < selectedSurah.start_page || t > selectedSurah.end_page) return;
    api
      .sectionMeta(sid, f, t)
      .then(setSectionMeta)
      .catch(() => setSectionMeta(null));
  }, [surahId, fromPage, toPage, selectedSurah]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setCreated(null);
    try {
      const saved = await api.createSession({
        student_id: Number(studentId),
        kind,
        surah_id: Number(surahId),
        from_page: Number(fromPage),
        to_page: Number(toPage) || Number(fromPage),
        date: date || undefined,
        note: note || undefined,
      });
      setMessage("Session logged.");
      setCreated(saved);
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
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
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
          <select value={kind} onChange={(e) => setKind(e.target.value as "new" | "revision")}>
            <option value="new">Memorised (new)</option>
            <option value="revision">Revision</option>
          </select>
        </label>
        <label>
          Surah
          <select value={surahId} onChange={(e) => setSurahId(e.target.value)} required>
            <option value="">Choose…</option>
            {surahs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number}. {s.name_en} ({s.name_ar}) · pages {s.start_page}–{s.end_page}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>
            From page
            <input
              type="number"
              min={selectedSurah?.start_page}
              max={selectedSurah?.end_page}
              value={fromPage}
              onChange={(e) => setFromPage(e.target.value)}
              required
            />
          </label>
          <label>
            To page
            <input
              type="number"
              min={selectedSurah?.start_page}
              max={selectedSurah?.end_page}
              value={toPage}
              onChange={(e) => setToPage(e.target.value)}
            />
          </label>
        </div>
        {sectionMeta && (
          <p className="success">
            Juz {sectionMeta.juz_from === sectionMeta.juz_to
              ? sectionMeta.juz_from
              : `${sectionMeta.juz_from}–${sectionMeta.juz_to}`}{" "}
            · Ruku {sectionMeta.ruku_from === sectionMeta.ruku_to
              ? sectionMeta.ruku_from
              : `${sectionMeta.ruku_from}–${sectionMeta.ruku_to}`}
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
