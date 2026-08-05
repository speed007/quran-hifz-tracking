import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { api, ScheduleEntry, Settings, Student, User } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Loading,
  Screen,
  SectionTitle,
  StyledTextInput,
  SuccessText,
  Title,
  useTheme,
} from "../ui";
import { PickerField, TimeField } from "../pickers";
import { fmtDate, fmtTime } from "../format";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [alexaMsg, setAlexaMsg] = useState("");
  const [alexaErr, setAlexaErr] = useState("");

  useEffect(() => {
    api
      .settings()
      .then(setSettings)
      .catch((e) => setError((e as Error).message));
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

  if (user?.role !== "creator") {
    return (
      <Screen>
        <Card>Only the creator can change settings.</Card>
      </Screen>
    );
  }
  if (error) return <Screen><ErrorText>{error}</ErrorText></Screen>;
  if (!settings) return <Screen><Loading /></Screen>;

  async function save(update: Partial<Settings>) {
    setError("");
    setMessage("");
    try {
      setSettings(await api.updateSettings(update));
      setMessage("Settings saved.");
    } catch (e) {
      setError((e as Error).message);
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
    } catch (e) {
      setAlexaErr((e as Error).message);
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
    } catch (e) {
      setAlexaErr((e as Error).message);
    }
  }

  const selected = students.find((s) => s.id === studentId);

  return (
    <Screen>
      <Title>Settings</Title>

      <SectionTitle>Alexa revision reminders</SectionTitle>
      <Card>
        <Text style={{ color: theme.muted }}>
          The app publishes a revision message to MQTT at the set times, and Home Assistant
          announces it on all Echo speakers.
        </Text>
        <Row label="Enabled">
          <Switch
            value={settings.alexa_enabled}
            onValueChange={(v) => save({ alexa_enabled: v })}
            trackColor={{ true: theme.primary }}
          />
        </Row>
        <TimeField
          label="Weekday time"
          value={settings.alexa_weekday_time}
          onChange={(v) => save({ alexa_weekday_time: v })}
        />
        <TimeField
          label="Weekend time"
          value={settings.alexa_weekend_time}
          onChange={(v) => save({ alexa_weekend_time: v })}
        />
        <Field label="Pages to revise (fallback window)">
          <StyledTextInput
            value={String(settings.revision_lookback_pages)}
            onChangeText={(v) => {
              const n = Number(v);
              if (!Number.isNaN(n) && n > 0) save({ revision_lookback_pages: n });
            }}
            keyboardType="number-pad"
          />
        </Field>
      </Card>

      <SectionTitle>Alexa schedule reminders</SectionTitle>
      <Card>
        <Text style={{ color: theme.muted }}>
          Pick a student to see their timetable. When enabled, Home Assistant announces each
          session before it starts, e.g. "Sara, Memorisation starts at 5:00pm".
        </Text>
        <PickerField
          label="Student"
          value={studentId}
          options={students.map((s) => ({ label: s.name, value: s.id }))}
          placeholder="Choose a student…"
          onChange={(v) => setStudentId(Number(v))}
        />

        {selected && (
          <View style={{ gap: 12, marginTop: 4 }}>
            <Row label={`Announce schedule reminders for ${selected.name}`}>
              <Switch
                value={selected.alexa_schedule_enabled}
                onValueChange={(v) => saveStudentAlexa({ enabled: v })}
                trackColor={{ true: theme.primary }}
              />
            </Row>
            <Field label="Minutes before each session">
              <StyledTextInput
                value={String(selected.alexa_schedule_lead_minutes)}
                onChangeText={(v) => {
                  const n = Number(v);
                  if (!Number.isNaN(n) && n >= 0) saveStudentAlexa({ lead_minutes: n });
                }}
                keyboardType="number-pad"
              />
            </Field>
            <Button title="Send test announcement" variant="secondary" onPress={testAnnounce} />
            <Text style={[styles.subLabel, { color: theme.muted }]}>Schedule slots</Text>
            {schedule.length === 0 ? (
              <Text style={{ color: theme.muted }}>No schedule slots for this student yet.</Text>
            ) : (
              schedule.map((e) => (
                <View key={e.id} style={[styles.slot, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    {e.day_of_week != null ? WEEKDAYS[e.day_of_week] : fmtDate(e.date ?? "")}
                  </Text>
                  <Text style={{ color: theme.text }}>
                    {fmtTime(e.start_time)} – {fmtTime(e.end_time)} · {e.label || "—"}
                  </Text>
                </View>
              ))
            )}
            <SuccessText>{alexaMsg}</SuccessText>
            <ErrorText>{alexaErr}</ErrorText>
          </View>
        )}
      </Card>

      <SectionTitle>Telegram</SectionTitle>
      <Card>
        <Text style={{ color: theme.muted }}>Daily progress summary time.</Text>
        <TimeField
          label="Daily summary time"
          value={settings.telegram_daily_time}
          onChange={(v) => save({ telegram_daily_time: v })}
        />
      </Card>

      <SuccessText>{message}</SuccessText>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ flex: 1, color: theme.muted, fontSize: 14 }}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 4,
  },
  slot: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
});
