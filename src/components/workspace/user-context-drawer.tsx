"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CONTEXT_FIELD_LABELS,
  CONTEXT_FIELD_PLACEHOLDERS,
  CONTEXT_TOPICS,
  hydrateManualContextFields,
  loadUserContext,
  MEMORY_API,
  MEMORY_USER_ID,
  saveManualUserContext,
  type ContextFact,
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
  const [facts, setFacts] = useState<ContextFact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen || !MEMORY_API) return;

    setIsLoading(true);
    setError(null);
    loadUserContext(MEMORY_USER_ID)
      .then((loadedFacts) => {
        setFacts(loadedFacts);
        setFields(hydrateManualContextFields(loadedFacts));
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
      await saveManualUserContext(MEMORY_USER_ID, fields);
      const loadedFacts = await loadUserContext(MEMORY_USER_ID);
      setFacts(loadedFacts);
      setFields(hydrateManualContextFields(loadedFacts));
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
          {!MEMORY_API && (
            <div className="user-context__state">
              Memory API is not configured.
            </div>
          )}
          {MEMORY_API && isLoading && (
            <div className="user-context__state">Loading...</div>
          )}
          {MEMORY_API &&
            !isLoading &&
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

          {MEMORY_API && facts.length > 0 && (
            <section className="user-context__facts" aria-label="Stored facts">
              <h3 className="user-context__section-title">Stored Facts</h3>
              {facts.slice(0, 8).map((fact) => (
                <p className="user-context__fact" key={fact.id}>
                  {fact.text}
                </p>
              ))}
            </section>
          )}

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
              disabled={!MEMORY_API || isSaving || isLoading}
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
