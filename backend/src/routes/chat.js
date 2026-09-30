import { Router } from "express";
import { z } from "zod";
import {
  createConversation,
  deleteConversation,
  findConversation,
  listConversations,
  saveConversation,
  saveFeedback
} from "../data/repository.js";
import { createId } from "../data/localStore.js";
import { answerQuestion } from "../services/answerQuestion.js";
import { AppError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const chatInput = z.object({
  question: z.string().trim().min(2).max(2000),
  conversationId: objectId.optional()
});

router.post("/", asyncHandler(async (request, response) => {
  const parsed = chatInput.safeParse(request.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
  const { question, conversationId } = parsed.data;
  let conversation;
  if (conversationId) {
    conversation = await findConversation(conversationId, request.user._id);
    if (!conversation) throw new AppError(404, "Conversation not found.");
  } else {
    conversation = createConversation(request.user._id, question.slice(0, 96));
  }

  const result = await answerQuestion(question);
  const userMessage = { _id: createId(), role: "user", content: question, createdAt: new Date() };
  const assistantMessage = {
    _id: createId(),
    role: "assistant",
    content: result.answer,
    citations: result.citations,
    createdAt: new Date()
  };
  conversation.messages.push(userMessage, assistantMessage);
  await saveConversation(conversation);
  response.json({
    conversationId: conversation._id,
    userMessageId: userMessage._id,
    message: conversation.messages.at(-1)
  });
}));

router.get("/conversations", asyncHandler(async (request, response) => {
  const conversations = await listConversations(request.user._id);
  response.json({
    conversations: conversations.map((conversation) => ({
      id: conversation._id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length
    }))
  });
}));

router.get("/conversations/:id", asyncHandler(async (request, response) => {
  if (!objectId.safeParse(request.params.id).success) throw new AppError(400, "Conversation ID is invalid.");
  const conversation = await findConversation(request.params.id, request.user._id);
  if (!conversation) throw new AppError(404, "Conversation not found.");
  response.json({ conversation });
}));

router.delete("/conversations/:id", asyncHandler(async (request, response) => {
  if (!objectId.safeParse(request.params.id).success) throw new AppError(400, "Conversation ID is invalid.");
  const result = await deleteConversation(request.params.id, request.user._id);
  if (!result.deletedCount) throw new AppError(404, "Conversation not found.");
  response.status(204).end();
}));

router.post("/feedback", asyncHandler(async (request, response) => {
  const parsed = z.object({
    conversationId: objectId,
    messageId: objectId,
    rating: z.enum(["up", "down"])
  }).safeParse(request.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
  const saved = await saveFeedback(
    parsed.data.conversationId,
    request.user._id,
    parsed.data.messageId,
    parsed.data.rating
  );
  if (!saved) throw new AppError(404, "Assistant response not found.");
  response.status(204).end();
}));

export default router;
