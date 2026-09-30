import PDFDocument from "pdfkit";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = fileURLToPath(new URL("../docs/Smart_Campus_Assistant_Project_Report.md", import.meta.url));
const outputPath = fileURLToPath(new URL("../docs/Smart_Campus_Assistant_Project_Report.pdf", import.meta.url));

async function findFont(paths) {
  for (const path of paths) {
    try {
      await access(path, constants.R_OK);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}

function parseSource(source) {
  const metadata = {};
  const frontMatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let body = source;
  if (frontMatter) {
    for (const line of frontMatter[1].split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator > 0) metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    body = source.slice(frontMatter[0].length);
  }

  const blocks = [];
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith(":::diagram ")) {
      blocks.push({ type: "diagram", name: line.slice(":::diagram ".length).trim() });
      index += 1;
      continue;
    }
    if (line.startsWith("#")) {
      const level = line.match(/^#+/)[0].length;
      blocks.push({ type: "heading", level, text: line.slice(level).trim() });
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (/^\|.*\|$/.test(line)) {
      const rows = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index])) {
        const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells);
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index++].replace(/^\s*[-*]\s+/, ""));
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index++].replace(/^\s*\d+\.\s+/, ""));
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push({ type: "quote", text: line.slice(2).trim() });
      index += 1;
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim()
      && !lines[index].startsWith("#")
      && !lines[index].startsWith("```")
      && !lines[index].startsWith(":::diagram ")
      && !/^\s*[-*]\s+/.test(lines[index])
      && !/^\s*\d+\.\s+/.test(lines[index])
      && !/^\|.*\|$/.test(lines[index])
      && !lines[index].startsWith("> ")) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return { metadata, blocks };
}

function cleanInline(text) {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}

function createDocument(fonts) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 57, bottom: 63, left: 64, right: 64 },
    bufferPages: true,
    compress: true,
    info: {
      Title: "Smart Campus Assistant — Project Report",
      Subject: "B.Tech project report: a RAG-based chatbot for university information",
      Author: "B.Tech Project Submission"
    }
  });
  doc.registerFont("Body", fonts.regular);
  doc.registerFont("Bold", fonts.bold);
  doc.registerFont("Italic", fonts.italic);
  doc.registerFont("Mono", fonts.mono);
  return doc;
}

function drawRule(doc, x1, y1, x2, y2, color = "#dfe8e8", width = 0.8) {
  doc.save().strokeColor(color).lineWidth(width).moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
}

function drawRoundedBox(doc, x, y, width, height, title, detail, options = {}) {
  doc.save()
    .lineWidth(0.9)
    .strokeColor(options.stroke ?? "#cbdedb")
    .fillColor(options.fill ?? "#f5f9f8")
    .roundedRect(x, y, width, height, 7)
    .fillAndStroke()
    .restore();
  doc.font("Bold").fontSize(options.titleSize ?? 9).fillColor("#254b4a")
    .text(title, x + 7, y + 7, { width: width - 14, align: "center", lineBreak: false });
  if (detail) {
    doc.font("Body").fontSize(options.detailSize ?? 7).fillColor("#607978")
      .text(detail, x + 7, y + 21, { width: width - 14, height: height - 24, align: "center", lineGap: 1 });
  }
}

function drawDownArrow(doc, x1, y1, x2, y2, color = "#57948b") {
  doc.save().strokeColor(color).fillColor(color).lineWidth(1)
    .moveTo(x1, y1).lineTo(x2, y2).stroke()
    .moveTo(x2, y2).lineTo(x2 - 3.5, y2 - 5).lineTo(x2 + 3.5, y2 - 5).closePath().fill().restore();
}

