/// <reference types="vite/client" />

export interface User {
  id: number;
  name: string;
  username: string;
  role: "admin" | "user";
  telegram_id: number | null;
  is_active: boolean;
}

export interface Surah {
  id: number;
  number: number;
  name_ar: string;
  name_en: string;
  start_page: number;
  end_page: number;
}

export interface Student {
  id: number;
  name: string;
}

export interface Progress {
  total_pages: number;
  memorised_pages: number;
  percent: number;
  current_surah: Surah | null;
  current_page: number | null;
}

export interface SessionDetail {
  id: number;
  student_id: number;
  kind: "new" | "revision";
  surah_id: number;
  from_page: number;
  to_page: number;
  date: string;
  note: string | null;
  logged_by_id: number | null;
  created_at: string;
  student_name: string | null;
  surah_name_ar: string | null;
  surah_name_en: string | null;
  logged_by_name: string | null;
}

export interface Stats {
  students: Student[];
  progress: Record<number, Progress>;
  recent_sessions: SessionDetail[];
  today_activity: number;
  total_sessions: number;
}

export interface Settings {
  telegram_daily_time: string;
  alexa_enabled: boolean;
  alexa_weekday_time: string;
  alexa_weekend_time: string;
  revision_lookback_pages: number;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),
  linkCode: () =>
    request<{ code: string; expires_at: string }>("/api/auth/link-code", {
      method: "POST",
    }),

  users: () => request<User[]>("/api/users"),
  createUser: (body: { name: string; username: string; password: string; role: string }) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: number, body: Partial<{ name: string; password: string; role: string; is_active: boolean }>) =>
    request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  students: () => request<Student[]>("/api/students"),
  createStudent: (name: string) =>
    request<Student>("/api/students", { method: "POST", body: JSON.stringify({ name }) }),
  deleteStudent: (id: number) => request<void>(`/api/students/${id}`, { method: "DELETE" }),

  surahs: () => request<Surah[]>("/api/surahs"),

  sessions: () => request<SessionDetail[]>("/api/sessions"),
  createSession: (body: {
    student_id: number;
    kind: "new" | "revision";
    surah_id: number;
    from_page: number;
    to_page: number;
    date?: string;
    note?: string;
  }) => request<SessionDetail>("/api/sessions", { method: "POST", body: JSON.stringify(body) }),
  deleteSession: (id: number) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),

  stats: () => request<Stats>("/api/stats"),

  settings: () => request<Settings>("/api/settings"),
  updateSettings: (body: Partial<Settings>) =>
    request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(body) }),
};
