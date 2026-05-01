const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";

export interface UserProfile {
  user_id: string;
  display_name: string;
  role: string;
  strategy: string;
  portfolio: string;
  preferences: string;
  focus: string;
  theme: string;
  density: string;
  updated_at: string | null;
}

export type ProfileFields = Omit<UserProfile, "user_id" | "updated_at">;

export async function fetchProfile(userId: string): Promise<UserProfile> {
  const response = await fetch(
    `${API_BASE}/api/profile/${encodeURIComponent(userId)}`,
  );
  if (!response.ok) throw new Error(`profile fetch failed: HTTP ${response.status}`);
  return response.json() as Promise<UserProfile>;
}

export async function saveProfile(
  userId: string,
  fields: Partial<ProfileFields>,
): Promise<UserProfile> {
  const response = await fetch(
    `${API_BASE}/api/profile/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
    },
  );
  if (!response.ok) throw new Error(`profile save failed: HTTP ${response.status}`);
  return response.json() as Promise<UserProfile>;
}
