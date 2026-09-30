import { requestApi } from "./apiClient.js";
import { apiEndpoint, resolveApiBase } from "./apiConfig.js";

const API_BASE = resolveApiBase(import.meta.env.VITE_API_URL);

export async function api(path, options = {}) {
  return requestApi(path, options, { apiBase: API_BASE });
}

export function apiUrl(path) {
  return apiEndpoint(path, API_BASE);
}