function drawArchitecture(doc, x, y, width) {
  const center = x + width / 2;
  drawRoundedBox(doc, center - 154, y, 308, 44, "STUDENT + ADMIN", "Responsive React / Vite web client | authenticated browser session", { fill: "#eef6f4" });
  drawDownArrow(doc, center, y + 45, center, y + 58);
  drawRoundedBox(doc, center - 136, y + 60, 272, 46, "EXPRESS REST API", "Authentication | authorization | ingestion | chat | feedback", { fill: "#e8f3f1" });
  const gap = 9;
  const boxWidth = (width - gap * 2) / 3;
  const rowY = y + 128;
  const boxes = [
    ["APPLICATION DATA", "MongoDB in services mode\n.local-dev/data.json in local mode"],
    ["DOCUMENT RETRIEVAL", "ChromaDB vectors in services mode\nLocal keyword index in local mode"],
    ["AI SERVICES", "Embeddings + Anthropic in services mode\nNo external AI call in local mode"]
  ];
  for (let index = 0; index < boxes.length; index += 1) {
    const boxX = x + index * (boxWidth + gap);
    drawDownArrow(doc, center, y + 107, boxX + boxWidth / 2, rowY - 8);
    drawRoundedBox(doc, boxX, rowY, boxWidth, 51, boxes[index][0], boxes[index][1], {
      fill: index === 0 ? "#f5f7fa" : index === 1 ? "#f5f5fb" : "#fbf7f0",
      detailSize: 6.6
    });
  }
  doc.font("Italic").fontSize(7).fillColor("#728283")
    .text("Production requires services mode. Local mode is an explicit development/demo path.", x, rowY + 59, { width, align: "center" });
  return rowY + 75 - y;
}

function drawRagFlow(doc, x, y, width) {
  const labels = [
    ["1  ADMIN UPLOAD", "PDF / DOCX / TXT"],
    ["2  EXTRACT + CHUNK", "Page-aware passages"],
    ["3  INDEX", "Vectors or local terms"],
    ["4  RETRIEVE", "Rank + filter evidence"],
    ["5  ANSWER", "Context-only or excerpt"],
    ["6  CITE + SAVE", "Filename / page"]
  ];
  const gap = 7;
  const boxWidth = (width - gap * (labels.length - 1)) / labels.length;
  for (let index = 0; index < labels.length; index += 1) {
    const boxX = x + index * (boxWidth + gap);
    drawRoundedBox(doc, boxX, y, boxWidth, 55, labels[index][0], labels[index][1], {
      fill: index % 2 === 0 ? "#eff7f5" : "#f7f8fa",
      titleSize: 6.4,
      detailSize: 6.1
    });
    if (index < labels.length - 1) {
      doc.save().strokeColor("#57948b").lineWidth(0.9)
        .moveTo(boxX + boxWidth, y + 27).lineTo(boxX + boxWidth + gap - 1, y + 27).stroke()
        .moveTo(boxX + boxWidth + gap - 1, y + 27)
        .lineTo(boxX + boxWidth + gap - 4, y + 24)
        .lineTo(boxX + boxWidth + gap - 4, y + 30)
        .closePath().fillColor("#57948b").fill().restore();
    }
  }
  return 62;
}

function drawDataModel(doc, x, y, width) {
  const gap = 14;
  const boxWidth = (width - gap) / 2;
  const rows = [
    [["USER", "id / email / passwordHash / role"], ["DOCUMENT", "id / filename / size / uploader"]],
    [["CONVERSATION", "id / owner / title / timestamps"], ["MESSAGE", "role / text / citations / feedback"]]
  ];
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const boxX = x + col * (boxWidth + gap);
      const boxY = y + row * 84;
      drawRoundedBox(doc, boxX, boxY, boxWidth, 46, rows[row][col][0], rows[row][col][1], { detailSize: 7.1 });
    }
  }
  drawDownArrow(doc, x + boxWidth / 2, y + 47, x + boxWidth / 2, y + 75);
  drawDownArrow(doc, x + boxWidth + gap + boxWidth / 2, y + 47, x + boxWidth + gap + boxWidth / 2, y + 75);
  doc.font("Italic").fontSize(7).fillColor("#728283")
    .text("One user owns each conversation. Each assistant message may cite one or more document pages.", x, y + 174, { width, align: "center" });
  return 188;
}

function estimateTextHeight(doc, text, width, font, size, options = {}) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(cleanInline(text), { width, lineGap: options.lineGap ?? 2 });
}

