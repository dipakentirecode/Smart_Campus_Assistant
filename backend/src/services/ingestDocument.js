import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { createDocument } from "../data/repository.js";
import { chunkPages } from "./chunking.js";
import { extractPages } from "./extractText.js";
import { indexChunks, removeDocumentVectors } from "./vectorStore.js";
import { AppError } from "../utils/errors.js";

const supportedExtensions = new Set([".pdf", ".docx", ".txt"]);

export async function ingestDocument(file, uploadedBy) {
  const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
  if (!supportedExtensions.has(extension)) throw new AppError(415, "Only PDF, DOCX, and TXT files are supported.");
  const pages = await extractPages(file.buffer, extension);
  const chunks = chunkPages(pages, { size: env.CHUNK_SIZE, overlap: env.CHUNK_OVERLAP });
  if (!chunks.length) throw new AppError(422, "No readable text was found in this document.");

  const documentId = randomUUID();
  await indexChunks(documentId, file.originalname, chunks);
  try {
    const document = await createDocument({
      _id: documentId,
      filename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      chunkCount: chunks.length,
      uploadedBy
    });
    return document;
  } catch (error) {
    await removeDocumentVectors(documentId, chunks.length).catch((cleanupError) => {
      console.error("Unable to roll back document vectors:", cleanupError.message);
    });
    throw error;
  }
}
