const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:5101"
).replace(/\/+$/, "");

export interface User {
  id: number;
  name: string;
  username: string;
  role: "creator" | "admin" | "user";
  telegram_id: number | null;
  is_active: boolean;
  student_id: number | null;
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
  alexa_schedule_enabled: boolean;
  alexa_schedule_lead_minutes: number;
}

export interface Progress {
  total_pages: number;
  memorised_pages: number;
  percent: number;
  rukus_memorised: number;
  total_rukus: number;
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
  juz: number | null;
  from_ayah: number | null;
  to_ayah: number | null;
  date: string;
  deadline: string | null;
  note: string | null;
  logged_by_id: number | null;
  created_at: string;
  student_name: string | null;
  surah_name_ar: string | null;
  surah_name_en: string | null;
  logged_by_name: string | null;
  assigned_by_name: string | null;
  juz_from: number | null;
  juz_to: number | null;
  ruku_from: number | null;
  ruku_to: number | null;
  completed: boolean;
  completed_at: string | null;
  completion: string | null;
  partial_from_ayah: number | null;
  partial_to_ayah: number | null;
  partial_note: string | null;
  rating: number | null;
  feedback: string | null;
  rated_by_name: string | null;
}

export interface JuzSummary {
  juz: number;
  page_from: number;
  page_to: number;
  pages_memorised: number;
  total_pages: number;
  complete: boolean;
  sessions: number;
  rated_sessions: number;
  avg_rating: number | null;
  duration_days: number | null;
}

export interface Stats {
  students: Student[];
  progress: Record<number, Progress>;
  recent_sessions: SessionDetail[];
  today_activity: number;
  total_sessions: number;
  juz_summary: Record<number, JuzSummary[]>;
  rateable_sessions: SessionDetail[];
  rated_sessions: SessionDetail[];
}

export interface Settings {
  telegram_daily_time: string;
  alexa_enabled: boolean;
  alexa_weekday_time: string;
  alexa_weekend_time: string;
  revision_lookback_pages: number;
}

export interface HistoryMonth {
  month: string;
  sessions: number;
  pages: number;
  ayahs: number;
  stars: number;
  avg_rating: number | null;
}

export interface HistoryJuz {
  juz: number;
  pages_memorised: number;
  total_pages: number;
  percent: number;
  complete: boolean;
  sessions: number;
  rated_sessions: number;
  avg_rating: number | null;
  duration_days: number | null;
}

export interface HistorySummary {
  student_id: number;
  student_name: string;
  season_start: string | null;
  first_session: string | null;
  last_session: string | null;
  total_sessions: number;
  completed_sessions: number;
  rated_sessions: number;
  total_stars: number;
  avg_rating: number | null;
  pages_memorised: number;
  ayahs_memorised: number;
  juzs_completed: number;
}

export interface HistoryStars {
  rating: number | null;
  sessions: number;
  pages: number;
  ayahs: number;
}

export interface History {
  summary: HistorySummary;
  by_month: HistoryMonth[];
  by_juz: HistoryJuz[];
  by_stars: HistoryStars[];
  sessions: SessionDetail[];
}

export interface ScheduleEntry {
  id: number;
  student_id: number;
  label: string;
  day_of_week: number | null;
  date: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  student_name: string | null;
}

export interface ScheduleEntryIn {
  student_id?: number;
  label?: string;
  day_of_week?: number | null;
  date?: string | null;
  start_time: string;
  end_time: string;
}

export interface SectionMeta {
  juz_from: number;
  juz_to: number;
  ruku_from: number;
  ruku_to: number;
}

export interface JuzAyah {
  local: number;
  surah_number: number;
  surah_name_ar: string | null;
  surah_name_en: string | null;
  ayah: number;
}

export interface JuzAyahList {
  juz: number;
  from_ayah: number;
  to_ayah: number;
  ayahs: JuzAyah[];
}

export interface SurahRef {
  number: number;
  name_ar: string;
  name_en: string;
}

