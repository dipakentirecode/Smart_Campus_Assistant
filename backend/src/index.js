import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { localStore } from "./data/localStore.js";

try {
  await connectDatabase();
  if (env.DATA_MODE === "local") await localStore.ensureDemoFaqs();
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}
if (env.DATA_MODE === "local") {
  console.info(
    "LOCAL DEVELOPMENT MODE: JSON data in .local-dev/data.json, keyword retrieval, excerpt-only answers, and clearly labeled sample FAQs. " +
    "No MongoDB, ChromaDB, or AI provider is used. This local data is not backed up or suitable for production."
  );
}
const server = app.listen(env.PORT, env.HOST, () => {
  console.info(
    `API listening on ${env.HOST}:${env.PORT} ` +
    `(NODE_ENV=${env.NODE_ENV}, DATA_MODE=${env.DATA_MODE}, CLIENT_ORIGIN=${env.CLIENT_ORIGIN})`
  );
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Cannot start API: ${env.HOST}:${env.PORT} is already in use. Set PORT to an available port.`);
  } else {
    console.error(`Cannot start API on ${env.HOST}:${env.PORT}: ${error.message}`);
  }
  process.exit(1);
});

async function shutdown(signal) {
  console.info(`Received ${signal}; shutting down`);
  server.close(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
