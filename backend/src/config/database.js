import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  if (env.DATA_MODE === "local") return;
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    if (error.name === "MongooseServerSelectionError") {
      throw new Error(
        `Cannot connect to MongoDB at ${describeMongoTarget(env.MONGODB_URI)}. Start MongoDB and confirm MONGODB_URI in .env. For local development, run "docker compose up -d mongodb" from the project folder.`
      );
    }
    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
  console.info("Connected to MongoDB");
}

function describeMongoTarget(uri) {
  try {
    const target = new URL(uri);
    const endpoint = target.port ? `${target.hostname}:${target.port}` : target.hostname;
    const database = target.pathname.replace(/^\//, "");
    return database ? `${endpoint}/${database}` : endpoint;
  } catch {
    return "the configured MongoDB server";
  }
}
