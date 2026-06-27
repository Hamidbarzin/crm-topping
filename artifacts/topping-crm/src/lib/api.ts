const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function getApiUrl(path: string) {
  return `${BASE}/api${path}`;
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("crm_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
