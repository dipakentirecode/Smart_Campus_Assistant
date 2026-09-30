export function resolveApiBase(configuredBase = "") {
  const base = configuredBase.trim().replace(/\/+$/, "");
  if (!base) return "";
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("VITE_API_URL must be an absolute http(s) API origin, for example https://api.example.edu.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("VITE_API_URL must be an http(s) origin and must not contain credentials.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Set VITE_API_URL to the API origin only (without /api, a path, query, or fragment).");
  }
  return parsed.origin;
}

export function apiEndpoint(path, apiBase = "") {
  const route = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}/api${route}`;
}
