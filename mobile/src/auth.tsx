import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, setApiBaseUrl, setAuthToken, setUnauthorizedHandler, User } from "./api";

const TOKEN_KEY = "hifz-token";
const API_URL_KEY = "hifz-api-url";

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  initializing: true,
  login: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  async function clearSession() {
    setAuthToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
    (async () => {
      try {
        const storedUrl = await AsyncStorage.getItem(API_URL_KEY);
        if (storedUrl) setApiBaseUrl(storedUrl);
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (!stored) {
          setInitializing(false);
          return;
        }
        setAuthToken(stored);
        const me = await api.me();
        setUser(me);
      } catch {
        await clearSession();
      } finally {
        setInitializing(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  async function login(username: string, password: string) {
    const res = await api.mobileLogin(username, password);
    setAuthToken(res.token);
    await AsyncStorage.setItem(TOKEN_KEY, res.token);
    setUser(res.user);
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // ignore network errors on logout
    }
    await clearSession();
  }

  return (
    <AuthContext.Provider value={{ user, initializing, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