export interface AyahMeta {
  juz: number;
  from_ayah: number;
  to_ayah: number;
  from_page: number;
  to_page: number;
  juz_from: number;
  juz_to: number;
  ruku_from: number;
  ruku_to: number;
  surahs: SurahRef[];
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(t: string | null) {
  token = t;
}

export function setUnauthorizedHandler(cb: (() => void) | null) {
  onUnauthorized = cb;
}

export function getAuthToken() {
  return token;
}

export function apiBaseUrl() {
  return BASE_URL;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    onUnauthorized?.();
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
  mobileLogin: (username: string, password: string) =>
    request<{ token: string; expires_at: string; user: User }>("/api/auth/mobile-login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),

  users: () => request<User[]>("/api/users"),
  studentLogins: () => request<User[]>("/api/users/student-logins"),
  createUser: (body: {
    name: string;
    username: string;
    password: string;
    role: string;
    student_id?: number | null;
  }) => request<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (
    id: number,
    body: Partial<{
      name: string;
      password: string;
      role: string;
      is_active: boolean;
      student_id: number | null;
    }>
  ) => request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: "DELETE" }),

  students: () => request<Student[]>("/api/students"),
  createStudent: (name: string) =>
    request<Student>("/api/students", { method: "POST", body: JSON.stringify({ name }) }),
  deleteStudent: (id: number) => request<void>(`/api/students/${id}`, { method: "DELETE" }),

  surahs: () => request<Surah[]>("/api/surahs"),

  sessions: () => request<SessionDetail[]>("/api/sessions"),
  sectionMeta: (surahId: number, fromPage: number, toPage: number) =>
    request<SectionMeta>(
      `/api/sessions/section-meta?surah_id=${surahId}&from_page=${fromPage}&to_page=${toPage}`
    ),
  juzAyahs: (juz: number) => request<JuzAyahList>(`/api/sessions/juz-ayahs?juz=${juz}`),
  ayahMeta: (juz: number, fromAyah: number, toAyah: number) =>
    request<AyahMeta>(`/api/sessions/ayah-meta?juz=${juz}&from_ayah=${fromAyah}&to_ayah=${toAyah}`),
  createSession: (body: {
    student_id: number;
    kind: "new" | "revision";
    from_page?: number;
    to_page?: number;
    juz?: number;
    from_ayah?: number;
    to_ayah?: number;
    deadline?: string;
    date?: string;
    note?: string;
  }) => request<SessionDetail>("/api/sessions", { method: "POST", body: JSON.stringify(body) }),
  deleteSession: (id: number) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
  setSessionCompleted: (
    id: number,
    body: {
      completed: boolean;
      completion?: "full" | "partial";
      partial_from_ayah?: number;
      partial_to_ayah?: number;
      partial_note?: string;
    }
  ) =>
    request<SessionDetail>(`/api/sessions/${id}/complete`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  setSessionRating: (id: number, body: { rating?: number | null; feedback?: string | null }) =>
    request<SessionDetail>(`/api/sessions/${id}/rating`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  stats: () => request<Stats>("/api/stats"),
  history: (
    params: {
      student_id?: number;
      kind?: "new" | "revision";
      from_month?: string;
      to_month?: string;
    } = {}
  ) => {
    const q = new URLSearchParams();
    if (params.student_id != null) q.set("student_id", String(params.student_id));
    if (params.kind) q.set("kind", params.kind);
    if (params.from_month) q.set("from_month", params.from_month);
    if (params.to_month) q.set("to_month", params.to_month);
    const qs = q.toString();
    return request<History>(qs ? `/api/stats/history?${qs}` : "/api/stats/history");
  },

  settings: () => request<Settings>("/api/settings"),
  updateSettings: (body: Partial<Settings>) =>
    request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(body) }),

  schedule: (params: { student_id?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.student_id != null) q.set("student_id", String(params.student_id));
    const qs = q.toString();
    return request<ScheduleEntry[]>(qs ? `/api/schedule?${qs}` : "/api/schedule");
  },
  createSchedule: (body: ScheduleEntryIn) =>
    request<ScheduleEntry>("/api/schedule", { method: "POST", body: JSON.stringify(body) }),
  updateSchedule: (id: number, body: Partial<ScheduleEntryIn>) =>
    request<ScheduleEntry>(`/api/schedule/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSchedule: (id: number) => request<void>(`/api/schedule/${id}`, { method: "DELETE" }),
  updateStudentAlexa: (studentId: number, body: { enabled?: boolean; lead_minutes?: number }) =>
    request<Student>(`/api/schedule/alexa/${studentId}`, { method: "PATCH", body: JSON.stringify(body) }),
  testStudentAlexa: (studentId: number) =>
    request<{ published: boolean }>(`/api/schedule/alexa/test/${studentId}`, { method: "POST" }),
};
