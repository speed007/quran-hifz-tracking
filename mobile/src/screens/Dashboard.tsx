import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api, SessionDetail, Stats, User } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  LinkButton,
  Loading,
  ProgressBar,
  Screen,
  SectionTitle,
  StarsInline,
  StyledTextInput,
  Title,
  useTheme,
} from "../ui";
import { PickerField } from "../pickers";
import { partialText, rukuLabel, sectionLabel, sectionReference } from "../format";
import RatingEditor from "../components/RatingEditor";

function StatCard({ value, label }: { value: number | string; label: string }) {
  const { theme } = useTheme();
  return (
    <Card style={styles.statCard}>
      <Text style={[styles.statValue, { color: theme.primary }]}>{value}</Text>
      <Text style={{ color: theme.muted, fontSize: 12 }}>{label}</Text>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isStudent = user?.role === "user";
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [ticking, setTicking] = useState<number | null>(null);
  const [ratingFor, setRatingFor] = useState<number | null>(null);
  const [partialFor, setPartialFor] = useState<number | null>(null);
  const [partialFrom, setPartialFrom] = useState<number | null>(null);
  const [partialTo, setPartialTo] = useState<number | null>(null);
  const [partialNote, setPartialNote] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function reload() {
    setStats(await api.stats());
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (!user) return null;
  if (error) return <Screen><ErrorText>{error}</ErrorText></Screen>;
  if (!stats) return <Screen><Loading /></Screen>;

  const displayStudents = isStudent
    ? stats.students.filter((s) => s.id === user.student_id)
    : stats.students;
  const displaySessions = isStudent
    ? stats.recent_sessions.filter((s) => s.student_id === user.student_id)
    : stats.recent_sessions;
  const juzs = isStudent ? stats.juz_summary?.[user.student_id ?? -1] ?? [] : [];

  async function completeSession(
    s: SessionDetail,
    body: {
      completed: boolean;
      completion?: "full" | "partial";
      partial_from_ayah?: number;
      partial_to_ayah?: number;
      partial_note?: string;
    }
  ) {
    setTicking(s.id);
    try {
      await api.setSessionCompleted(s.id, body);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTicking(null);
    }
  }

  function openPartial(s: SessionDetail) {
    setPartialFor(s.id);
    setPartialFrom(s.from_ayah ?? 1);
    setPartialTo(s.to_ayah ?? s.from_ayah ?? 1);
    setPartialNote("");
  }

  async function submitPartial(s: SessionDetail) {
    if (partialFrom == null || partialTo == null || partialFrom > partialTo) {
      setError("Select a valid partial ayah range.");
      return;
    }
    if (!partialNote.trim()) {
      setError("A note is required when completing partially.");
      return;
    }
    await completeSession(s, {
      completed: true,
      completion: "partial",
      partial_from_ayah: partialFrom,
      partial_to_ayah: partialTo,
      partial_note: partialNote.trim(),
    });
    setPartialFor(null);
  }

  async function saveRating(id: number, rating: number | null, feedback: string | null) {
    try {
      await api.setSessionRating(id, { rating, feedback });
      await reload();
      setRatingFor(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function ayahOptions(s: SessionDetail) {
    if (s.from_ayah == null || s.to_ayah == null) return [];
    const opts = [];
    for (let n = s.from_ayah; n <= s.to_ayah; n++) {
      opts.push({ label: `Ayah ${n}`, value: n });
    }
    return opts;
  }

  const ratedByMe = isStudent
    ? stats.rated_sessions.filter((s) => s.student_id === user.student_id)
    : stats.rated_sessions;

  return (
    <Screen refreshing={refreshing} onRefresh={handleRefresh}>
      <Title>Welcome, {user.name}</Title>

      <View style={styles.statsRow}>
        <StatCard value={stats.total_sessions} label="Total sessions" />
        <StatCard value={stats.today_activity} label="Today" />
        <StatCard value={displayStudents.length} label={isStudent ? "You" : "Students"} />
      </View>

      <SectionTitle>Progress</SectionTitle>
      {displayStudents.map((student) => {
        const p = stats.progress[student.id];
        return (
          <Card key={student.id}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{student.name}</Text>
            <ProgressBar percent={p?.percent ?? 0} />
            <Text style={{ color: theme.text }}>
              {p?.memorised_pages ?? 0} of {p?.total_pages} pages ({p?.percent ?? 0}%) ·{" "}
              {p?.rukus_memorised ?? 0} of {p?.total_rukus} rukus
            </Text>
            {p?.current_surah && (
              <Text style={{ color: theme.muted }}>
                Now at {p.current_surah.name_en} (page {p.current_page})
              </Text>
            )}
          </Card>
        );
      })}

      {isStudent && juzs.length > 0 && (
        <>
          <SectionTitle>Juz progress</SectionTitle>
          {juzs.map((j) => (
            <Card key={j.juz}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Juz {j.juz} {j.complete ? "✓" : ""}
              </Text>
              <ProgressBar percent={(j.pages_memorised / j.total_pages) * 100} />
              <Text style={{ color: theme.text }}>
                {j.pages_memorised} of {j.total_pages} pages
              </Text>
              <Text style={{ color: theme.muted }}>
                {j.avg_rating != null
                  ? `${"★".repeat(Math.round(j.avg_rating))} ${j.avg_rating} / 5`
                  : "No ratings yet"}
                {j.duration_days != null && ` · took ${j.duration_days} day${j.duration_days === 1 ? "" : "s"}`}
              </Text>
            </Card>
          ))}
        </>
      )}

      {!isStudent && stats.rateable_sessions.length > 0 && (
        <>
          <SectionTitle>Ready to rate</SectionTitle>
          {stats.rateable_sessions.map((s) => (
            <Card key={s.id}>
              <View style={styles.rowSpace}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{s.student_name}</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{s.date}</Text>
              </View>
              <Text style={{ color: theme.text }}>
                {s.surah_name_en} · pages {s.from_page}–{s.to_page} · {sectionLabel(s)}
              </Text>
              {partialText(s) ? <Text style={{ color: theme.muted }}>{partialText(s)}</Text> : null}
              {ratingFor === s.id ? (
                <RatingEditor
                  rating={s.rating}
                  feedback={s.feedback}
                  onSave={(r, f) => saveRating(s.id, r, f)}
                  onCancel={() => setRatingFor(null)}
                />
              ) : (
                <LinkButton
                  title={s.rating != null ? "★ Edit rating" : "★ Rate"}
                  onPress={() => setRatingFor(s.id)}
                />
              )}
            </Card>
          ))}
        </>
      )}

      {isStudent && ratedByMe.length > 0 && (
        <>
          <SectionTitle>Ratings &amp; notes</SectionTitle>
          {ratedByMe.map((s) => (
            <Card key={s.id}>
              <View style={styles.rowSpace}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {sectionLabel(s)} · {s.surah_name_en}
                </Text>
              </View>
              <Text style={{ color: theme.muted }}>pages {s.from_page}–{s.to_page} · {s.date}</Text>
              <View style={styles.rowSpace}>
                {s.rating ? <StarsInline rating={s.rating} /> : <Text style={{ color: theme.muted }}>–</Text>}
              </View>
              <Text style={{ color: theme.text }}>{s.feedback || "No notes"}</Text>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Recent sessions</SectionTitle>
      {displaySessions.length === 0 ? (
        <EmptyState>No sessions yet.</EmptyState>
      ) : (
        displaySessions.map((s) => {
          const overdue = !s.completed && !!s.deadline && new Date(s.deadline) < new Date();
          return (
            <Card key={s.id} style={overdue ? { borderColor: theme.danger } : undefined}>
              <View style={styles.rowSpace}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {s.student_name}
                </Text>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    {s.date}
                    {s.deadline ? ` · due ${s.deadline}` : ""}
                  </Text>
                  {overdue && (
                    <Text style={[styles.overdueChip, { color: theme.danger, borderColor: theme.danger }]}>
                      Overdue
                    </Text>
                  )}
                </View>
              </View>
              <Text style={{ color: theme.text }}>
                {s.kind === "new" ? "Memorised" : "Revision"} · pages {s.from_page}–
                {s.to_page} · {sectionReference(s)} · {rukuLabel(s)}
              </Text>
              {s.note ? <Text style={{ color: theme.muted }}>Note: {s.note}</Text> : null}

              {isStudent ? (
                s.completed ? (
                  <View style={styles.statusRow}>
                    <Text style={{ color: s.completion === "partial" ? theme.gold : theme.success, fontWeight: "700" }}>
                      {s.completion === "partial" ? "Partial" : "✓ Full"}
                    </Text>
                    {s.completion === "partial" && partialText(s) ? (
                      <Text style={{ color: theme.muted }}>{partialText(s)}</Text>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <View style={styles.statusRow}>
                      <Button
                        title="Mark full"
                        onPress={() => completeSession(s, { completed: true, completion: "full" })}
                        loading={ticking === s.id}
                        style={{ flex: 1 }}
                      />
                      <Button
                        title="Partial…"
                        variant="secondary"
                        onPress={() => openPartial(s)}
                        style={{ flex: 1 }}
                      />
                    </View>
                    {partialFor === s.id && (
                      <View style={{ gap: 10 }}>
                        <Text style={{ color: theme.muted }}>
                          You were assigned Juz {s.juz} ayahs {s.from_ayah}–{s.to_ayah}. Select what
                          you actually did and explain why you couldn't finish.
                        </Text>
                        <PickerField
                          label="From ayah"
                          value={partialFrom}
                          options={ayahOptions(s)}
                          onChange={(v) => setPartialFrom(Number(v))}
                        />
                        <PickerField
                          label="To ayah"
                          value={partialTo}
                          options={ayahOptions(s)}
                          onChange={(v) => setPartialTo(Number(v))}
                        />
                        <Field label="Why didn't you finish the whole session? (required)">
                          <StyledTextInput
                            value={partialNote}
                            onChangeText={setPartialNote}
                            placeholder="e.g. I only had time for half the ayahs."
                            multiline
                            style={{ minHeight: 72, textAlignVertical: "top" }}
                          />
                        </Field>
                        <View style={styles.statusRow}>
                          <Button
                            title="Save partial"
                            onPress={() => submitPartial(s)}
                            loading={ticking === s.id}
                            disabled={!partialNote.trim()}
                            style={{ flex: 1 }}
                          />
                          <Button title="Cancel" variant="secondary" onPress={() => setPartialFor(null)} style={{ flex: 1 }} />
                        </View>
                      </View>
                    )}
                  </>
                )
              ) : (
                <View style={styles.statusRow}>
                  <Text
                    style={{
                      color: s.completed
                        ? s.completion === "partial"
                          ? theme.gold
                          : theme.success
                        : theme.muted,
                      fontWeight: "700",
                    }}
                  >
                    {s.completed
                      ? s.completion === "partial"
                        ? "Partial"
                        : "✓ Done"
                      : "Pending"}
                  </Text>
                  {s.completed &&
                    (ratingFor === s.id ? (
                      <RatingEditor
                        rating={s.rating}
                        feedback={s.feedback}
                        onSave={(r, f) => saveRating(s.id, r, f)}
                        onCancel={() => setRatingFor(null)}
                      />
                    ) : (
                      <LinkButton
                        title={s.rating != null ? "★ Edit" : "★ Rate"}
                        onPress={() => setRatingFor(s.id)}
                      />
                    ))}
                </View>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 26,
    fontWeight: "800",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  rowSpace: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  overdueChip: {
    fontSize: 10,
    fontWeight: "800",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: "hidden",
  },
});
