import { Router } from "express";
import multer from "multer";
import { requireRole } from "../middleware/authenticate.js";
import { ingestDocument } from "../services/ingestDocument.js";
import { removeDocumentVectors } from "../services/vectorStore.js";
import { deleteDocument, findDocumentById, listDocuments } from "../data/repository.js";
import { AppError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".docx", ".txt"].includes(extension)) {
      callback(new AppError(415, "Only PDF, DOCX, and TXT files are supported."));
      return;
    }
    callback(null, true);
  }
});
router.use(requireRole("admin"));

router.get("/", asyncHandler(async (_request, response) => {
  const documents = await listDocuments();
  response.json({ documents });
}));

router.post("/", (request, response, next) => {
  upload.single("file")(request, response, (error) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(413, `Files must be ${env.MAX_UPLOAD_MB} MB or smaller.`));
    }
    next(error);
  });
}, asyncHandler(async (request, response) => {
  if (!request.file) throw new AppError(400, "Choose a document to upload.");
  const safeName = request.file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, "_");
  const extension = safeName.slice(safeName.lastIndexOf("."));
  const normalizedName = safeName.length > 255
    ? `${safeName.slice(0, 255 - extension.length)}${extension}`
    : safeName;
  const document = await ingestDocument({ ...request.file, originalname: normalizedName }, request.user._id);
  response.status(201).json({ document });
}));

router.delete("/:id", asyncHandler(async (request, response) => {
  const document = await findDocumentById(request.params.id);
  if (!document) throw new AppError(404, "Document not found.");
  await removeDocumentVectors(String(document._id), document.chunkCount);
  await deleteDocument(request.params.id);
  response.status(204).end();
}));

export default router;
