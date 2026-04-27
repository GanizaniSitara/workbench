const DEFAULT_API_BASE_URL = "";

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/$/, "");
  return `${baseUrl}${normalizedPath}`;
}
