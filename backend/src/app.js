import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { authenticate } from "./middleware/authenticate.js";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import documentRoutes from "./routes/documents.js";
import { AppError } from "./utils/errors.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: env.CLIENT_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
if (env.NODE_ENV !== "test") app.use(morgan("combined"));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), authRoutes);
app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api/documents", authenticate, documentRoutes);
app.use("/api/chat", authenticate, rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }), chatRoutes);

app.use((_request, _response, next) => next(new AppError(404, "Route not found.")));
app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "Request body must contain valid JSON." });
  }
  if (error.code === 11000) {
    return response.status(409).json({ error: "An account with that email already exists." });
  }
  const status = Number.isInteger(error.status)
    ? error.status
    : error.name === "MulterError"
      ? (error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      : 500;
  if (status >= 500) console.error("Request failed:", error.message);
  response.status(status).json({
    error: status >= 500 && env.NODE_ENV === "production" ? "An unexpected server error occurred." : error.message
  });
});
