"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchProfile, saveProfile } from "@/lib/profile-api";
import {
  CONTEXT_FIELD_LABELS,
  CONTEXT_FIELD_PLACEHOLDERS,
  CONTEXT_TOPICS,
  MEMORY_API,
  MEMORY_USER_ID,
  saveManualUserContext,
  type ContextTopic,
  type ManualContextFields,
} from "@/lib/user-context";

const EMPTY_FIELDS = CONTEXT_TOPICS.reduce((fields, topic) => {
  fields[topic] = "";
  return fields;
}, {} as ManualContextFields);

interface UserContextDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserContextDrawer({ isOpen, onClose }: UserContextDrawerProps) {
  const [fields, setFields] = useState<ManualContextFields>(EMPTY_FIELDS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);
    fetchProfile(MEMORY_USER_ID)
      .then((profile) => {
        setFields({
          role: profile.role,
          strategy: profile.strategy,
          portfolio: profile.portfolio,
          preferences: profile.preferences,
          focus: profile.focus,
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  function updateField(topic: ContextTopic, value: string) {
    setFields((current) => ({ ...current, [topic]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaved(false);

    try {
      await saveProfile(MEMORY_USER_ID, fields);
      if (MEMORY_API) {
        saveManualUserContext(MEMORY_USER_ID, fields).catch(() => {});
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="user-context" role="dialog" aria-label="User context">
      <button
        className="user-context__scrim"
        onClick={onClose}
        type="button"
        aria-label="Close user context"
      />
      <aside className="user-context__panel">
        <div className="user-context__header">
          <div>
            <h2 className="user-context__title">Context</h2>
            <p className="user-context__subtitle">{MEMORY_USER_ID}</p>
          </div>
          <button
            className="user-context__close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <form className="user-context__content" onSubmit={handleSubmit}>
          {isLoading && (
            <div className="user-context__state">Loading...</div>
          )}
          {!isLoading &&
            CONTEXT_TOPICS.map((topic) => (
              <label className="user-context__field" key={topic}>
                <span className="user-context__label">
                  {CONTEXT_FIELD_LABELS[topic]}
                </span>
                <textarea
                  className="user-context__textarea"
                  disabled={isSaving}
                  onChange={(event) => updateField(topic, event.target.value)}
                  placeholder={CONTEXT_FIELD_PLACEHOLDERS[topic]}
                  rows={3}
                  value={fields[topic]}
                />
              </label>
            ))}

          {error && <div className="user-context__error">{error}</div>}
          {saved && <div className="user-context__saved">Saved</div>}

          <div className="user-context__actions">
            <button
              className="user-context__btn"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="user-context__btn user-context__btn--primary"
              disabled={isSaving || isLoading}
              type="submit"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
