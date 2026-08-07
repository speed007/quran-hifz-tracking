import React, { useState } from "react";
import { Alert, Share, StyleSheet, Switch, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../auth";
import { api, apiBaseUrl, setApiBaseUrl } from "../api";
import { Card, Prompt, Screen, Title, useTheme } from "../ui";
import { RootStackParamList } from "../navigation-types";

function MenuRow({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.menuRow, { borderBottomColor: theme.border }]}>
      <Text style={{ color: danger ? theme.danger : theme.text, fontSize: 16, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: theme.primary, fontSize: 18 }}>›</Text>
    </View>
  );
}

export default function More() {
  const { user, logout } = useAuth();
  const { theme, isDark, toggle } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [editingUrl, setEditingUrl] = useState(false);
  const [exporting, setExporting] = useState(false);

  function confirmLogout() {
    Alert.alert("Log out", "Sign out of this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logout() },
    ]);
  }

  async function saveUrl(url: string) {
    if (!url.trim()) return;
    setApiBaseUrl(url);
    await AsyncStorage.setItem("hifz-api-url", url.trim()).catch(() => {});
  }

  async function exportData() {
    setExporting(true);
    try {
      const csv = await api.exportCsv();
      await Share.share({ message: csv, title: "Quran Hifz export" });
    } catch (e) {
      Alert.alert("Export failed", (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <Title>More</Title>
      {user && (
        <Card>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{user.name}</Text>
          <Text style={{ color: theme.muted }}>
            {user.username} ·{" "}
            {user.role === "creator" ? "Creator" : user.role === "admin" ? "Admin" : "Student"}
          </Text>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {user?.role !== "user" && (
          <View>
            <MenuRow label="Students" onPress={() => navigation.navigate("Students")} />
          </View>
        )}
        {user?.role === "creator" && (
          <View>
            <MenuRow label="Settings" onPress={() => navigation.navigate("Settings")} />
          </View>
        )}
        <View>
          <MenuRow
            label={user?.role === "creator" ? "Users" : "My account"}
            onPress={() => navigation.navigate("Users")}
          />
        </View>
        <View>
          <MenuRow label="Export data (CSV)" onPress={() => !exporting && exportData()} />
        </View>
        <View>
          <MenuRow label="Server URL" onPress={() => setEditingUrl(true)} />
        </View>
        <View style={[styles.menuRow, { borderBottomWidth: 0 }]}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Dark theme</Text>
          <Switch
            value={isDark}
            onValueChange={toggle}
            trackColor={{ true: theme.primary }}
          />
        </View>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <MenuRow label="Log out" onPress={confirmLogout} danger />
      </Card>

      <Text style={{ color: theme.muted, fontSize: 11, textAlign: "center", marginTop: 12 }}>
        {apiBaseUrl()}
      </Text>

      <Prompt
        visible={editingUrl}
        title="Server URL"
        message="Where is the tracker running? e.g. https://hifz.yourdomain.example"
        placeholder={apiBaseUrl()}
        confirmLabel="Save"
        onConfirm={(v) => {
          saveUrl(v);
          setEditingUrl(false);
        }}
        onCancel={() => setEditingUrl(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  menuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
});
