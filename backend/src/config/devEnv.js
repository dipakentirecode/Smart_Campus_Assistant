import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import dotenv from "dotenv";

const PLACEHOLDER = "replace-with-a-random-secret";

function isPlaceholder(secret) {
  return typeof secret === "string" && secret.includes(PLACEHOLDER);
}

function isUsableSecret(secret) {
  return typeof secret === "string"
    && secret.length >= 43
    && new Set(secret).size >= 16
    && !isPlaceholder(secret);
}

export async function ensureDevelopmentJwtSecret(envPath, processEnv = process.env) {
  let content = "";
  try {
    content = await readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const fileEnv = dotenv.parse(content);
  const runtime = processEnv.NODE_ENV ?? fileEnv.NODE_ENV ?? "development";
  if (runtime !== "development") {
    throw new Error("Automatic JWT secret generation is allowed only in development. Configure JWT_SECRET explicitly.");
  }

  if (Object.hasOwn(processEnv, "JWT_SECRET")) {
    if (isUsableSecret(processEnv.JWT_SECRET)) return false;
    throw new Error("Set a strong JWT_SECRET or remove the weak process-level JWT_SECRET so development can generate one.");
  }

  const fileSecret = fileEnv.JWT_SECRET;
  if (isUsableSecret(fileSecret)) return false;
  if (fileSecret && !isPlaceholder(fileSecret)) {
    throw new Error("JWT_SECRET must be at least 43 characters with sufficient variation. Use a cryptographically random secret.");
  }

  const generatedSecret = randomBytes(48).toString("base64url");
  let updatedContent;
  if (!content) {
    updatedContent = `NODE_ENV=development\nJWT_SECRET=${generatedSecret}\n`;
  } else if (fileSecret !== undefined) {
    let replaced = false;
    const lines = content.split(/\r?\n/).flatMap((line) => {
      if (!/^\s*(?:export\s+)?JWT_SECRET\s*=/.test(line)) return [line];
      if (replaced) return [];
      replaced = true;
      return [`JWT_SECRET=${generatedSecret}`];
    });
    updatedContent = lines.join("\n");
    if (!updatedContent.endsWith("\n")) updatedContent += "\n";
  } else {
    updatedContent = `${content.replace(/(?:\r?\n)*$/, "")}\nJWT_SECRET=${generatedSecret}\n`;
  }

  if (content) {
    await writeFile(envPath, updatedContent, { encoding: "utf8" });
  } else {
    await writeFile(envPath, updatedContent, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }

  return true;
}
