import { ChromaClient } from "chromadb";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { embedTexts } from "./embeddings.js";
import { isLocalMode } from "../data/repository.js";
import { localStore } from "../data/localStore.js";

const client = new ChromaClient({ path: env.CHROMA_URL });
let collectionPromise;

async function getCollection() {
  collectionPromise ??= client.getOrCreateCollection({
    name: env.CHROMA_COLLECTION,
    metadata: { "hnsw:space": "cosine" }
  }).catch((error) => {
    collectionPromise = undefined;
    throw error;
  });
  try {
    return await collectionPromise;
  } catch (error) {
    console.error("ChromaDB connection failed:", error.message);
    throw new AppError(503, "Vector search is unavailable. Check the ChromaDB service.");
  }
}

export async function indexChunks(documentId, filename, chunks) {
  if (isLocalMode) {
    await localStore.replaceDocumentChunks(documentId, filename, chunks);
    return chunks.map((_, index) => `${documentId}:${index}`);
  }
  const collection = await getCollection();
  const ids = chunks.map((_, index) => `${documentId}:${index}`);
  const vectors = await embedTexts(chunks.map((chunk) => chunk.content));
  try {
    for (let offset = 0; offset < chunks.length; offset += 64) {
      const batch = chunks.slice(offset, offset + 64);
      await collection.add({
        ids: ids.slice(offset, offset + batch.length),
        embeddings: vectors.slice(offset, offset + batch.length),
        documents: batch.map((chunk) => chunk.content),
        metadatas: batch.map((chunk) => ({
          documentId,
          filename,
          page: chunk.page
        }))
      });
    }
  } catch (error) {
    await collection.delete({ ids }).catch((cleanupError) => {
      console.error("Unable to roll back partially indexed document:", cleanupError.message);
    });
    console.error("ChromaDB indexing failed:", error.message);
    throw new AppError(502, "The document could not be indexed in the vector database.");
  }
  return ids;
}

export async function removeDocumentVectors(documentId, chunkCount) {
  if (isLocalMode) {
    await localStore.removeDocumentChunks(documentId);
    return;
  }
  const collection = await getCollection();
  const ids = Array.from({ length: chunkCount }, (_, index) => `${documentId}:${index}`);
  if (ids.length) await collection.delete({ ids });
}

export async function searchChunks(question, limit = 5) {
  if (isLocalMode) return localStore.searchChunks(question, limit);
  const collection = await getCollection();
  const [queryEmbedding] = await embedTexts([question]);
  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: limit,
    include: ["documents", "metadatas", "distances"]
  });
  return (result.ids?.[0] ?? []).map((id, index) => ({
    id,
    content: result.documents?.[0]?.[index] ?? "",
    metadata: result.metadatas?.[0]?.[index] ?? {},
    distance: result.distances?.[0]?.[index] ?? 2
  }));
}
