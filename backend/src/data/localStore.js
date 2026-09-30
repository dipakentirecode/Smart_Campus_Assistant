import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const defaultPath = fileURLToPath(new URL("../../../.local-dev/data.json", import.meta.url));

function emptyState() {
  return { users: [], documents: [], conversations: [], chunks: [] };
}

const demoFaqChunks = [
  {
    id: "demo-faq-exam-date",
    content: "DEMO FAQ — NOT AN OFFICIAL UNIVERSITY NOTICE. Illustrative local-testing example only: the sample semester exam date is 18 November 2026. This date is not verified university information. Check the latest official examination timetable or contact the Examination Office before making plans.",
    metadata: { documentId: "demo-faq-exam-date", filename: "DEMO_FAQ_EXAM_DATE_NOT_OFFICIAL.txt", page: 1 }
  },
  {
    id: "demo-faq-fee-deadline",
    content: "DEMO FAQ — NOT AN OFFICIAL UNIVERSITY NOTICE. Illustrative local-testing example only: the sample fee payment deadline is 15 December 2026. This date is not verified university information. Check the latest official fee circular or contact the Accounts Office before making payment.",
    metadata: { documentId: "demo-faq-fee-deadline", filename: "DEMO_FAQ_FEE_DEADLINE_NOT_OFFICIAL.txt", page: 1 }
  }
];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function createId() {
  return randomBytes(12).toString("hex");
}

export class LocalStore {
  constructor(path = defaultPath) {
    this.path = path;
    this.queue = Promise.resolve();
    this.demoFaqsSeeded = false;
  }

  async ensureDemoFaqs() {
    if (this.demoFaqsSeeded) return;
    await this.update((state) => {
      if (!state.demoFaqsSeeded) {
        const existingIds = new Set(state.chunks.map((chunk) => chunk.id));
        state.chunks.push(...demoFaqChunks.filter((chunk) => !existingIds.has(chunk.id)));
        state.demoFaqsSeeded = true;
      }
    });
    this.demoFaqsSeeded = true;
  }

  async load() {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return emptyState();
      throw new Error(`Cannot read local development data at ${this.path}: ${error.message}`);
    }
  }

  async read(select) {
    await this.queue;
    return clone(select(await this.load()));
  }

  async acquireLock() {
    const lockPath = `${this.path}.lock`;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        return async () => {
          await handle.close();
          await rm(lockPath, { force: true });
        };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          const { mtimeMs } = await stat(lockPath);
          if (Date.now() - mtimeMs > 120_000) {
            await rm(lockPath, { force: true });
            continue;
          }
        } catch (statError) {
          if (statError.code === "ENOENT") continue;
          throw statError;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }
    throw new Error(`Timed out waiting for local data lock ${lockPath}. Close other development/admin processes and retry.`);
  }

  async update(change) {
    const operation = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const unlock = await this.acquireLock();
      try {
        const state = await this.load();
        const result = await change(state);
        const temporaryPath = `${this.path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
        try {
          await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
          await rename(temporaryPath, this.path);
        } catch (error) {
          await rm(temporaryPath, { force: true }).catch(() => {});
          throw new Error(`Cannot persist local development data at ${this.path}: ${error.message}`);
        }
        return clone(result);
      } finally {
        await unlock();
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async replaceDocumentChunks(documentId, filename, chunks) {
    return this.update((state) => {
      state.chunks = state.chunks.filter((chunk) => chunk.metadata.documentId !== String(documentId));
      state.chunks.push(...chunks.map((chunk, index) => ({
        id: `${documentId}:${index}`,
        content: chunk.content,
        metadata: { documentId: String(documentId), filename, page: chunk.page }
      })));
      return chunks.length;
    });
  }

  async removeDocumentChunks(documentId) {
    return this.update((state) => {
      const previousLength = state.chunks.length;
      state.chunks = state.chunks.filter((chunk) => chunk.metadata.documentId !== String(documentId));
      return previousLength - state.chunks.length;
    });
  }

  async searchChunks(question, limit) {
    await this.ensureDemoFaqs();
    const stopWords = new Set(["a", "an", "and", "are", "do", "does", "for", "from", "how", "i", "in", "is", "it", "me", "of", "on", "or", "please", "show", "tell", "the", "to", "what", "when", "where", "which", "who", "why", "with", "would"]);
    const tokenize = (text) => (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .map((word) => word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word)
      .filter((word) => word.length > 1 && !stopWords.has(word));
    const terms = [...new Set(tokenize(question))];
    if (!terms.length) return [];
    return this.read((state) => state.chunks
      .map((chunk) => {
        const words = new Set(tokenize(chunk.content));
        const matchedTerms = terms.filter((term) => words.has(term));
        const coverage = matchedTerms.length / terms.length;
        return {
          ...chunk,
          distance: 1 - coverage,
          matchedTerms: matchedTerms.length
        };
      })
      .filter((chunk) => chunk.matchedTerms > 0)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit)
      .map(({ matchedTerms: _matchedTerms, ...chunk }) => chunk));
  }
}

export const localStore = new LocalStore();
