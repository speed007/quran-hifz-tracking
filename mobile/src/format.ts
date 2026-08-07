import { SessionDetail } from "./api";

export function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

export function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export function sectionLabel(s: SessionDetail): string {
  if (s.juz != null && s.from_ayah != null) {
    const to = s.to_ayah != null && s.to_ayah !== s.from_ayah ? `–${s.to_ayah}` : "";
    return `Juz ${s.juz} · ayah ${s.from_ayah}${to}`;
  }
  if (s.juz_from != null && s.juz_to != null) {
    return s.juz_from === s.juz_to ? `Juz ${s.juz_from}` : `Juz ${s.juz_from}–${s.juz_to}`;
  }
  return "–";
}

export function sectionReference(s: SessionDetail): string {
  if (s.juz != null && s.from_ayah != null) {
    const total = (s.to_ayah ?? s.from_ayah) - s.from_ayah + 1;
    const segments = (s.surah_segments ?? []).map(
      (seg) => `ayah ${seg.from_ayah}–${seg.to_ayah} ${seg.name_en}`
    );
    if (segments.length > 0) {
      return `Juz ${s.juz} · ${segments.join(" · ")} · ${total} ayahs total`;
    }
    return sectionLabel(s);
  }
  if (s.juz_from != null && s.juz_to != null) {
    const base = s.juz_from === s.juz_to ? `Juz ${s.juz_from}` : `Juz ${s.juz_from}–${s.juz_to}`;
    return s.surah_name_en ? `${base} · ${s.surah_name_en}` : base;
  }
  return "–";
}

export function rukuLabel(s: SessionDetail): string {
  if (s.ruku_from == null || s.ruku_to == null) return "–";
  return s.ruku_from === s.ruku_to ? `Ruku ${s.ruku_from}` : `Ruku ${s.ruku_from}–${s.ruku_to}`;
}

export function partialText(s: SessionDetail): string | null {
  if (s.completion !== "partial") return null;
  const range =
    s.partial_from_ayah != null && s.partial_to_ayah != null
      ? `Did ayahs ${s.partial_from_ayah}–${s.partial_to_ayah}. `
      : "Partial. ";
  return `${range}${s.partial_note ?? ""}`;
}
