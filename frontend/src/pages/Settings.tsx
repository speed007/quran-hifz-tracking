import { useEffect, useState } from "react";
import { api, Settings, User } from "../api";

export default function SettingsPage({ user }: { user: User }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.settings().then(setSettings).catch((e) => setError((e as Error).message));
  }, []);

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
