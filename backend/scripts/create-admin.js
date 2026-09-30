import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDatabase } from "../src/config/database.js";
import { createUser, userExists } from "../src/data/repository.js";
import { env } from "../src/config/env.js";

const [email, password, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();
if (!email || !password || !name || password.length < 12) {
  console.error("Usage: npm run create-admin -- <email> <password-at-least-12-chars> <name>");
  process.exit(1);
}
const parsedEmail = z.string().email().max(254).safeParse(email);
if (!parsedEmail.success || name.length > 80) {
  console.error("Provide a valid email address and a name no longer than 80 characters.");
  process.exit(1);
}

try {
  await connectDatabase();
  const normalizedEmail = parsedEmail.data.toLowerCase().trim();
  if (await userExists(normalizedEmail)) {
    throw new Error("An account with that email already exists.");
  }
  await createUser({
    email: normalizedEmail,
    name,
    passwordHash: await bcrypt.hash(password, 12),
    role: "admin"
  });
  console.info(`Admin account created for ${normalizedEmail}`);
} catch (error) {
  console.error("Unable to create admin:", error.message);
  process.exitCode = 1;
} finally {
  if (env.DATA_MODE === "services") {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  }
}
