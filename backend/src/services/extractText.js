import mammoth from "mammoth";
import { AppError } from "../utils/errors.js";

export async function extractPages(buffer, extension) {
  if (extension === ".pdf") {
    let pdf;
    const pages = [];
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
      if (pdf.numPages > 500) throw new AppError(422, "PDFs are limited to 500 pages. Split this file and upload the parts separately.");
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push({
          page: pageNumber,
          text: content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
        });
      }
      return pages;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.warn("PDF extraction failed:", error.message);
      throw new AppError(422, "This PDF could not be read. Check that it is a valid, text-based PDF.");
    } finally {
      if (pdf) await pdf.destroy();
    }
  }

  if (extension === ".docx") {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      return [{ page: 1, text: value }];
    } catch (error) {
      console.warn("DOCX extraction failed:", error.message);
      throw new AppError(422, "This DOCX file could not be read. Check that it is a valid Word document.");
    }
  }

  if (extension === ".txt") {
    try {
      return [{ page: 1, text: new TextDecoder("utf-8", { fatal: true }).decode(buffer) }];
    } catch {
      throw new AppError(400, "The TXT file must be valid UTF-8 text.");
    }
  }

  throw new AppError(415, "Only PDF, DOCX, and TXT files are supported.");
}
