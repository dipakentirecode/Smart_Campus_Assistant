import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { ensureDevelopmentJwtSecret } from "../src/config/devEnv.js";

async function withEnvFile(run) {
  const directory = await mkdtemp(join(tmpdir(), "campus-dev-env-"));
  const envPath = join(directory, ".env");
  try {
    await run(envPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("creates an ignored-development-config secret with cryptographic strength", async () => {
  await withEnvFile(async (envPath) => {
    assert.equal(await ensureDevelopmentJwtSecret(envPath, {}), true);
    const values = dotenv.parse(await readFile(envPath, "utf8"));
    assert.equal(values.NODE_ENV, "development");
    assert.ok(values.JWT_SECRET.length >= 43);
    assert.ok(new Set(values.JWT_SECRET).size >= 16);
  });
});

test("adds a missing secret without replacing other local settings", async () => {
  await withEnvFile(async (envPath) => {
    await writeFile(envPath, "PORT=4010\nOPENAI_API_KEY=local-key\n", "utf8");
    assert.equal(await ensureDevelopmentJwtSecret(envPath, {}), true);
    const values = dotenv.parse(await readFile(envPath, "utf8"));
    assert.equal(values.PORT, "4010");
    assert.equal(values.OPENAI_API_KEY, "local-key");
    assert.ok(values.JWT_SECRET.length >= 43);
  });
});

test("replaces only the example placeholder", async () => {
  await withEnvFile(async (envPath) => {
    await writeFile(envPath, "NODE_ENV=development\nJWT_SECRET=replace-with-a-random-secret-at-least-32-characters\nPORT=4000\n", "utf8");
    assert.equal(await ensureDevelopmentJwtSecret(envPath, {}), true);
    const contents = await readFile(envPath, "utf8");
    const values = dotenv.parse(contents);
    assert.equal(values.PORT, "4000");
    assert.ok(values.JWT_SECRET.length >= 43);
    assert.equal((contents.match(/^JWT_SECRET=/gm) ?? []).length, 1);
  });
});

test("replaces an explicitly blank file setting without adding duplicate keys", async () => {
  await withEnvFile(async (envPath) => {
    await writeFile(envPath, "NODE_ENV=development\nJWT_SECRET=\nPORT=4000\n", "utf8");
    assert.equal(await ensureDevelopmentJwtSecret(envPath, {}), true);
    const contents = await readFile(envPath, "utf8");
    const values = dotenv.parse(contents);
    assert.equal(values.PORT, "4000");
    assert.ok(values.JWT_SECRET.length >= 43);
    assert.equal((contents.match(/^JWT_SECRET=/gm) ?? []).length, 1);
  });
});

test("does not generate or change secrets outside development", async () => {
  await withEnvFile(async (envPath) => {
    const contents = "NODE_ENV=production\n";
    await writeFile(envPath, contents, "utf8");
    await assert.rejects(ensureDevelopmentJwtSecret(envPath, {}), /only in development/);
    assert.equal(await readFile(envPath, "utf8"), contents);
  });
});

test("does not modify .env when a weak process-level secret overrides it", async () => {
  await withEnvFile(async (envPath) => {
    const contents = "NODE_ENV=development\nPORT=4000\n";
    await writeFile(envPath, contents, "utf8");
    await assert.rejects(
      ensureDevelopmentJwtSecret(envPath, { NODE_ENV: "development", JWT_SECRET: "" }),
      /process-level JWT_SECRET/
    );
    assert.equal(await readFile(envPath, "utf8"), contents);
  });
});

test("rejects short custom secrets rather than silently rotating them", async () => {
  await withEnvFile(async (envPath) => {
    const contents = `NODE_ENV=development\nJWT_SECRET=${"custom-secret-".repeat(2)}\n`;
    await writeFile(envPath, contents, "utf8");
    await assert.rejects(ensureDevelopmentJwtSecret(envPath, {}), /at least 43 characters/);
    assert.equal(await readFile(envPath, "utf8"), contents);
  });
});

test("leaves a valid development secret unchanged", async () => {
  await withEnvFile(async (envPath) => {
    const contents = `NODE_ENV=development\nJWT_SECRET=${"aB3dE5gH7jK9mN2pQ4rS6tU8vW0xY1zA2bC3dE4fG5hJ"}\n`;
    await writeFile(envPath, contents, "utf8");
    assert.equal(await ensureDevelopmentJwtSecret(envPath, {}), false);
    assert.equal(await readFile(envPath, "utf8"), contents);
  });
});

test("production environment validation rejects weak secrets", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "import('./src/config/env.js')"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production", DATA_MODE: "local", JWT_SECRET: "aB3dE5gH7jK9mN2pQ4rS6tU8vW0xY1zA2bC3dE4fG5hJ" }
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATA_MODE/);
  assert.match(result.stderr, /Production requires DATA_MODE=services/);
});
