import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

async function requestEmbeddings(texts) {
  const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: env.EMBEDDING_MODEL, input: texts })
  });
  if (!response.ok) {
    const message = await response.text();
    console.error("Embedding provider error:", response.status, message.slice(0, 500));
    throw new AppError(502, "The embedding provider could not process the request.");
  }
  const result = await response.json();
  if (!Array.isArray(result.data) || result.data.length !== texts.length) {
    throw new AppError(502, "The embedding provider returned an invalid response.");
  }
  return result.data.map((item) => item.embedding);
}

export async function embedTexts(texts) {
  if (!env.OPENAI_API_KEY) {
    throw new AppError(503, "Document search is not configured: set OPENAI_API_KEY.");
  }
  const vectors = [];
  for (let offset = 0; offset < texts.length; offset += 64) {
    const batch = texts.slice(offset, offset + 64);
    vectors.push(...await requestEmbeddings(batch));
  }
  return vectors;
}
