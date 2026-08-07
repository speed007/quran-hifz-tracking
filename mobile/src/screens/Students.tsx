import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { api, Stats, Student, User } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  Card,
  ErrorText,
  Field,
  LinkButton,
  Loading,
  ProgressBar,
  Prompt,
  Screen,
  StyledTextInput,
  SuccessText,
  Title,
  useTheme,
} from "../ui";

function confirmAction(message: string, onYes: () => void, button = "Delete") {
  Alert.alert("Confirm", message, [
    { text: "Cancel", style: "cancel" },
    { text: button, style: "destructive", onPress: onYes },
  ]);
}

export default function Students() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isAdmin = user?.role !== "user";
  const [stats, setStats] = useState<Stats | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      setStats(await api.stats());
      if (isAdmin) {
        const rows = await api.studentLogins();
        setLogins(Object.fromEntries(rows.map((r) => [r.student_id ?? -1, r])));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const [logins, setLogins] = useState<Record<number, User>>({});
  const [loginFormFor, setLoginFormFor] = useState<number | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [resetTarget, setResetTarget] = useState<User | null>(null);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => setError((e as Error).message));
  }, [reload]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .studentLogins()
      .then((rows) => setLogins(Object.fromEntries(rows.map((r) => [r.student_id ?? -1, r]))))
      .catch(() => {});
  }, [isAdmin, reload]);

  if (error) return <Screen><ErrorText>{error}</ErrorText></Screen>;
  if (!stats) return <Screen><Loading /></Screen>;

  function studentName(studentId: number) {
    return stats?.students.find((s) => s.id === studentId)?.name ?? "";
  }

  async function add() {
    setError("");
    setMessage("");
    if (!name.trim()) return;
    try {
      await api.createStudent(name.trim());
      setName("");
      setMessage("Student added.");
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function remove(student: Student) {
    confirmAction(
      `Delete "${student.name}" and all their sessions?`,
      async () => {
        try {
          await api.deleteStudent(student.id);
          setReload((n) => n + 1);
        } catch (e) {
          setError((e as Error).message);
        }
      }
    );
  }

  function startLogin(student: Student) {
    setLoginFormFor(student.id);
    setLoginName(student.name);
    setLoginUsername("");
    setLoginPassword("");
  }

  async function createLogin(studentId: number) {
    setError("");
    setMessage("");
    if (!loginUsername.trim() || loginPassword.length < 6) {
      setError("Enter a username and a password of at least 6 characters.");
      return;
    }
    try {
      await api.createUser({
        name: loginName.trim() || studentName(studentId),
        username: loginUsername.trim(),
        password: loginPassword,
        role: "user",
        student_id: studentId,
      });
      setLoginFormFor(null);
      setMessage("Login created.");
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function resetLoginPassword(target: User) {
    setResetTarget(target);
  }

  async function submitReset(value: string) {
    if (!resetTarget) return;
    if (value.length < 6) {
      setError("Password must be at least 6 characters.");
      setResetTarget(null);
      return;
    }
    setError("");
    try {
      await api.updateUser(resetTarget.id, { password: value });
      setMessage(`Password reset for ${resetTarget.username}.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setResetTarget(null);
  }

  async function toggleLoginActive(target: User) {
    setError("");
    try {
      await api.updateUser(target.id, { is_active: !target.is_active });
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function removeLogin(target: User) {
    confirmAction(`Delete login "${target.username}"? This cannot be undone.`, async () => {
      setError("");
      try {
        await api.deleteUser(target.id);
        setMessage(`Login ${target.username} deleted.`);
        setReload((n) => n + 1);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Screen refreshing={refreshing} onRefresh={handleRefresh}>
      <Title>Students</Title>

      {isAdmin && (
        <Card>
          <Field label="Student name">
            <StyledTextInput value={name} onChangeText={setName} placeholder="e.g. Sara" />
          </Field>
          <Button title="Add student" onPress={add} disabled={!name.trim()} />
        </Card>
      )}

      <SuccessText>{message}</SuccessText>
      <ErrorText>{error}</ErrorText>

      {stats.students.length === 0 && (
        <Card>
          <Text style={{ color: theme.muted }}>No students yet.</Text>
        </Card>
      )}

      {stats.students.map((student) => {
        const p = stats.progress[student.id];
        const login = logins[student.id];
        return (
          <Card key={student.id}>
            <View style={styles.rowSpace}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{student.name}</Text>
              {isAdmin && <LinkButton title="Delete" danger onPress={() => remove(student)} />}
            </View>
            <ProgressBar percent={p?.percent ?? 0} />
            <Text style={{ color: theme.text }}>
              {p?.memorised_pages ?? 0} / {p?.total_pages} pages ({p?.percent ?? 0}%)
              {p?.current_page ? ` · at page ${p.current_page}` : ""}
            </Text>

            {isAdmin && (
              <View
                style={[
                  styles.loginSection,
                  { borderTopColor: theme.border },
                ]}
              >
                <Text style={[styles.subLabel, { color: theme.muted }]}>Login</Text>
                {login ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: login.is_active ? theme.text : theme.muted }}>
                      {login.username}
                      {!login.is_active ? " (disabled)" : ""}
                    </Text>
                    <View style={styles.rowWrap}>
                      <LinkButton title="Reset password" onPress={() => resetLoginPassword(login)} />
                      <LinkButton title={login.is_active ? "Disable" : "Enable"} onPress={() => toggleLoginActive(login)} />
                      <LinkButton title="Delete" danger onPress={() => removeLogin(login)} />
                    </View>
                  </View>
                ) : loginFormFor === student.id ? (
                  <View style={{ gap: 8 }}>
                    <StyledTextInput value={loginName} onChangeText={setLoginName} placeholder="Display name" />
                    <StyledTextInput value={loginUsername} onChangeText={setLoginUsername} placeholder="Username" autoCapitalize="none" />
                    <StyledTextInput
                      value={loginPassword}
                      onChangeText={setLoginPassword}
                      placeholder="Password (min 6)"
                      secureTextEntry
                    />
                    <View style={styles.row}>
                      <Button title="Create login" onPress={() => createLogin(student.id)} style={{ flex: 1 }} />
                      <Button title="Cancel" variant="secondary" onPress={() => setLoginFormFor(null)} style={{ flex: 1 }} />
                    </View>
                  </View>
                ) : (
                  <LinkButton title="+ Create login" onPress={() => startLogin(student)} />
                )}
              </View>
            )}
          </Card>
        );
      })}

      <Prompt
        visible={resetTarget != null}
        title={`Reset password for ${resetTarget?.username ?? ""}`}
        message="New password (min 6 characters):"
        placeholder="New password"
        secureTextEntry
        confirmLabel="Reset"
        onConfirm={submitReset}
        onCancel={() => setResetTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  rowSpace: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  loginSection: {
    marginTop: 8,
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 6,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
