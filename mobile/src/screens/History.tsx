import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, History, SessionDetail, Student, User } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  LinkButton,
  Loading,
  ProgressBar,
  Screen,
  SectionTitle,
  Segmented,
  StarsInline,
  Title,
  useTheme,
} from "../ui";
import { PickerField } from "../pickers";
import { monthLabel, partialText, rukuLabel, sectionLabel } from "../format";
import RatingEditor from "../components/RatingEditor";

type Breakdown = "month" | "juz" | "stars";

function monthOptions(): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = [];
  const now = new Date();
  const end = now.getFullYear() * 12 + now.getMonth();
  for (let n = end; n >= 2020 * 12; n--) {
    const y = Math.floor(n / 12);
    const m = n % 12;
    const month = `${y}-${String(m + 1).padStart(2, "0")}`;
    opts.push({ label: monthLabel(month), value: month });
  }
  return opts;
}

function StatCard({ value, label }: { value: number | string; label: string }) {
  const { theme } = useTheme();
  return (
    <Card style={styles.statCard}>
      <Text style={[styles.statValue, { color: theme.primary }]}>{value}</Text>
      <Text style={{ color: theme.muted, fontSize: 12 }}>{label}</Text>
    </Card>
  );
}

export default function HistoryPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isStudent = user?.role === "user";
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(isStudent ? user?.student_id ?? null : null);
  const [kind, setKind] = useState<"" | "new" | "revision">("");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [breakdown, setBreakdown] = useState<Breakdown>("month");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [juzFilter, setJuzFilter] = useState<number | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [ratingFor, setRatingFor] = useState<number | null>(null);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("hifz-history-filters");
        if (raw) {
          const f = JSON.parse(raw) as Partial<{
            kind: "" | "new" | "revision";
            fromMonth: string;
            toMonth: string;
            juzFilter: number | null;
            ratingFilter: number | null;
            breakdown: Breakdown;
          }>;
          if (f) {
            if (f.kind) setKind(f.kind);
            if (f.fromMonth) setFromMonth(f.fromMonth);
            if (f.toMonth) setToMonth(f.toMonth);
            if (f.juzFilter != null) setJuzFilter(f.juzFilter);
            if (f.ratingFilter != null) setRatingFilter(f.ratingFilter);
            if (f.breakdown) setBreakdown(f.breakdown);
          }
        }
      } catch {
        // ignore malformed stored filters
      }
      setFiltersReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    AsyncStorage.setItem(
      "hifz-history-filters",
      JSON.stringify({ kind, fromMonth, toMonth, juzFilter, ratingFilter, breakdown })
    ).catch(() => {});
  }, [filtersReady, kind, fromMonth, toMonth, juzFilter, ratingFilter, breakdown]);

  useEffect(() => {
    if (!isStudent) {
      api
        .students()
        .then((list) => {
          setStudents(list);
          if (list.length > 0) setStudentId((prev) => prev ?? list[0].id);
        })
        .catch((e) => setError((e as Error).message));
    }
  }, [isStudent]);

  useEffect(() => {
    if (!filtersReady) return;
    if (studentId == null && !isStudent) {
      setData(null);
      return;
    }
    setSelectedGroup(null);
    api
      .history({
        student_id: isStudent ? undefined : studentId ?? undefined,
        kind: kind || undefined,
        from_month: fromMonth || undefined,
        to_month: toMonth || undefined,
        juz: juzFilter ?? undefined,
        rating: ratingFilter ?? undefined,
      })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [filtersReady, isStudent, studentId, kind, fromMonth, toMonth, juzFilter, ratingFilter]);

  if (error) return <Screen><ErrorText>{error}</ErrorText></Screen>;

  function groupKey(s: SessionDetail): string {
    switch (breakdown) {
      case "juz":
        return `j:${s.juz ?? s.juz_from ?? ""}`;
      case "stars":
        return `s:${s.rating ?? "unrated"}`;
      default:
        return `m:${(s.completed_at ?? s.date).slice(0, 7)}`;
    }
  }

  const visibleSessions = selectedGroup
    ? (data?.sessions ?? []).filter((s) => groupKey(s) === selectedGroup)
    : data?.sessions ?? [];

  function groupLabel(): string {
    if (!selectedGroup) return "All sessions";
    switch (breakdown) {
      case "juz":
        return `Sessions in Juz ${selectedGroup.slice(2)}`;
      case "stars":
        return selectedGroup === "s:unrated"
          ? "Sessions not yet rated"
          : `Sessions rated ${selectedGroup.slice(2)}★`;
      default:
        return `Sessions in ${monthLabel(selectedGroup.slice(2))}`;
    }
  }

  async function saveRating(id: number, rating: number | null, feedback: string | null) {
    try {
      await api.setSessionRating(id, { rating, feedback });
      setData(
        await api.history({
          student_id: isStudent ? undefined : studentId ?? undefined,
          kind: kind || undefined,
          from_month: fromMonth || undefined,
          to_month: toMonth || undefined,
          juz: juzFilter ?? undefined,
          rating: ratingFilter ?? undefined,
        })
      );
      setRatingFor(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Screen>
      <Title>History</Title>

      <Card>
        {!isStudent && (
          <View style={styles.filterRow}>
            <PickerField
              label="Student"
              value={studentId}
              options={students.map((s) => ({ label: s.name, value: s.id }))}
              placeholder="Choose…"
              style={{ flex: 1 }}
              onChange={(v) => setStudentId(Number(v))}
            />
            <PickerField
              label="Type"
              value={kind}
              options={[
                { label: "All", value: "" },
                { label: "Memorised", value: "new" },
                { label: "Revision", value: "revision" },
              ]}
              style={{ flex: 1 }}
              onChange={(v) => setKind(v as "" | "new" | "revision")}
            />
          </View>
        )}
        {isStudent && (
          <PickerField
            label="Type"
            value={kind}
            options={[
              { label: "All", value: "" },
              { label: "Memorised", value: "new" },
              { label: "Revision", value: "revision" },
            ]}
            onChange={(v) => setKind(v as "" | "new" | "revision")}
          />
        )}
        <View style={styles.filterRow}>
          <PickerField
            label="From month"
            value={fromMonth || "any"}
            options={[{ label: "Any", value: "any" }, ...monthOptions()]}
            style={{ flex: 1 }}
            onChange={(v) => setFromMonth(v === "any" ? "" : String(v))}
          />
          <PickerField
            label="To month"
            value={toMonth || "any"}
            options={[{ label: "Any", value: "any" }, ...monthOptions()]}
            style={{ flex: 1 }}
            onChange={(v) => setToMonth(v === "any" ? "" : String(v))}
          />
        </View>
        <View style={styles.filterRow}>
          <PickerField
            label="Juz"
            value={juzFilter}
            options={[
              { label: "Any", value: "" },
              ...Array.from({ length: 30 }, (_, i) => i + 1).map((n) => ({
                label: `Juz ${n}`,
                value: n,
              })),
            ]}
            placeholder="Any"
            style={{ flex: 1 }}
            onChange={(v) => setJuzFilter(v === "" ? null : Number(v))}
          />
          <PickerField
            label="Stars"
            value={ratingFilter}
            options={[
              { label: "Any", value: "" },
              { label: "Not rated", value: -1 },
              { label: "1★", value: 1 },
              { label: "2★", value: 2 },
              { label: "3★", value: 3 },
              { label: "4★", value: 4 },
              { label: "5★", value: 5 },
            ]}
            placeholder="Any"
            style={{ flex: 1 }}
            onChange={(v) => setRatingFilter(v === "" ? null : Number(v))}
          />
        </View>
        {(kind !== "" || juzFilter != null || ratingFilter != null || fromMonth || toMonth) && (
          <LinkButton
            title="Clear filters"
            onPress={() => {
              setKind("");
              setJuzFilter(null);
              setRatingFilter(null);
              setFromMonth("");
              setToMonth("");
            }}
          />
        )}
      </Card>

      <Segmented
        options={[
          { label: "Month", value: "month" },
          { label: "Juz", value: "juz" },
          { label: "Stars", value: "stars" },
        ]}
        value={breakdown}
        onChange={(b) => {
          setBreakdown(b);
          setSelectedGroup(null);
        }}
      />

      {!data && !error && <Loading />}

      {data && (
        <>
          {data.summary.first_session && (
            <Text style={{ color: theme.muted }}>
              {data.summary.first_session} → {data.summary.last_session}
            </Text>
          )}
          <View style={styles.statsGrid}>
            <StatCard value={data.summary.total_sessions} label="Sessions" />
            <StatCard value={data.summary.completed_sessions} label="Completed" />
            <StatCard value={data.summary.total_stars} label="Stars" />
            <StatCard value={data.summary.avg_rating != null ? data.summary.avg_rating : "–"} label="Average" />
            <StatCard value={data.summary.pages_memorised} label="Pages" />
            <StatCard value={data.summary.ayahs_memorised} label="Ayahs" />
            <StatCard value={data.summary.juzs_completed} label="Juzs" />
          </View>

          {breakdown === "month" &&
            (data.by_month.length === 0 ? (
              <EmptyState>No sessions match these filters.</EmptyState>
            ) : (
              <>
                <SectionTitle>Months — tap a row to drill down</SectionTitle>
                {data.by_month.map((m) => {
                  const key = `m:${m.month}`;
                  const active = selectedGroup === key;
                  return (
                    <Card
                      key={m.month}
                      style={active ? { borderColor: theme.primary } : undefined}
                    >
                      <PressableRow
                        onPress={() => setSelectedGroup(active ? null : key)}
                        title={monthLabel(m.month)}
                        subtitle={`${m.sessions} sessions · ${m.pages} pages · ${m.ayahs} ayahs · ${m.stars}★`}
                        extra={m.avg_rating != null ? `${m.avg_rating}/5` : "–"}
                      />
                    </Card>
                  );
                })}
              </>
            ))}

          {breakdown === "juz" &&
            (data.by_juz.length === 0 ? (
              <EmptyState>No sessions match these filters.</EmptyState>
            ) : (
              <>
                <SectionTitle>Juzs — tap a row to drill down</SectionTitle>
                {data.by_juz.map((j) => {
                  const key = `j:${j.juz}`;
                  const active = selectedGroup === key;
                  return (
                    <Card key={j.juz} style={active ? { borderColor: theme.primary } : undefined}>
                      <PressableRow
                        onPress={() => setSelectedGroup(active ? null : key)}
                        title={`Juz ${j.juz} ${j.complete ? "✓" : ""}`}
                        subtitle={`${j.pages_memorised} of ${j.total_pages} pages · ${j.sessions} sessions · ${j.rated_sessions} rated`}
                        extra={
                          j.avg_rating != null
                            ? `${j.avg_rating}/5${j.duration_days != null ? ` · ${j.duration_days}d` : ""}`
                            : "–"
                        }
                      />
                      <ProgressBar percent={j.percent} />
                    </Card>
                  );
                })}
              </>
            ))}

          {breakdown === "stars" &&
            (data.by_stars.length === 0 ? (
              <EmptyState>No sessions match these filters.</EmptyState>
            ) : (
              <>
                <SectionTitle>Stars — tap a row to drill down</SectionTitle>
                {data.by_stars.map((b) => {
                  const key = b.rating != null ? `s:${b.rating}` : "s:unrated";
                  const active = selectedGroup === key;
                  return (
                    <Card key={key} style={active ? { borderColor: theme.primary } : undefined}>
                      <PressableRow
                        onPress={() => setSelectedGroup(active ? null : key)}
                        title={b.rating != null ? `${"★".repeat(b.rating)}` : "Not rated"}
                        subtitle={`${b.sessions} sessions · ${b.pages} pages · ${b.ayahs} ayahs`}
                      />
                    </Card>
                  );
                })}
              </>
            ))}

          <SectionTitle>{groupLabel()}</SectionTitle>
          {visibleSessions.length === 0 ? (
            <EmptyState>No sessions to show.</EmptyState>
          ) : (
            visibleSessions.map((s) => (
              <Card key={s.id}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {s.completed_at ? s.completed_at.slice(0, 10) : s.date}
                  {!isStudent && s.student_name ? ` · ${s.student_name}` : ""}
                </Text>
                <Text style={{ color: theme.text }}>
                  {s.kind === "new" ? "Memorised" : "Revision"} · {sectionLabel(s)} · {rukuLabel(s)}
                </Text>
                <View style={styles.rowSpace}>
                  {s.rating ? (
                    <View style={styles.rowSpace}>
                      <StarsInline rating={s.rating} />
                      <Text style={{ color: theme.muted }}>{s.rating}/5</Text>
                    </View>
                  ) : (
                    <Text style={{ color: theme.muted }}>–</Text>
                  )}
                  {!isStudent && (
                    <LinkButton
                      title={s.rating != null ? "★ Edit" : "★ Rate"}
                      onPress={() => setRatingFor(ratingFor === s.id ? null : s.id)}
                    />
                  )}
                </View>
                <Text style={{ color: theme.text }}>
                  {s.completion === "partial"
                    ? partialText(s)
                    : s.feedback || <Text style={{ color: theme.muted }}>No notes</Text>}
                </Text>
                {!isStudent && ratingFor === s.id && (
                  <RatingEditor
                    rating={s.rating}
                    feedback={s.feedback}
                    onSave={(r, f) => saveRating(s.id, r, f)}
                    onCancel={() => setRatingFor(null)}
                  />
                )}
              </Card>
            ))
          )}

          {breakdown === "month" && data.by_month.length > 0 && (
            <>
              <SectionTitle>Pages per month</SectionTitle>
              <Card>
                <View style={styles.chart}>
                  {data.by_month.map((m) => {
                    const max = Math.max(...data.by_month.map((x) => x.pages));
                    const h = max ? Math.max(Math.round((m.pages / max) * 100), 6) : 6;
                    return (
                      <View key={m.month} style={styles.chartCol}>
                        <View style={[styles.chartBar, { height: `${h}%`, backgroundColor: theme.primary }]} />
                        <Text style={{ color: theme.muted, fontSize: 10 }}>{monthLabel(m.month).slice(0, 3)}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function PressableRow({
  onPress,
  title,
  subtitle,
  extra,
}: {
  onPress: () => void;
  title: string;
  subtitle?: string;
  extra?: string;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} style={styles.rowSpace}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        {subtitle ? <Text style={{ color: theme.muted, fontSize: 12 }}>{subtitle}</Text> : null}
      </View>
      {extra ? <Text style={{ color: theme.muted, fontSize: 12 }}>{extra}</Text> : null}
      <Text style={{ color: theme.primary, fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flexBasis: "30%",
    flexGrow: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  rowSpace: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    height: 120,
  },
  chartCol: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  chartBar: {
    width: "70%",
    maxWidth: 30,
    borderRadius: 4,
    minHeight: 4,
  },
});
