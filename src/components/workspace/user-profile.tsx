"use client";

import { useEffect, useRef, useState } from "react";
import { DEV_USER_ID } from "@/providers/workspace-provider";
import { UserContextDrawer } from "@/components/workspace/user-context-drawer";

// Placeholder until Okta lands
const STUB_USER = {
  name: "Dev User",
  role: "Trader",
  initials: "DU",
};

const MENU_ITEMS = [
  { id: "profile", label: "Profile" },
  { id: "settings", label: "Settings" },
  { id: "divider" },
  { id: "signout", label: "Sign out" },
] as const;

export function UserProfile() {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <>
      <div className="user-profile" ref={ref}>
        <button
          className={`user-profile__trigger${open ? " user-profile__trigger--open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`User menu for ${STUB_USER.name}`}
        >
          <span className="user-profile__avatar" aria-hidden="true">
            {STUB_USER.initials}
          </span>
          <span className="user-profile__name">{STUB_USER.name}</span>
        </button>

        {open && (
          <div className="user-profile__dropdown" role="menu">
            <div className="user-profile__dropdown-header">
              <span className="user-profile__dropdown-name">
                {STUB_USER.name}
              </span>
              <span className="user-profile__dropdown-meta">
                {STUB_USER.role} · {DEV_USER_ID}
              </span>
            </div>
            <div className="user-profile__dropdown-divider" />
            {MENU_ITEMS.map((item) => {
              if (item.id === "divider") {
                return (
                  <div
                    key="divider"
                    className="user-profile__dropdown-divider"
                  />
                );
              }
              return (
                <button
                  key={item.id}
                  className={`user-profile__menu-item${item.id === "signout" ? " user-profile__menu-item--danger" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    if (item.id === "profile") setProfileOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {"label" in item ? item.label : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <UserContextDrawer
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={STUB_USER}
      />
    </>
  );
}
