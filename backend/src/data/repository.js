import { Document } from "../models/Document.js";
import { User } from "../models/User.js";
import { Conversation } from "../models/Conversation.js";
import { env } from "../config/env.js";
import { createId, localStore } from "./localStore.js";

export const isLocalMode = env.DATA_MODE === "local";

export async function userExists(email) {
  if (isLocalMode) return localStore.read((state) => state.users.some((user) => user.email === email));
  return User.exists({ email });
}

export async function createUser(userData) {
  if (!isLocalMode) return User.create(userData);
  const now = new Date().toISOString();
  return localStore.update((state) => {
    if (state.users.some((user) => user.email === userData.email)) {
      const error = new Error("An account with that email already exists.");
      error.code = 11000;
      throw error;
    }
    const user = { _id: createId(), ...userData, createdAt: now, updatedAt: now };
    state.users.push(user);
    return user;
  });
}

export async function findUserByEmail(email, includePassword = false) {
  if (!isLocalMode) {
    const query = User.findOne({ email });
    if (includePassword) query.select("+passwordHash");
    return query;
  }
  return localStore.read((state) => {
    const user = state.users.find((entry) => entry.email === email);
    if (!user) return null;
    if (includePassword) return user;
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  });
}

export async function findUserById(id) {
  if (!isLocalMode) return User.findById(id).select("name email role");
  return localStore.read((state) => {
    const user = state.users.find((entry) => entry._id === String(id));
    if (!user) return null;
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  });
}

export async function createDocument(documentData) {
  if (!isLocalMode) return Document.create(documentData);
  const now = new Date().toISOString();
  return localStore.update((state) => {
    const document = {
      ...documentData,
      _id: String(documentData._id),
      uploadedBy: String(documentData.uploadedBy),
      createdAt: now,
      updatedAt: now
    };
    state.documents.push(document);
    return document;
  });
}

export async function listDocuments() {
  if (!isLocalMode) {
    return Document.find().sort({ createdAt: -1 }).populate("uploadedBy", "name email");
  }
  return localStore.read((state) => [...state.documents]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map((document) => {
      const user = state.users.find((entry) => entry._id === document.uploadedBy);
      return {
        ...document,
        uploadedBy: user ? { _id: user._id, name: user.name, email: user.email } : null
      };
    }));
}

export async function findDocumentById(id) {
  if (!isLocalMode) return Document.findById(id);
  return localStore.read((state) => state.documents.find((document) => document._id === String(id)) ?? null);
}

export async function deleteDocument(id) {
  if (!isLocalMode) {
    const document = await Document.findById(id);
    if (document) await document.deleteOne();
    return document;
  }
  return localStore.update((state) => {
    const index = state.documents.findIndex((document) => document._id === String(id));
    if (index === -1) return null;
    return state.documents.splice(index, 1)[0];
  });
}

export function createConversation(userId, title) {
  if (!isLocalMode) return new Conversation({ user: userId, title, messages: [] });
  const now = new Date().toISOString();
  return {
    _id: createId(),
    user: String(userId),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

export async function findConversation(id, userId) {
  if (!isLocalMode) return Conversation.findOne({ _id: id, user: userId });
  return localStore.read((state) => state.conversations.find((conversation) =>
    conversation._id === String(id) && conversation.user === String(userId)
  ) ?? null);
}

export async function listConversations(userId) {
  if (!isLocalMode) {
    return Conversation.find({ user: userId })
      .select("title updatedAt messages")
      .sort({ updatedAt: -1 })
      .limit(50);
  }
  return localStore.read((state) => state.conversations
    .filter((conversation) => conversation.user === String(userId))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 50));
}

export async function saveConversation(conversation) {
  if (!isLocalMode) return conversation.save();
  return localStore.update((state) => {
    const existingIndex = state.conversations.findIndex((entry) => entry._id === String(conversation._id));
    const saved = {
      ...conversation,
      _id: String(conversation._id),
      user: String(conversation.user),
      messages: conversation.messages.map((message) => ({
        ...message,
        _id: String(message._id ?? createId())
      })),
      updatedAt: new Date().toISOString()
    };
    if (existingIndex === -1) state.conversations.push(saved);
    else state.conversations[existingIndex] = saved;
    return saved;
  });
}

export async function deleteConversation(id, userId) {
  if (!isLocalMode) return Conversation.deleteOne({ _id: id, user: userId });
  return localStore.update((state) => {
    const index = state.conversations.findIndex((conversation) =>
      conversation._id === String(id) && conversation.user === String(userId)
    );
    if (index === -1) return { deletedCount: 0 };
    state.conversations.splice(index, 1);
    return { deletedCount: 1 };
  });
}

export async function saveFeedback(conversationId, userId, messageId, rating) {
  if (!isLocalMode) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      user: userId,
      "messages._id": messageId,
      "messages.role": "assistant"
    });
    if (!conversation) return false;
    const message = conversation.messages.id(messageId);
    if (message.role !== "assistant") return false;
    message.feedback = rating;
    await conversation.save();
    return true;
  }
  return localStore.update((state) => {
    const conversation = state.conversations.find((entry) =>
      entry._id === String(conversationId) && entry.user === String(userId)
    );
    const message = conversation?.messages.find((entry) => entry._id === String(messageId));
    if (!message || message.role !== "assistant") return false;
    message.feedback = rating;
    conversation.updatedAt = new Date().toISOString();
    return true;
  });
}
