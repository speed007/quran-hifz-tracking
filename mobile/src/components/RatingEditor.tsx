import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, StyledTextInput, useTheme } from "../ui";

export default function RatingEditor({
  rating,
  feedback,
  onSave,
  onCancel,
}: {
  rating: number | null;
  feedback: string | null;
  onSave: (rating: number | null, feedback: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const [draftRating, setDraftRating] = useState(rating ?? 0);
  const [draftFeedback, setDraftFeedback] = useState(feedback ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(draftRating > 0 ? draftRating : null, draftFeedback.trim() || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Text
            key={n}
            onPress={() => setDraftRating(draftRating === n ? 0 : n)}
            style={{
              fontSize: 30,
              color: n <= draftRating ? theme.gold : theme.barBg,
            }}
          >
            ★
          </Text>
        ))}
      </View>
      <StyledTextInput
        value={draftFeedback}
        onChangeText={setDraftFeedback}
        placeholder="Feedback for the student…"
        maxLength={1000}
        multiline
        style={{ minHeight: 72, textAlignVertical: "top" }}
      />
      <View style={styles.actions}>
        <Button title="Save" onPress={save} loading={saving} style={{ flex: 1 }} />
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stars: {
    flexDirection: "row",
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
});
