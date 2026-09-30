import test from "node:test";
import assert from "node:assert/strict";
import { chunkPages } from "../src/services/chunking.js";

test("chunks are bounded, overlap, and retain their original page", () => {
  const text = Array.from({ length: 35 }, (_, index) => `word${index}`).join(" ");
  const chunks = chunkPages([{ page: 1, text }, { page: 4, text: "a second page with its own content" }], {
    size: 55,
    overlap: 12
  });

  assert.ok(chunks.length > 3);
  assert.ok(chunks.every((chunk) => chunk.content.length <= 55));
  assert.ok(chunks.every((chunk) => chunk.page === 1 || chunk.page === 4));
  assert.ok(chunks.some((chunk) => chunk.page === 4));
  const firstPageChunks = chunks.filter((chunk) => chunk.page === 1);
  assert.ok(firstPageChunks[0].content.startsWith("word0"));
  for (let index = 1; index < firstPageChunks.length; index += 1) {
    const previousWords = firstPageChunks[index - 1].content.split(" ");
    const currentWords = firstPageChunks[index].content.split(" ");
    assert.ok(previousWords.slice(-3).some((word) => currentWords.slice(0, 3).includes(word)));
  }
});

test("normalizes whitespace and skips empty pages", () => {
  assert.deepEqual(
    chunkPages([{ page: 1, text: " \n\t " }, { page: 2, text: "  official \n campus\t notice " }], { size: 100, overlap: 10 }),
    [{ content: "official campus notice", page: 2 }]
  );
});

test("rejects invalid chunk sizes and overlap", () => {
  assert.throws(() => chunkPages([{ page: 1, text: "text" }], { size: 0, overlap: 0 }), RangeError);
  assert.throws(() => chunkPages([{ page: 1, text: "text" }], { size: 20, overlap: 20 }), RangeError);
});
