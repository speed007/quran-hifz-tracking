import { useState } from "react";

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
  const [draftRating, setDraftRating] = useState(rating ?? 0);
  const [draftFeedback, setDraftFeedback] = useState(feedback ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(
        draftRating > 0 ? draftRating : null,
        draftFeedback.trim() ? draftFeedback.trim() : null
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rating-editor">
      <div className="stars" role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star ${n <= draftRating ? "on" : ""}`}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setDraftRating(draftRating === n ? 0 : n)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={draftFeedback}
        maxLength={1000}
        placeholder="Feedback for the student…"
        onChange={(e) => setDraftFeedback(e.target.value)}
      />
      <div className="row editor-actions">
        <button onClick={save} disabled={saving}>
          Save
        </button>
        <button className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
