import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATA_MODE: z.enum(["local", "services"]).default(process.env.NODE_ENV === "production" ? "services" : "local"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/smart_campus_assistant"),
  JWT_SECRET: z.string()
    .min(43, "JWT_SECRET must be at least 43 characters; use a cryptographically random secret")
    .refine((secret) => new Set(secret).size >= 16, "JWT_SECRET must contain sufficient character variation")
    .refine((secret) => !secret.includes("replace-with-a-random-secret"), "Replace the JWT_SECRET example placeholder"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  COOKIE_SECURE: z.string().default("false").transform((value) => value === "true"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(15),
  CHROMA_URL: z.string().url().default("http://127.0.0.1:8000"),
  CHROMA_COLLECTION: z.string().regex(/^[a-zA-Z0-9_-]{3,63}$/).default("campus_documents"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-haiku-latest"),
  CHUNK_SIZE: z.coerce.number().int().min(200).max(4000).default(1200),
  CHUNK_OVERLAP: z.coerce.number().int().min(0).max(1000).default(180),
  RAG_MAX_DISTANCE: z.coerce.number().min(0).max(2).default(0.45)
}).superRefine((values, context) => {
  if (values.NODE_ENV === "production" && values.DATA_MODE !== "services") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATA_MODE"],
      message: "Production requires DATA_MODE=services; local development storage is not allowed"
    });
  }
  if (values.CHUNK_OVERLAP >= values.CHUNK_SIZE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CHUNK_OVERLAP"],
      message: "CHUNK_OVERLAP must be smaller than CHUNK_SIZE"
    });
  }
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error("Invalid environment configuration:", result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
