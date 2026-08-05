import { useEffect, useState } from "react";
import { api, ScheduleEntry, Settings, Student, User } from "../api";

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

export default function SettingsPage({ user }: { user: User }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [alexaMsg, setAlexaMsg] = useState("");
  const [alexaErr, setAlexaErr] = useState("");

  useEffect(() => {
    api.settings().then(setSettings).catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    api
      .students()
      .then(setStudents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (studentId == null) {
      setSchedule([]);
      return;
    }
    api
      .schedule({ student_id: studentId })
      .then(setSchedule)
      .catch((e) => setAlexaErr((e as Error).message));
  }, [studentId]);

  if (user.role !== "creator") {
    return <div className="card">Only the creator can change settings.</div>;
  }
  if (error) return <div className="card error">{error}</div>;
  if (!settings) return <div className="center">Loading…</div>;

  async function save(update: Partial<Settings>) {
    setError("");
    setMessage("");
    try {
      const updated = await api.updateSettings(update);
      setSettings(updated);
      setMessage("Settings saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveStudentAlexa(update: { enabled?: boolean; lead_minutes?: number }) {
    if (studentId == null) return;
    setAlexaErr("");
    setAlexaMsg("");
    try {
      const updated = await api.updateStudentAlexa(studentId, update);
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setAlexaMsg("Saved.");
    } catch (err) {
      setAlexaErr((err as Error).message);
    }
  }

  async function testAnnounce() {
    if (studentId == null) return;
    setAlexaErr("");
    setAlexaMsg("");
    try {
      const { published } = await api.testStudentAlexa(studentId);
      setAlexaMsg(
        published
          ? "Test announcement sent. Check your Echo speakers."
          : "MQTT is not connected — check the server's broker config (HIFZ_MQTT_HOST)."
      );
    } catch (err) {
      setAlexaErr((err as Error).message);
    }
  }

  const selected = students.find((s) => s.id === studentId);

  return (
    <div>
      <h1>Settings</h1>
      <div className="cards">
        <div className="card">
          <h3>Alexa revision reminders</h3>
          <p className="muted">
            The app publishes a revision message to MQTT at the set times, and
            Home Assistant announces it on all Echo speakers.
          </p>
          <label>
            Enabled
            <input
              type="checkbox"
              checked={settings.alexa_enabled}
              onChange={(e) => save({ alexa_enabled: e.target.checked })}
            />
          </label>
          <label>
            Weekday time
            <input
              type="time"
              value={settings.alexa_weekday_time}
              onChange={(e) =>
                save({ alexa_weekday_time: e.target.value || settings.alexa_weekday_time })
              }
            />
          </label>
          <label>
            Weekend time
            <input
              type="time"
              value={settings.alexa_weekend_time}
              onChange={(e) =>
                save({ alexa_weekend_time: e.target.value || settings.alexa_weekend_time })
              }
            />
          </label>
          <label>
            Pages to revise (fallback window)
            <input
              type="number"
              min={1}
              max={20}
              value={settings.revision_lookback_pages}
              onChange={(e) =>
                save({ revision_lookback_pages: Number(e.target.value) || settings.revision_lookback_pages })
              }
            />
          </label>
        </div>

        <div className="card">
          <h3>Alexa schedule reminders</h3>
          <p className="muted">
            Pick a student to see their timetable. When enabled, Home Assistant
            announces each session before it starts, e.g. "Sara, Memorisation
            starts at 5:00pm".
          </p>
          <label>
            Student
            <select
              value={studentId ?? ""}
              onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Choose a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <div className="alexa-schedule">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.alexa_schedule_enabled}
                  onChange={(e) => saveStudentAlexa({ enabled: e.target.checked })}
                />
                <span>Announce schedule reminders for {selected.name}</span>
              </label>
              <label>
                <span>Minutes before each session</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={selected.alexa_schedule_lead_minutes}
                  onChange={(e) =>
                    saveStudentAlexa({
                      lead_minutes: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <button type="button" className="secondary" onClick={testAnnounce}>
                Send test announcement
              </button>

              <h4>Schedule slots</h4>
              {schedule.length === 0 ? (
                <p className="muted">No schedule slots for this student yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Time</th>
                      <th>For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.day_of_week != null
                            ? WEEKDAYS[e.day_of_week]
                            : fmtDate(e.date ?? "")}
                        </td>
                        <td>
                          {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
                        </td>
                        <td>{e.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {alexaMsg && <p className="success">{alexaMsg}</p>}
              {alexaErr && <p className="error">{alexaErr}</p>}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Telegram</h3>
          <p className="muted">
            Daily progress summary sent to linked admins at this time.
          </p>
          <label>
            Daily summary time
            <input
              type="time"
              value={settings.telegram_daily_time}
              onChange={(e) =>
                save({ telegram_daily_time: e.target.value || settings.telegram_daily_time })
              }
            />
          </label>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
    </div>
  );
}