function getTableLayout(doc, rows) {
  if (!rows.length) return { columnWidths: [], rowHeights: [], totalHeight: 0 };
  const columns = Math.max(...rows.map((row) => row.length));
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const fontSize = columns >= 4 ? 7.1 : 7.6;
  const minimums = Array.from({ length: columns }, (_, column) => {
    if (columns === 2) return 115;
    if (column === 0) return columns >= 4 ? 66 : 48;
    return columns >= 4 ? 58 : 68;
  });
  const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
  const available = width - minimumTotal;
  const weights = Array.from({ length: columns }, (_, column) => Math.max(
    12,
    ...rows.map((row) => Math.min(64, (row[column] ?? "").length))
  ));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const columnWidths = minimums.map((minimum, index) => minimum + available * weights[index] / weightTotal);
  const padding = 6;
  const rowHeights = rows.map((row, rowIndex) => {
    const font = rowIndex === 0 ? "Bold" : "Body";
    const cellHeights = columnWidths.map((columnWidth, column) =>
      estimateTextHeight(doc, row[column] ?? "", columnWidth - padding * 2, font, fontSize, { lineGap: 1 })
    );
    return Math.max(26, ...cellHeights.map((height) => height + padding * 2));
  });
  return { columnWidths, rowHeights, totalHeight: rowHeights.reduce((sum, height) => sum + height, 0) + 8 };
}

function renderTable(doc, rows, ensureSpace) {
  if (!rows.length) return;
  const columns = Math.max(...rows.map((row) => row.length));
  const { columnWidths, rowHeights, totalHeight } = getTableLayout(doc, rows);
  const availablePageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  if (totalHeight <= availablePageHeight && totalHeight > doc.page.height - doc.page.margins.bottom - doc.y) {
    doc.addPage();
  }
  rows.forEach((row, rowIndex) => {
    const font = rowIndex === 0 ? "Bold" : "Body";
    const fontSize = columns >= 4 ? 7.1 : 7.6;
    const padding = 6;
    const rowHeight = rowHeights[rowIndex];
    ensureSpace(rowHeight + 1);
    const rowY = doc.y;
    let cellX = doc.page.margins.left;
    for (let column = 0; column < columns; column += 1) {
      const cellWidth = columnWidths[column];
      doc.save()
        .fillColor(rowIndex === 0 ? "#eaf3f1" : rowIndex % 2 === 0 ? "#fafcfc" : "#ffffff")
        .strokeColor("#dce6e5")
        .lineWidth(0.55)
        .rect(cellX, rowY, cellWidth, rowHeight)
        .fillAndStroke()
        .restore();
      doc.font(font).fontSize(fontSize).fillColor("#344b50")
        .text(cleanInline(row[column] ?? ""), cellX + padding, rowY + padding, {
          width: cellWidth - padding * 2,
          height: rowHeight - padding * 2,
          lineGap: 1
        });
      cellX += cellWidth;
    }
    doc.y = rowY + rowHeight;
  });
  doc.moveDown(0.65);
}

