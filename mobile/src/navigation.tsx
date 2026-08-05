import React from "react";
import { StyleSheet, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "./auth";
import { useTheme } from "./ui";
import { RootStackParamList } from "./navigation-types";
import Dashboard from "./screens/Dashboard";
import HistoryPage from "./screens/History";
import SchedulePage from "./screens/Schedule";
import LogSession from "./screens/LogSession";
import Students from "./screens/Students";
import SettingsPage from "./screens/Settings";
import Users from "./screens/Users";
import More from "./screens/More";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: focused ? theme.primary : theme.muted,
        fontSize: 11,
        fontWeight: focused ? "700" : "500",
      }}
    >
      {label}
    </Text>
  );
}

function Tabs() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const screenOptions = {
    headerShown: false,
    tabBarStyle: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
    },
  } as const;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...screenOptions,
        tabBarIcon: () => <LabelIcon label={route.name} />,
        tabBarLabel: ({ focused }) => <TabLabel label={tabLabel(route.name)} focused={focused} />,
      })}
    >
      <Tab.Screen name="Home" component={Dashboard} />
      <Tab.Screen name="History" component={HistoryPage} />
      <Tab.Screen name="Schedule" component={SchedulePage} />
      {user?.role !== "user" && <Tab.Screen name="Log" component={LogSession} />}
      <Tab.Screen name="More" component={More} />
    </Tab.Navigator>
  );
}

function tabLabel(name: string) {
  switch (name) {
    case "Home":
      return "Home";
    case "History":
      return "History";
    case "Schedule":
      return "Schedule";
    case "Log":
      return "Log";
    default:
      return "More";
  }
}

function LabelIcon({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <Text style={{ color: theme.muted, fontWeight: "800", fontSize: 18 }}>{iconFor(label)}</Text>
  );
}

function iconFor(name: string) {
  switch (name) {
    case "Home":
      return "⌂";
    case "History":
      return "≡";
    case "Schedule":
      return "◷";
    case "Log":
      return "+";
    default:
      return "⋮";
  }
}

export default function RootNavigator() {
  const { theme } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Students" component={Students} options={{ title: "Students" }} />
      <Stack.Screen name="Settings" component={SettingsPage} options={{ title: "Settings" }} />
      <Stack.Screen name="Users" component={Users} options={{ title: "Users" }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({});
