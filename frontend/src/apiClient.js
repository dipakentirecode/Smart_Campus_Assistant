import { apiEndpoint } from "./apiConfig.js";

export async function requestApi(path, options = {}, { apiBase = "", fetchImpl = fetch } = {}) {
  const url = apiEndpoint(path, apiBase);
  let response;
  try {
    response = await fetchImpl(url, {
      credentials: "include",
      ...options,
      headers: {
        ...(typeof FormData !== "undefined" && options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers
      }
    });
  } catch (error) {
    if (error instanceof TypeError) {
      const endpoint = apiBase || "this site's /api route";
      throw new Error(`Can't reach the Campus Guide server at ${endpoint}. Check your connection and confirm the API is running and routed to /api.`);
    }
    throw error;
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new Error(`The Campus Guide server at ${apiBase || "this site"} did not return JSON for ${url}. Confirm that the deployment routes /api to the backend.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new Error("The Campus Guide server returned an invalid response. Check that /api routes reach the backend.");
    payload = {};
  }
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}
