import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  _id: { type: String },
  filename: { type: String, required: true, trim: true, maxlength: 255 },
  contentType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  chunkCount: { type: Number, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export const Document = mongoose.model("Document", documentSchema);
