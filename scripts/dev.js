import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import concurrently from "concurrently";
import { env } from "../backend/src/config/env.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const mongoUri = env.MONGODB_URI;
const chromaUrl = env.CHROMA_URL;
const mongoAddress = getMongoAddress(mongoUri);
const chromaAddress = new URL(chromaUrl);
const localMongo = mongoAddress && isLocalHost(mongoAddress.host);
const localChroma = isLocalHost(chromaAddress.hostname);

function isLocalHost(host) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase());
}

function getMongoAddress(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "mongodb:") return null;
    return { host: parsed.hostname, port: Number(parsed.port || 27017) };
  } catch {
    return null;
  }
}

function canReachMongo(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (reachable) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function canReachChroma(baseUrl) {
  for (const path of ["/api/v1/heartbeat", "/api/v2/heartbeat"]) {
    try {
      const response = await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(1200) });
      if (response.ok) return true;
    } catch {
      // Try the next known Chroma heartbeat endpoint.
    }
  }
  return false;
}

async function getMissingLocalServices() {
  const missing = [];
  if (localMongo && !await canReachMongo(mongoAddress.host, mongoAddress.port)) missing.push("mongodb");
  if (localChroma && !await canReachChroma(chromaUrl)) missing.push("chroma");
  return missing;
}

function ensureDockerCompose() {
  const result = spawnSync("docker", ["compose", "version"], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
    stdio: "ignore"
  });
  return result.status === 0;
}

function startComposeServices(services) {
  console.info(`Starting local data services with Docker Compose: ${services.join(", ")}`);
  const result = spawnSync("docker", ["compose", "up", "-d", ...services], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ...(mongoAddress ? { MONGODB_PORT: String(mongoAddress.port) } : {}),
      CHROMA_PORT: String(chromaAddress.port || 8000)
    }
  });
  return result.status === 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLocalServices(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const missing = await getMissingLocalServices();
    if (!missing.length) return true;
    await delay(1500);
  }
  return false;
}

function printPrerequisiteHelp(missing, dockerAvailable) {
  console.error(`\nLocal development cannot start: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not reachable.`);
  if (!dockerAvailable) {
    console.error("Docker Compose is not installed or Docker Desktop is not available in PATH.");
    console.error("Install and start Docker Desktop, then run these commands in PowerShell from the project folder:");
    console.error("  docker compose up -d mongodb chroma");
    console.error("  docker compose ps");
    console.error("  npm run dev");
  } else {
    console.error("Docker Compose could not start the required services or they did not become ready.");
    console.error("In PowerShell from the project folder, inspect them with:");
    console.error("  docker compose ps");
    console.error("  docker compose logs mongodb chroma");
    console.error("Then retry: npm run dev");
  }
  console.error("Alternatively, start MongoDB and ChromaDB yourself at the URLs configured in .env.");
}

async function main() {
  if (env.DATA_MODE === "local") {
    console.info("Starting Docker-free local development mode. Data is saved under .local-dev/.");
    await startApplications();
    return;
  }

  const missing = await getMissingLocalServices();
  if (missing.length) {
    const dockerAvailable = ensureDockerCompose();
    if (!dockerAvailable || !startComposeServices(missing)) {
      printPrerequisiteHelp(missing, dockerAvailable);
      process.exitCode = 1;
      return;
    }
    if (!await waitForLocalServices()) {
      printPrerequisiteHelp(await getMissingLocalServices(), true);
      process.exitCode = 1;
      return;
    }
    console.info("MongoDB and ChromaDB are ready.");
  }

  await startApplications();
}

async function startApplications() {
  const { result } = concurrently([
    {
      command: "npm run dev --workspace backend",
      name: "api",
      prefixColor: "blue"
    },
    {
      command: "node scripts/wait-for-api.js && npm run dev --workspace frontend",
      name: "web",
      prefixColor: "green"
    }
  ], { killOthersOn: ["failure"] });

  try {
    await result;
  } catch {
    process.exitCode = 1;
  }
}

await main();