function addCover(doc, metadata) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  doc.rect(0, 0, pageWidth, pageHeight).fill("#f7faf9");
  doc.rect(0, 0, pageWidth, 18).fill("#1b6d68");
  doc.save().lineWidth(1).strokeColor("#d6e8e4").circle(pageWidth - 94, 166, 56).stroke()
    .circle(pageWidth - 94, 166, 39).stroke().restore();
  for (let index = 0; index < 5; index += 1) {
    const nodeX = pageWidth - 132 + index * 19;
    const nodeY = 135 + (index % 2) * 14;
    doc.circle(nodeX, nodeY, 3).fill("#64a49b");
    if (index < 4) drawRule(doc, nodeX + 3, nodeY, nodeX + 16, 149 + ((index + 1) % 2) * 14, "#b5d5cf", 1);
  }
  doc.font("Bold").fontSize(10).fillColor("#377d75")
    .text(metadata.institution ?? "[UNIVERSITY / INSTITUTION]", 64, 86, { width: 366 });
  doc.font("Body").fontSize(9).fillColor("#748686")
    .text(metadata.campus ?? "[CAMPUS / CITY]", 64, 102);
  doc.font("Bold").fontSize(10).fillColor("#83928f")
    .text("VII SEMESTER B.TECH PROJECT REPORT", 64, 206, { characterSpacing: 1.3 });
  doc.font("Bold").fontSize(31).fillColor("#19373b")
    .text(metadata.title ?? "Smart Campus Assistant", 64, 239, { width: pageWidth - 128, lineGap: 3 });
  doc.font("Italic").fontSize(17).fillColor("#267a71")
    .text(metadata.subtitle ?? "A RAG-Based Chatbot for University Information", 65, doc.y + 8, {
      width: pageWidth - 130,
      lineGap: 4
    });
  drawRule(doc, 65, doc.y + 24, pageWidth - 65, doc.y + 24, "#cbded9", 1);
  const detailsY = doc.y + 52;
  const details = [
    ["Submitted by", metadata.student],
    ["Enrollment No.", metadata.enrollment],
    ["Programme", metadata.programme],
    ["Project Guide", metadata.guide],
    ["Department", metadata.department],
    ["Academic Year", metadata.academic_year],
    ["Submission Date", metadata.submission_date]
  ];
  details.forEach(([label, value], index) => {
    const rowY = detailsY + index * 31;
    doc.font("Bold").fontSize(8).fillColor("#71817f").text(label.toUpperCase(), 68, rowY, { width: 123 });
    doc.font("Body").fontSize(10).fillColor("#2c4448").text(value ?? "[EDIT BEFORE SUBMISSION]", 198, rowY - 1, { width: 325 });
    drawRule(doc, 68, rowY + 20, pageWidth - 68, rowY + 20, "#e5ecea", 0.5);
  });
  doc.font("Body").fontSize(8).fillColor("#82918f")
    .text("Submission details are taken from the supplied synopsis where available. Review all marked fields before printing.", 66, pageHeight - 91, {
      width: pageWidth - 132,
      align: "center"
    });
}

function renderContents(doc, entries, ensureSpace) {
  doc.font("Bold").fontSize(21).fillColor("#1b4948").text("Table of Contents");
  doc.moveDown(0.4);
  doc.font("Body").fontSize(8).fillColor("#71817f")
    .text("Page numbers refer to the generated PDF; the title page is included in the count.");
  doc.moveDown(0.9);
  for (const entry of entries) {
    ensureSpace(23);
    const y = doc.y;
    doc.font("Body").fontSize(9).fillColor("#344b50")
      .text(entry.title, doc.page.margins.left, y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 48
      });
    doc.font("Bold").fontSize(9).fillColor("#1b6d68")
      .text(String(entry.page), doc.page.width - doc.page.margins.right - 33, y, { width: 30, align: "right" });
    doc.y = y + 20;
    drawRule(doc, doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.right, doc.y, "#e7eeed", 0.45);
    doc.y += 2;
  }
}

