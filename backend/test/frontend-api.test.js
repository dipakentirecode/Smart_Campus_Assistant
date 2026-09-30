import test from "node:test";
import assert from "node:assert/strict";
import { apiEndpoint, resolveApiBase } from "../../frontend/src/apiConfig.js";
import { requestApi } from "../../frontend/src/apiClient.js";

test("uses same-origin API paths when no deployment API origin is configured", () => {
  const base = resolveApiBase("");
  assert.equal(base, "");
  assert.equal(apiEndpoint("/auth/login", base), "/api/auth/login");
  assert.equal(apiEndpoint("health", base), "/api/health");
});

test("normalizes an explicitly configured API origin", () => {
  const base = resolveApiBase("https://api.example.edu/");
  assert.equal(base, "https://api.example.edu");
  assert.equal(apiEndpoint("/auth/login", base), "https://api.example.edu/api/auth/login");
});

test("rejects API URLs with paths or embedded credentials", () => {
  assert.throws(() => resolveApiBase("https://api.example.edu/api"), /origin only/);
  assert.throws(() => resolveApiBase("https://user:pass@api.example.edu"), /must not contain credentials/);
  assert.throws(() => resolveApiBase("ftp://api.example.edu"), /http\(s\) origin/);
});

test("sends cookies and JSON content type and returns API errors", async () => {
  let observed;
  const result = await requestApi("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "student@example.edu" })
  }, {
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify({ error: "Email or password is incorrect." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
  }).catch((error) => error);

  assert.equal(observed.url, "/api/auth/login");
  assert.equal(observed.options.credentials, "include");
  assert.equal(observed.options.headers["Content-Type"], "application/json");
  assert.equal(result.message, "Email or password is incorrect.");
});

test("reports a reachable endpoint configuration hint when fetch cannot connect", async () => {
  await assert.rejects(requestApi("/auth/login", {}, {
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); }
  }), /Can't reach the Campus Guide server at this site's \/api route/);
});

test("treats successful empty responses as null and rejects successful non-JSON responses", async () => {
  assert.equal(await requestApi("/auth/logout", {}, {
    fetchImpl: async () => new Response(null, { status: 204 })
  }), null);

  await assert.rejects(requestApi("/auth/login", {}, {
    fetchImpl: async () => new Response("<html>Not the API</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
    })
  }), /did not return JSON.*Confirm that the deployment routes \/api to the backend/);
});
