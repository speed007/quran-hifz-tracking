import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { api, User } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  Card,
  ErrorText,
  Field,
  LinkButton,
  Loading,
  Prompt,
  Screen,
  SectionTitle,
  StyledTextInput,
  SuccessText,
  Title,
  useTheme,
} from "../ui";
import { PickerField } from "../pickers";

export default function Users() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "creator") return <MyAccount user={user} />;
  return <UserManagement user={user} />;
}

function MyAccount({ user }: { user: User }) {
  const { theme } = useTheme();
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setError("");
    setMessage("");
    if (!name.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const body: { name: string; password?: string } = { name: name.trim() };
      if (password) body.password = password;
      await api.updateUser(user.id, body);
      setPassword("");
      setMessage("Account updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Title>My account</Title>
      <Card>
        <Text style={styles.row}>
          <Text style={styles.label}>Username: </Text>
          <Text style={{ color: theme.text }}>{user.username}</Text>
        </Text>
        <Text style={styles.row}>
          <Text style={styles.label}>Role: </Text>
          <Text style={{ color: theme.text }}>
            {user.role === "creator" ? "Creator" : user.role === "admin" ? "Admin" : "User (read-only)"}
          </Text>
        </Text>
        <Text style={styles.row}>
          <Text style={styles.label}>Status: </Text>
          <Text style={{ color: theme.text }}>{user.is_active ? "Active" : "Disabled"}</Text>
        </Text>
      </Card>

      <Card>
        <Text style={[styles.formTitle, { color: theme.text }]}>Edit your details</Text>
        <Field label="Name">
          <StyledTextInput value={name} onChangeText={setName} />
        </Field>
        <Field label="New password (leave blank to keep current)">
          <StyledTextInput value={password} onChangeText={setPassword} secureTextEntry />
        </Field>
        <ErrorText>{error}</ErrorText>
        <SuccessText>{message}</SuccessText>
        <Button title="Save changes" onPress={save} loading={saving} />
      </Card>
    </Screen>
  );
}

function UserManagement({ user }: { user: User }) {
  const { theme } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [resetTarget, setResetTarget] = useState<User | null>(null);

  useEffect(() => {
    api
      .users()
      .then(setUsers)
      .catch((e) => setError((e as Error).message));
  }, [reload]);

  async function add() {
    setError("");
    setMessage("");
    if (!name.trim() || !username.trim() || password.length < 6) {
      setError("Fill in name, username and a password of at least 6 characters.");
      return;
    }
    try {
      await api.createUser({ name: name.trim(), username: username.trim(), password, role });
      setName("");
      setUsername("");
      setPassword("");
      setRole("user");
      setMessage("User created.");
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleActive(target: User) {
    setError("");
    try {
      await api.updateUser(target.id, { is_active: !target.is_active });
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
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

  function remove(target: User) {
    Alert.alert("Confirm", `Delete user "${target.username}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setError("");
          try {
            await api.deleteUser(target.id);
            setMessage(`User ${target.username} deleted.`);
            setReload((n) => n + 1);
          } catch (e) {
            setError((e as Error).message);
          }
        },
      },
    ]);
  }

  function canManage(target: User) {
    if (target.role === "creator") return false;
    if (target.id === user.id) return false;
    return true;
  }

  function canDelete(target: User) {
    return canManage(target);
  }

  function roleLabel(role: string) {
    if (role === "creator") return "Creator";
    if (role === "admin") return "Admin";
    return "User (read-only)";
  }

  return (
    <Screen>
      <Title>Users</Title>

      <SectionTitle>Add user</SectionTitle>
      <Card>
        <Field label="Name">
          <StyledTextInput value={name} onChangeText={setName} />
        </Field>
        <Field label="Username">
          <StyledTextInput value={username} onChangeText={setUsername} autoCapitalize="none" />
        </Field>
        <Field label="Password">
          <StyledTextInput value={password} onChangeText={setPassword} secureTextEntry />
        </Field>
        <PickerField
          label="Role"
          value={role}
          options={[
            { label: "User (read-only)", value: "user" },
            { label: "Admin", value: "admin" },
          ]}
          onChange={(v) => setRole(v as "user" | "admin")}
        />
        <Button title="Create user" onPress={add} />
      </Card>

      <SectionTitle>Existing users</SectionTitle>
      <SuccessText>{message}</SuccessText>
      <ErrorText>{error}</ErrorText>

      {users.length === 0 ? (
        <Loading />
      ) : (
        users.map((u) => (
          <Card key={u.id}>
            <View style={styles.rowSpace}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {u.name}
                  {u.id === user.id ? <Text style={{ color: theme.muted }}> (you)</Text> : null}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 13 }}>
                  {u.username} · {roleLabel(u.role)} ·{" "}
                  {u.is_active ? "Active" : "Disabled"}
                </Text>
              </View>
              {u.id === user.id ? null : canManage(u) ? (
                <View style={styles.rowActions}>
                  {canDelete(u) && <LinkButton title="Delete" danger onPress={() => remove(u)} />}
                  <LinkButton title={u.is_active ? "Disable" : "Enable"} onPress={() => toggleActive(u)} />
                  <LinkButton title="Reset password" onPress={() => setResetTarget(u)} />
                </View>
              ) : (
                <Text style={{ color: theme.muted, fontSize: 12 }}>Protected</Text>
              )}
            </View>
          </Card>
        ))
      )}

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
  row: {
    color: "#888",
  },
  label: {
    color: "#888",
    fontWeight: "600",
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  rowSpace: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 4,
    maxWidth: "60%",
  },
});