function renderBody(doc, blocks, tocEntries, options = {}) {
  let titleFont = 23;
  const ensureSpace = (height) => {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
  };
  const recordToc = options.recordToc ?? [];
  const skipTitle = options.skipTitle ?? false;
  let firstHeading = true;

  for (const block of blocks) {
    if (block.type === "heading") {
      if (skipTitle && firstHeading && block.level === 1) {
        firstHeading = false;
        continue;
      }
      firstHeading = false;
      if (block.level === 1) {
        doc.addPage();
        recordToc.push({ title: block.text, page: doc._pageBuffer.length });
        doc.font("Bold").fontSize(titleFont).fillColor("#1b4948")
          .text(block.text, doc.page.margins.left, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
        doc.moveDown(0.4);
        drawRule(doc, doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.right, doc.y, "#6eaaa1", 1.2);
        doc.moveDown(0.9);
        titleFont = 23;
      } else if (block.text.toLowerCase() === "contents") {
        doc.addPage();
        renderContents(doc, tocEntries, ensureSpace);
      } else if (["certificate", "declaration", "acknowledgement", "abstract"].includes(block.text.toLowerCase())) {
        doc.addPage();
        doc.font("Bold").fontSize(20).fillColor("#1b4948")
          .text(block.text, doc.page.margins.left, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
        doc.moveDown(0.6);
        drawRule(doc, doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.right, doc.y, "#6eaaa1", 1.1);
        doc.moveDown(1.1);
      } else if (block.text.toLowerCase() === "references" || block.text.toLowerCase().startsWith("appendix ")) {
        doc.addPage();
        recordToc.push({ title: block.text, page: doc._pageBuffer.length });
        doc.font("Bold").fontSize(20).fillColor("#1b4948")
          .text(block.text, doc.page.margins.left, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
        doc.moveDown(0.6);
        drawRule(doc, doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.right, doc.y, "#6eaaa1", 1.1);
        doc.moveDown(1);
      } else {
        const nextBlock = blocks[blocks.indexOf(block) + 1];
        let headingAndNextBlockHeight = 55;
        if (nextBlock?.type === "table") {
          headingAndNextBlockHeight += getTableLayout(doc, nextBlock.rows).totalHeight;
        } else if (nextBlock?.type === "diagram") {
          headingAndNextBlockHeight += nextBlock.name === "architecture" ? 208 : nextBlock.name === "data" ? 200 : 75;
        } else if (nextBlock?.type === "paragraph") {
          const paragraphWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
          headingAndNextBlockHeight += estimateTextHeight(doc, nextBlock.text, paragraphWidth, "Body", 9, { lineGap: 3 }) + 14;
        }
        ensureSpace(headingAndNextBlockHeight);
        doc.moveDown(0.4);
        doc.font("Bold").fontSize(block.level === 2 ? 13 : 10).fillColor(block.level === 2 ? "#285d58" : "#52726f")
          .text(block.text, doc.page.margins.left, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
        doc.moveDown(0.45);
      }
      continue;
    }

    if (block.type === "diagram") {
      const height = block.name === "architecture" ? 208 : block.name === "data" ? 200 : 75;
      ensureSpace(height);
      const x = doc.page.margins.left;
      const y = doc.y + 2;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let drawnHeight;
      if (block.name === "architecture") drawnHeight = drawArchitecture(doc, x, y, width);
      else if (block.name === "data") drawnHeight = drawDataModel(doc, x, y, width);
      else drawnHeight = drawRagFlow(doc, x, y, width);
      doc.y = y + drawnHeight + 3;
      doc.moveDown(0.4);
      continue;
    }

    if (block.type === "table") {
      renderTable(doc, block.rows, ensureSpace);
      continue;
    }

    if (block.type === "code") {
      const text = block.text;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      doc.font("Mono").fontSize(7.5);
      const height = doc.heightOfString(text, { width: width - 22, lineGap: 2 }) + 18;
      ensureSpace(height);
      const y = doc.y;
      doc.save().fillColor("#f1f5f4").roundedRect(doc.page.margins.left, y, width, height, 5).fill().restore();
      doc.font("Mono").fontSize(7.5).fillColor("#35514e")
        .text(text, doc.page.margins.left + 11, y + 9, { width: width - 22, lineGap: 2 });
      doc.y = y + height + 8;
      continue;
    }

    if (block.type === "list") {
      const listWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - 20;
      const listHeight = block.items.reduce((total, item) =>
        total + estimateTextHeight(doc, item, listWidth, "Body", 9, { lineGap: 2 }) + 7, 0
      );
      const availablePageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
      if (listHeight <= availablePageHeight && listHeight > doc.page.height - doc.page.margins.bottom - doc.y) {
        doc.addPage();
      }
      for (const [index, item] of block.items.entries()) {
        const prefix = block.ordered ? `${index + 1}.` : "-";
        const text = cleanInline(item);
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right - 20;
        const height = estimateTextHeight(doc, text, width, "Body", 9, { lineGap: 2 });
        ensureSpace(height + 5);
        const y = doc.y;
        doc.font("Bold").fontSize(8.5).fillColor("#43867d").text(prefix, doc.page.margins.left + 2, y, { width: 18 });
        doc.font("Body").fontSize(9).fillColor("#374c52")
          .text(text, doc.page.margins.left + 20, y, { width, lineGap: 2 });
        doc.moveDown(0.32);
      }
      doc.moveDown(0.25);
      continue;
    }

    if (block.type === "quote") {
      const text = cleanInline(block.text);
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right - 22;
      const height = estimateTextHeight(doc, text, width, "Italic", 9, { lineGap: 3 });
      ensureSpace(height + 17);
      const y = doc.y;
      doc.save().strokeColor("#5c9c91").lineWidth(2).moveTo(doc.page.margins.left + 2, y).lineTo(doc.page.margins.left + 2, y + height + 8).stroke().restore();
      doc.font("Italic").fontSize(9).fillColor("#56716e")
        .text(text, doc.page.margins.left + 13, y, { width, lineGap: 3 });
      doc.y = y + height + 13;
      continue;
    }

    if (block.type === "paragraph") {
      const text = cleanInline(block.text);
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const height = estimateTextHeight(doc, text, width, "Body", 9, { lineGap: 3 });
      ensureSpace(height + 9);
      doc.font("Body").fontSize(9).fillColor("#374c52")
        .text(text, doc.page.margins.left, doc.y, { width, lineGap: 3, align: "left" });
      doc.moveDown(0.68);
    }
  }
  return recordToc;
}

function addFooters(doc) {
  const { start, count } = doc.bufferedPageRange();
  for (let pageIndex = start; pageIndex < start + count; pageIndex += 1) {
    if (pageIndex === 0) continue;
    doc.switchToPage(pageIndex);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 20;
    const y = doc.page.height - 44;
    drawRule(doc, doc.page.margins.left, y, doc.page.width - doc.page.margins.right, y, "#dfe8e7", 0.6);
    doc.font("Body").fontSize(7).fillColor("#82918f")
      .text("SMART CAMPUS ASSISTANT | B.TECH PROJECT REPORT", doc.page.margins.left, y + 10, { width: 330 });
    doc.font("Bold").fontSize(7).fillColor("#52857e")
      .text(`Page ${pageIndex + 1} of ${count}`, doc.page.width - doc.page.margins.right - 88, y + 10, { width: 88, align: "right" });
    doc.page.margins.bottom = originalBottomMargin;
  }
}

async function renderPdf(parsed, tocEntries) {
  const win = process.env.WINDIR ?? "C:\\Windows";
  const regular = await findFont([`${win}\\Fonts\\arial.ttf`, `${win}\\Fonts\\calibri.ttf`]);
  const bold = await findFont([`${win}\\Fonts\\arialbd.ttf`, `${win}\\Fonts\\calibrib.ttf`]);
  const italic = await findFont([`${win}\\Fonts\\ariali.ttf`, `${win}\\Fonts\\calibrii.ttf`]);
  const mono = await findFont([`${win}\\Fonts\\consola.ttf`, `${win}\\Fonts\\cour.ttf`]);
  const fonts = {
    regular: regular ?? "Helvetica",
    bold: bold ?? "Helvetica-Bold",
    italic: italic ?? "Helvetica-Oblique",
    mono: mono ?? "Courier"
  };
  const doc = createDocument(fonts);
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.once("end", resolve);
    doc.once("error", reject);
  });
  addCover(doc, parsed.metadata);
  const toc = [];
  renderBody(doc, parsed.blocks, tocEntries, { recordToc: toc, skipTitle: true });
  addFooters(doc);
  const pageCount = doc.bufferedPageRange().count;
  doc.end();
  await finished;
  return { buffer: Buffer.concat(chunks), pageCount, toc };
}

const source = await readFile(sourcePath, "utf8");
const parsed = parseSource(source);
const firstPass = await renderPdf(parsed, []);
const final = await renderPdf(parsed, firstPass.toc);
if (firstPass.pageCount !== final.pageCount
  || JSON.stringify(firstPass.toc) !== JSON.stringify(final.toc)) {
  throw new Error("Report pagination changed while generating the table of contents; adjust layout before distribution.");
}
await writeFile(outputPath, final.buffer);
console.info(`Generated ${outputPath}`);
console.info(`Pages: ${final.pageCount}`);
console.info(`Source: ${sourcePath}`);
