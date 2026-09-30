import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

try {
  await connectDatabase();
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}
if (env.DATA_MODE === "local") {
  console.info(
    "LOCAL DEVELOPMENT MODE: JSON data in .local-dev/data.json, keyword retrieval, and excerpt-only answers. " +
    "No MongoDB, ChromaDB, or AI provider is used. This local data is not backed up or suitable for production."
  );
}
const server = app.listen(env.PORT, () => console.info(`API listening on http://localhost:${env.PORT}`));

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
