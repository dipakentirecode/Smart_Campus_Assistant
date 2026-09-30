import { jwtVerify } from "jose";
import { env } from "../config/env.js";
import { findUserById } from "../data/repository.js";
import { AppError } from "../utils/errors.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function authenticate(request, _response, next) {
  try {
    const token = request.cookies?.campus_session;
    if (!token) throw new AppError(401, "Please sign in to continue.");
    const { payload } = await jwtVerify(token, secret);
    const user = await findUserById(payload.sub);
    if (!user) throw new AppError(401, "Your session is no longer valid. Please sign in again.");
    request.user = user;
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, "Your session has expired. Please sign in again."));
  }
}

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return next(new AppError(403, "You do not have permission to perform this action."));
    }
    next();
  };
}
