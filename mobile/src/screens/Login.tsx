import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../auth";
import { apiBaseUrl } from "../api";
import { Button, ErrorText, StyledTextInput, useTheme } from "../ui";

export default function Login() {
  const { login } = useAuth();
  const { theme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (!username || !password) {
      setError("Enter your username and password.");
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.brand, { color: theme.primary }]}>Qur'an Hifz</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>Tracker</Text>
        <StyledTextInput
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <StyledTextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Sign in" onPress={submit} loading={loading} />
        <Text style={{ color: theme.muted, fontSize: 11, textAlign: "center", marginTop: 6 }}>
          {apiBaseUrl()}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 14,
    marginTop: -8,
  },
});
