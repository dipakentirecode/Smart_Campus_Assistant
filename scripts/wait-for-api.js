import { env } from "../backend/src/config/env.js";

const healthUrl = `http://127.0.0.1:${env.PORT}/api/health`;
const deadline = Date.now() + 45_000;
let lastError = "API health check did not return HTTP 200.";

console.info(`[web] Waiting for backend health at ${healthUrl} before starting Vite.`);

while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      const payload = await response.json();
      if (payload.status === "ok") {
        console.info("[web] Backend is ready.");
        process.exit(0);
      }
      lastError = "Health endpoint returned an unexpected response.";
    } else {
      lastError = `Health endpoint returned HTTP ${response.status}.`;
    }
  } catch (error) {
    lastError = error.message;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error(
  `[web] Backend did not become ready at ${healthUrl} within 45 seconds: ${lastError} ` +
  "Check the [api] startup logs, PORT, and DATA_MODE before retrying."
);
process.exit(1);
