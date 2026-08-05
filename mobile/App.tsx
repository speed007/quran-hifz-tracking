import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/auth";
import { ThemeProvider, useTheme } from "./src/ui";
import RootNavigator from "./src/navigation";
import Login from "./src/screens/Login";

function Root() {
  const { user, initializing } = useAuth();
  const { theme } = useTheme();

  if (initializing) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style={theme.dark ? "light" : "dark"} />
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {user ? <RootNavigator /> : <Login />}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NavigationContainer>
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </ThemeProvider>
  );
}
