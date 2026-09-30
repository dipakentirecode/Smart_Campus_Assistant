import { fileURLToPath } from "node:url";
import { ensureDevelopmentJwtSecret } from "../src/config/devEnv.js";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));

try {
  const generated = await ensureDevelopmentJwtSecret(envPath);
  if (generated) console.info("Created a local development JWT secret in the ignored .env file.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
