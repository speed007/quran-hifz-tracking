import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { api, ScheduleEntry, Student, User } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  LinkButton,
  Loading,
  Screen,
  SectionTitle,
  StyledTextInput,
  SuccessText,
  Title,
  useTheme,
} from "../ui";
import { DateField, PickerField, TimeField } from "../pickers";
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

function confirmAction(message: string, onYes: () => void) {
  Alert.alert("Confirm", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onYes },
  ]);
}

export default function SchedulePage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isStudent = user?.role === "user";
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [label, setLabel] = useState("");
  const [slotType, setSlotType] = useState<"weekly" | "date">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  async function load() {
    try {
      setEntries(await api.schedule(isStudent || studentId == null ? {} : { student_id: studentId }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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
    setDayOfWeek(null);
    setDate("");
    setStartTime("");
    setEndTime("");
    setEditingId(null);
  }

  function startEdit(entry: ScheduleEntry) {
    setEditingId(entry.id);
    setLabel(entry.label);
    setSlotType(entry.day_of_week != null ? "weekly" : "date");
    setDayOfWeek(entry.day_of_week);
    setDate(entry.date ?? "");
    setStartTime(entry.start_time);
    setEndTime(entry.end_time);
  }

  async function submit() {
    setMessage("");
    setError("");
    if (!startTime || !endTime || endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }
    if (slotType === "weekly" && dayOfWeek == null) {
      setError("Choose a day of the week.");
      return;
    }
    if (slotType === "date" && !date) {
      setError("Choose a date.");
      return;
    }
    const body = {
      label: label || undefined,
      day_of_week: slotType === "weekly" ? dayOfWeek : null,
      date: slotType === "date" ? date : null,
      start_time: startTime,
      end_time: endTime,
    };
    try {
      if (editingId != null) {
        await api.updateSchedule(editingId, body);
        setMessage("Schedule updated.");
      } else {
        await api.createSchedule({ ...body, student_id: isStudent ? undefined : studentId ?? undefined });
        setMessage("Schedule slot added.");
      }
      resetForm();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function remove(entry: ScheduleEntry) {
    confirmAction(
      `Delete ${entry.label || "slot"} on ${
        entry.day_of_week != null ? WEEKDAYS[entry.day_of_week] : fmtDate(entry.date ?? "")
      }?`,
      async () => {
        try {
          await api.deleteSchedule(entry.id);
          if (editingId === entry.id) resetForm();
          await load();
        } catch (e) {
          setError((e as Error).message);
        }
      }
    );
  }

  const recurring = entries.filter((e) => e.day_of_week != null);
  const oneOff = entries.filter((e) => e.date != null);

  return (
    <Screen refreshing={refreshing} onRefresh={handleRefresh}>
      <Title>Schedule</Title>

      {!isStudent && (
        <Card>
          <PickerField
            label="Student"
            value={studentId}
            options={[{ label: "All students", value: "" }, ...students.map((s) => ({ label: s.name, value: s.id }))]}
            placeholder="All students"
            onChange={(v) => setStudentId(v === "" ? null : Number(v))}
          />
        </Card>
      )}

      <Card>
        <Text style={[styles.formTitle, { color: theme.text }]}>
          {editingId != null ? "Edit schedule slot" : "Add a schedule slot"}
        </Text>
        <Field label="What is this for? (optional)">
          <StyledTextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Memorisation, Revision, Rest"
          />
        </Field>
        <PickerField
          label="Type"
          value={slotType}
          options={[
            { label: "Every week on a day", value: "weekly" },
            { label: "One-off on a date", value: "date" },
          ]}
          onChange={(v) => setSlotType(v as "weekly" | "date")}
        />
        {slotType === "weekly" ? (
          <PickerField
            label="Day of the week"
            value={dayOfWeek}
            options={WEEKDAYS.map((d, i) => ({ label: d, value: i }))}
            placeholder="Choose…"
            onChange={(v) => setDayOfWeek(Number(v))}
          />
        ) : (
          <DateField label="Date" value={date} placeholder="Choose a date" onChange={setDate} />
        )}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TimeField label="Start time" value={startTime} onChange={setStartTime} />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField label="End time" value={endTime} onChange={setEndTime} />
          </View>
        </View>
        <ErrorText>{error}</ErrorText>
        <SuccessText>{message}</SuccessText>
        <View style={styles.row}>
          <Button
            title={editingId != null ? "Save changes" : "Add slot"}
            onPress={submit}
            style={{ flex: 1 }}
          />
          {editingId != null && (
            <Button title="Cancel" variant="secondary" onPress={resetForm} style={{ flex: 1 }} />
          )}
        </View>
      </Card>

      <SectionTitle>Weekly</SectionTitle>
      {recurring.length === 0 ? (
        <EmptyState>No weekly slots yet.</EmptyState>
      ) : (
        recurring.map((e) => (
          <Card key={e.id}>
            <Text style={[styles.itemTitle, { color: theme.text }]}>
              {WEEKDAYS[e.day_of_week ?? 0]} · {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
            </Text>
            <Text style={{ color: theme.muted }}>
              {e.label || "—"}
              {!isStudent && e.student_name ? ` · ${e.student_name}` : ""}
            </Text>
            <View style={styles.row}>
              <LinkButton title="Edit" onPress={() => startEdit(e)} />
              <LinkButton title="Delete" danger onPress={() => remove(e)} />
            </View>
          </Card>
        ))
      )}

      <SectionTitle>One-off</SectionTitle>
      {oneOff.length === 0 ? (
        <EmptyState>No one-off slots yet.</EmptyState>
      ) : (
        oneOff.map((e) => (
          <Card key={e.id}>
            <Text style={[styles.itemTitle, { color: theme.text }]}>
              {fmtDate(e.date ?? "")} · {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
            </Text>
            <Text style={{ color: theme.muted }}>
              {e.label || "—"}
              {!isStudent && e.student_name ? ` · ${e.student_name}` : ""}
            </Text>
            <View style={styles.row}>
              <LinkButton title="Edit" onPress={() => startEdit(e)} />
              <LinkButton title="Delete" danger onPress={() => remove(e)} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
});
