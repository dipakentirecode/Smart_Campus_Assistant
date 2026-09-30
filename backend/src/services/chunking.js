export function chunkPages(pages, { size, overlap }) {
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(overlap) || overlap < 0 || overlap >= size) {
    throw new RangeError("Chunk size and overlap are invalid");
  }

  const chunks = [];
  for (const page of pages) {
    const text = page.text.replace(/\s+/g, " ").trim();
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(" ", end);
        if (boundary > start + Math.floor(size * 0.6)) end = boundary;
      }
      const content = text.slice(start, end).trim();
      if (content) chunks.push({ content, page: page.page });
      if (end >= text.length) break;
      const nextStart = Math.max(start + 1, end - overlap);
      const boundary = text.indexOf(" ", nextStart);
      start = boundary !== -1 && boundary < end ? boundary + 1 : nextStart;
    }
  }
  return chunks;
}
