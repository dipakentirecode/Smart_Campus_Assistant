import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true, maxlength: 12000 },
  citations: [{
    documentId: { type: String, required: true },
    filename: { type: String, required: true },
    page: { type: Number, required: true, min: 1 }
  }],
  feedback: { type: String, enum: ["up", "down"], default: undefined }
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, maxlength: 100 },
  messages: { type: [messageSchema], default: [] }
}, { timestamps: true });

export const Conversation = mongoose.model("Conversation", conversationSchema);
