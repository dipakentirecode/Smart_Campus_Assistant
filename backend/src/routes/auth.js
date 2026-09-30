import { Router } from "express";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { z } from "zod";
import { env } from "../config/env.js";
import { createUser, findUserByEmail, userExists } from "../data/repository.js";
import { authenticate } from "../middleware/authenticate.js";
import { AppError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const secret = new TextEncoder().encode(env.JWT_SECRET);
const credentials = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  password: z.string().min(10).max(128)
});
const registration = credentials.extend({
  name: z.string().trim().min(2).max(80)
});

async function createSession(user, response) {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user._id))
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);
  response.cookie("campus_session", token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

router.post("/register", asyncHandler(async (request, response) => {
  const parsed = registration.safeParse(request.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
  const exists = await userExists(parsed.data.email);
  if (exists) throw new AppError(409, "An account with that email already exists.");
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await createUser({ ...parsed.data, passwordHash, role: "student" });
  response.status(201).json({ user: await createSession(user, response) });
}));

router.post("/login", asyncHandler(async (request, response) => {
  const parsed = credentials.safeParse(request.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
  const user = await findUserByEmail(parsed.data.email, true);
  if (!user || !await bcrypt.compare(parsed.data.password, user.passwordHash)) {
    throw new AppError(401, "Email or password is incorrect.");
  }
  response.json({ user: await createSession(user, response) });
}));

router.post("/logout", (_request, response) => {
  response.clearCookie("campus_session", { httpOnly: true, secure: env.COOKIE_SECURE || env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  response.status(204).end();
});

router.get("/me", authenticate, (request, response) => {
  response.json({ user: { id: request.user._id, name: request.user.name, email: request.user.email, role: request.user.role } });
});

export default router;
