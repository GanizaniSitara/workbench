"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchProfile, saveProfile } from "@/lib/profile-api";
import { useWorkspace } from "@/providers/workspace-provider";
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

interface ProfileUser {
  name: string;
  role: string;
  initials: string;
}

interface UserContextDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user?: ProfileUser;
}

export function UserContextDrawer({
  isOpen,
  onClose,
  user,
}: UserContextDrawerProps) {
  const [fields, setFields] = useState<ManualContextFields>(EMPTY_FIELDS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});

  const {
    screens,
    activeScreenId,
    setActiveScreenId,
    addScreen,
    renameScreen,
    removeScreen,
  } = useWorkspace();

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
    <div className="user-context" role="dialog" aria-label="User profile">
      <button
        className="user-context__scrim"
        onClick={onClose}
        type="button"
        aria-label="Close user profile"
      />
      <aside className="user-context__panel">
        <div className="user-context__header">
          <div>
            <h2 className="user-context__title">Profile</h2>
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

        {user && (
          <div className="user-context__identity">
            <span className="user-context__identity-avatar" aria-hidden="true">
              {user.initials}
            </span>
            <div className="user-context__identity-text">
              <span className="user-context__identity-name">{user.name}</span>
              <span className="user-context__identity-role">{user.role}</span>
            </div>
          </div>
        )}

        <section
          className="user-context__layouts"
          aria-label="Layout management"
        >
          <h3 className="user-context__section-title">Layouts</h3>
          <ul className="user-context__layout-list">
            {screens.map((screen) => {
              const isActive = screen.id === activeScreenId;
              const value = draftNames[screen.id] ?? screen.name;
              return (
                <li
                  key={screen.id}
                  className={`user-context__layout-row${
                    isActive ? " user-context__layout-row--active" : ""
                  }`}
                  onClick={() => setActiveScreenId(screen.id)}
                  aria-current={isActive ? "true" : undefined}
                >
                  <input
                    className="user-context__layout-name"
                    value={value}
                    onFocus={() => setActiveScreenId(screen.id)}
                    onChange={(event) =>
                      setDraftNames((current) => ({
                        ...current,
                        [screen.id]: event.target.value,
                      }))
                    }
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== screen.name) {
                        renameScreen(screen.id, next);
                      }
                      setDraftNames((current) => {
                        const updated = { ...current };
                        delete updated[screen.id];
                        return updated;
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        (event.target as HTMLInputElement).blur();
                      } else if (event.key === "Escape") {
                        setDraftNames((current) => {
                          const updated = { ...current };
                          delete updated[screen.id];
                          return updated;
                        });
                        (event.target as HTMLInputElement).blur();
                      }
                    }}
                    aria-label={`Rename layout ${screen.name}`}
                  />
                  <button
                    type="button"
                    className="user-context__layout-remove"
                    disabled={screens.length <= 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeScreen(screen.id);
                    }}
                    aria-label={`Delete layout ${screen.name}`}
                  >
                    x
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="user-context__layout-add"
            onClick={addScreen}
          >
            + Add layout
          </button>
        </section>

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
