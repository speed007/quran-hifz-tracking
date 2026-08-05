import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api, AyahMeta, JuzAyah, JuzAyahList, SessionDetail, Student, User } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  Card,
  EmptyState,
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
import { DateField, PickerField } from "../pickers";

export default function LogSession() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [kind, setKind] = useState<"new" | "revision">("new");
  const [juz, setJuz] = useState<number | null>(null);
  const [juzAyahList, setJuzAyahList] = useState<JuzAyahList | null>(null);
  const [ayahFrom, setAyahFrom] = useState<number | null>(null);
  const [ayahTo, setAyahTo] = useState<number | null>(null);
  const [meta, setMeta] = useState<AyahMeta | null>(null);
  const [date, setDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<SessionDetail | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .students()
      .then(setStudents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (juz == null) {
      setJuzAyahList(null);
      setAyahFrom(null);
      setAyahTo(null);
      setMeta(null);
      return;
    }
    api
      .juzAyahs(juz)
      .then((data) => {
        setJuzAyahList(data);
        if (data.ayahs.length > 0) {
          setAyahFrom(1);
          setAyahTo(data.ayahs.length);
        } else {
          setAyahFrom(null);
          setAyahTo(null);
        }
      })
      .catch(() => setJuzAyahList(null));
  }, [juz]);

  useEffect(() => {
    if (juz == null || ayahFrom == null || ayahTo == null || ayahFrom > ayahTo) {
      setMeta(null);
      return;
    }
    api
      .ayahMeta(juz, ayahFrom, ayahTo)
      .then(setMeta)
      .catch(() => setMeta(null));
  }, [juz, ayahFrom, ayahTo]);

  function ayahOptions(): { label: string; value: number }[] {
    if (!juzAyahList) return [];
    return juzAyahList.ayahs.map((a: JuzAyah) => ({
      label: `${a.surah_name_en ?? `Surah ${a.surah_number}`} · Ayah ${a.ayah}`,
      value: a.local,
    }));
  }

  async function submit() {
    setError("");
    setMessage("");
    setCreated(null);
    if (studentId == null) {
      setError("Choose a student.");
      return;
    }
    if (juz == null || ayahFrom == null || ayahTo == null) {
      setError("Select the ayah range to log.");
      return;
    }
    if (ayahFrom > ayahTo) {
      setError("From ayah must be before or equal to To ayah.");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.createSession({
        student_id: studentId,
        kind,
        juz,
        from_ayah: ayahFrom,
        to_ayah: ayahTo,
        deadline: deadline || undefined,
        date: date || undefined,
        note: note || undefined,
      });
      setMessage("Session logged.");
      setCreated(saved);
      setJuz(null);
      setJuzAyahList(null);
      setAyahFrom(null);
      setAyahTo(null);
      setMeta(null);
      setDeadline("");
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (user?.role === "user") {
    return (
      <Screen>
        <Card>Only admins can log sessions.</Card>
      </Screen>
    );
  }

  if (students.length === 0) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Title>Log a session</Title>
      <Card>
        <PickerField
          label="Student"
          value={studentId}
          options={students.map((s) => ({ label: s.name, value: s.id }))}
          placeholder="Choose…"
          onChange={(v) => setStudentId(Number(v))}
        />
        <PickerField
          label="Type"
          value={kind}
          options={[
            { label: "Memorised (new)", value: "new" },
            { label: "Revision", value: "revision" },
          ]}
          onChange={(v) => setKind(v as "new" | "revision")}
        />
        <PickerField
          label="Juz"
          value={juz}
          options={Array.from({ length: 30 }, (_, i) => i + 1).map((n) => ({
            label: `Juz ${n}`,
            value: n,
          }))}
          placeholder="Choose…"
          onChange={(v) => setJuz(Number(v))}
        />
        <Text style={{ color: theme.muted, fontSize: 13 }}>
          Select the ayah range the student will cover within this juz (using the 16-line mushaf).
          Surah, ruku and page info below are shown as reference only.
        </Text>
        {juz != null && (
          <>
            <PickerField
              label="From ayah"
              value={ayahFrom}
              options={ayahOptions()}
              placeholder="—"
              onChange={(v) => setAyahFrom(Number(v))}
            />
            <PickerField
              label="To ayah"
              value={ayahTo}
              options={ayahOptions()}
              placeholder="—"
              onChange={(v) => setAyahTo(Number(v))}
            />
          </>
        )}
      </Card>

      {meta && (
        <Card>
          <Text style={[styles.refTitle, { color: theme.muted }]}>Reference</Text>
          <Text style={{ color: theme.text }}>
            <Text style={styles.refLabel}>Ayahs:</Text> {meta.from_ayah}–{meta.to_ayah} of Juz {meta.juz}
          </Text>
          <Text style={{ color: theme.text }}>
            <Text style={styles.refLabel}>Surah:</Text> {meta.surahs.map((s) => s.name_en).join(", ")}
          </Text>
          <Text style={{ color: theme.text }}>
            <Text style={styles.refLabel}>Ruku:</Text>{" "}
            {meta.ruku_from === meta.ruku_to ? meta.ruku_from : `${meta.ruku_from}–${meta.ruku_to}`}
          </Text>
          <Text style={{ color: theme.text }}>
            <Text style={styles.refLabel}>Pages:</Text> {meta.from_page}–{meta.to_page}
          </Text>
        </Card>
      )}

      <Card>
        <DateField
          label="Date (defaults to today)"
          value={date}
          placeholder="Today"
          onChange={setDate}
        />
        <DateField
          label="Deadline (optional)"
          value={deadline}
          placeholder="None"
          onChange={setDeadline}
        />
        <Field label="Note (optional)">
          <StyledTextInput value={note} onChangeText={setNote} placeholder="e.g. Qaidah completed" />
        </Field>
      </Card>

      {created && (
        <Card>
          <Text style={{ color: theme.text }}>
            Juz {created.juz}, ayahs {created.from_ayah}–{created.to_ayah} · {created.surah_name_en},
            pages {created.from_page}–{created.to_page}
            {created.deadline ? ` · Deadline: ${created.deadline}` : ""}
            {created.ruku_from != null && created.ruku_to != null
              ? ` · Ruku ${created.ruku_from === created.ruku_to ? created.ruku_from : `${created.ruku_from}–${created.ruku_to}`}`
              : ""}
          </Text>
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      <SuccessText>{message}</SuccessText>
      <Button title="Save session" onPress={submit} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  refTitle: {
    fontWeight: "700",
  },
  refLabel: {
    fontWeight: "700",
  },
});
