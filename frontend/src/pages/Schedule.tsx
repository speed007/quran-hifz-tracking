import { FormEvent, useEffect, useState } from "react";
import { api, ScheduleEntry, Student, User } from "../api";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SchedulePage({ user }: { user: User }) {
  const isStudent = user.role === "user";
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [label, setLabel] = useState("");
  const [slotType, setSlotType] = useState<"weekly" | "date">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  async function load() {
    try {
      const rows = await api.schedule(
        isStudent || studentId == null ? {} : { student_id: studentId }
      );
      setEntries(rows);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!isStudent) {
      api
        .students()
        .then(setStudents)
        .catch(() => {});
    }
  }, [isStudent]);

  useEffect(() => {
    load();
  }, [isStudent, studentId]);

  function resetForm() {
    setLabel("");
    setSlotType("weekly");
    setDayOfWeek("");
    setDate("");
    setStartTime("");
    setEndTime("");
    setEditingId(null);
  }

  function startEdit(entry: ScheduleEntry) {
    setEditingId(entry.id);
    setLabel(entry.label);
    setSlotType(entry.day_of_week != null ? "weekly" : "date");
    setDayOfWeek(entry.day_of_week != null ? String(entry.day_of_week) : "");
    setDate(entry.date ?? "");
    setStartTime(entry.start_time);
    setEndTime(entry.end_time);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (!startTime || !endTime || endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }
    if (slotType === "weekly" && dayOfWeek === "") {
      setError("Choose a day of the week.");
      return;
    }
    if (slotType === "date" && !date) {
      setError("Choose a date.");
      return;
    }
    const body = {
      label: label || undefined,
      day_of_week: slotType === "weekly" ? Number(dayOfWeek) : null,
      date: slotType === "date" ? date : null,
      start_time: startTime,
      end_time: endTime,
    };
    try {
      if (editingId != null) {
        await api.updateSchedule(editingId, body);
        setMessage("Schedule updated.");
      } else {
        await api.createSchedule({
          ...body,
          student_id: isStudent ? undefined : studentId ?? undefined,
        });
        setMessage("Schedule slot added.");
      }
      resetForm();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(entry: ScheduleEntry) {
    if (!window.confirm(`Delete ${entry.label} on ${entry.day_of_week != null ? WEEKDAYS[entry.day_of_week] : entry.date}?`)) {
      return;
    }
    try {
      await api.deleteSchedule(entry.id);
      if (editingId === entry.id) resetForm();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const recurring = entries.filter((e) => e.day_of_week != null);
  const oneOff = entries.filter((e) => e.date != null);

  return (
    <div>
      <h1>Schedule</h1>
      {!isStudent && (
        <div className="card filters">
          <label>
            Student
            <select
              value={studentId ?? ""}
              onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All students</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <form className="card form" onSubmit={submit}>
        <h3>{editingId != null ? "Edit schedule slot" : "Add a schedule slot"}</h3>
        <label>
          What is this for? (optional)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Memorisation, Revision, Rest"
          />
        </label>
        <label>
          Type
          <select
            value={slotType}
            onChange={(e) => setSlotType(e.target.value as "weekly" | "date")}
          >
            <option value="weekly">Every week on a day</option>
            <option value="date">One-off on a date</option>
          </select>
        </label>
        {slotType === "weekly" ? (
          <label>
            Day of the week
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
              <option value="">Choose…</option>
              {WEEKDAYS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        <div className="row">
          <label>
            Start time
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </label>
          <label>
            End time
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <div className="editor-actions row">
          <button type="submit">{editingId != null ? "Save changes" : "Add slot"}</button>
          {editingId != null && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h2>Weekly</h2>
      {recurring.length === 0 ? (
        <div className="card muted">No weekly slots yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Time</th>
              <th>For</th>
              {!isStudent && <th>Student</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recurring.map((e) => (
              <tr key={e.id}>
                <td>{WEEKDAYS[e.day_of_week ?? 0]}</td>
                <td>
                  {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
                </td>
                <td>{e.label}</td>
                {!isStudent && <td>{e.student_name}</td>}
                <td className="row-actions">
                  <button className="link-button" onClick={() => startEdit(e)}>
                    Edit
                  </button>
                  <button className="link-button danger" onClick={() => remove(e)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>One-off</h2>
      {oneOff.length === 0 ? (
        <div className="card muted">No one-off slots yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>For</th>
              {!isStudent && <th>Student</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {oneOff.map((e) => (
              <tr key={e.id}>
                <td>{fmtDate(e.date ?? "")}</td>
                <td>
                  {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
                </td>
                <td>{e.label}</td>
                {!isStudent && <td>{e.student_name}</td>}
                <td className="row-actions">
                  <button className="link-button" onClick={() => startEdit(e)}>
                    Edit
                  </button>
                  <button className="link-button danger" onClick={() => remove(e)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
