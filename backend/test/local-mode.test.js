import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "../src/data/localStore.js";

test("local development mode supports persistent student, admin, document, and chat flows", async (context) => {
  process.env.DATA_MODE = "local";
  process.env.NODE_ENV = "test";
  process.env.CLIENT_ORIGIN ??= "http://localhost:5173";
  process.env.JWT_SECRET ??= "dev-local-mode-tests-use-a-strong-random-secret-1024";

  const directory = await mkdtemp(join(tmpdir(), "campus-local-mode-"));
  const dataPath = join(directory, "data.json");
  const { localStore } = await import("../src/data/localStore.js");
  localStore.path = dataPath;

  const { createUser } = await import("../src/data/repository.js");
  const { app } = await import("../src/app.js");
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  async function request(path, options = {}, cookie = "") {
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Origin: process.env.CLIENT_ORIGIN,
        ...(cookie ? { Cookie: cookie } : {}),
        ...options.headers
      }
    });
  }
  async function signIn(email, password) {
    const response = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), process.env.CLIENT_ORIGIN);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie?.startsWith("campus_session="));
    return setCookie.split(";")[0];
  }

  const preflight = await request("/auth/login", {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), process.env.CLIENT_ORIGIN);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");

  const studentPassword = "student-password-for-local-dev";
  const registerResponse = await request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Student", email: "student@example.edu", password: studentPassword })
  });
  assert.equal(registerResponse.status, 201);
  assert.equal((await registerResponse.json()).user.role, "student");
  assert.ok(registerResponse.headers.get("set-cookie")?.startsWith("campus_session="));
  const studentLoginCookie = await signIn("student@example.edu", studentPassword);

  const adminEmail = "admin@example.edu";
  const adminPassword = "admin-password-for-local-dev";
  await createUser({
    name: "Test Admin",
    email: adminEmail,
    passwordHash: await bcrypt.hash(adminPassword, 4),
    role: "admin"
  });
  const adminCookie = await signIn(adminEmail, adminPassword);

  assert.equal((await request("/documents", {}, studentLoginCookie)).status, 403);
  const form = new FormData();
  form.append("file", new Blob(["VII semester exams begin on 18 November. The Machine Learning syllabus covers Unit 3."], { type: "text/plain" }), "semester-notice.txt");
  const uploadResponse = await request("/documents", { method: "POST", body: form }, adminCookie);
  assert.equal(uploadResponse.status, 201);
  const uploaded = (await uploadResponse.json()).document;
  assert.equal(uploaded.chunkCount, 1);

  const listed = await request("/documents", {}, adminCookie);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).documents[0].uploadedBy.email, adminEmail);

  const chatResponse = await request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "When do the semester exams begin?" })
  }, studentLoginCookie);
  assert.equal(chatResponse.status, 200);
  const chat = await chatResponse.json();
  assert.match(chat.message.content, /18 November/);
  assert.ok(chat.message.citations.some(({ filename, page }) =>
    filename === "semester-notice.txt" && page === 1
  ));

  const greetingResponse = await request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Hey!", conversationId: chat.conversationId })
  }, studentLoginCookie);
  const greeting = await greetingResponse.json();
  assert.equal(greetingResponse.status, 200);
  assert.match(greeting.message.content, /I'm the Mangalayatan University campus assistant/);
  assert.deepEqual(greeting.message.citations, []);

  const demoExamResponse = await request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "When are the semester exams?", conversationId: chat.conversationId })
  }, studentLoginCookie);
  const demoExam = await demoExamResponse.json();
  assert.equal(demoExamResponse.status, 200);
  assert.match(demoExam.message.content, /18 November 2026/);
  assert.match(demoExam.message.content, /NOT AN OFFICIAL UNIVERSITY NOTICE/);
  assert.ok(demoExam.message.citations.some(({ filename, page }) =>
    filename === "DEMO_FAQ_EXAM_DATE_NOT_OFFICIAL.txt" && page === 1
  ));

  const demoFeeResponse = await request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "When is the fee payment deadline?", conversationId: chat.conversationId })
  }, studentLoginCookie);
  const demoFee = await demoFeeResponse.json();
  assert.equal(demoFeeResponse.status, 200);
  assert.match(demoFee.message.content, /15 December 2026/);
  assert.deepEqual(demoFee.message.citations.map(({ filename, page }) => ({ filename, page })), [
    { filename: "DEMO_FAQ_FEE_DEADLINE_NOT_OFFICIAL.txt", page: 1 }
  ]);

  const noMatchResponse = await request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "Where can I find the library shuttle schedule?",
      conversationId: chat.conversationId
    })
  }, studentLoginCookie);
  const noMatch = await noMatchResponse.json();
  assert.equal(noMatchResponse.status, 200);
  assert.match(noMatch.message.content, /I couldn't find a matching passage/);
  assert.match(noMatch.message.content, /“When are the semester exams\?”/);
  assert.deepEqual(noMatch.message.citations, []);

  const historyResponse = await request("/chat/conversations", {}, studentLoginCookie);
  const history = (await historyResponse.json()).conversations;
  assert.equal(history.length, 1);
  assert.equal(history[0].messageCount, 10);
  const detailResponse = await request(`/chat/conversations/${chat.conversationId}`, {}, studentLoginCookie);
  assert.equal((await detailResponse.json()).conversation.messages[1].content, chat.message.content);

  const feedbackResponse = await request("/chat/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: chat.conversationId,
      messageId: chat.message._id,
      rating: "up"
    })
  }, studentLoginCookie);
  assert.equal(feedbackResponse.status, 204);
  const storedAfterFeedback = await new LocalStore(dataPath).read((state) => state);
  assert.equal(storedAfterFeedback.conversations[0].messages[1].feedback, "up");

  assert.equal((await request(`/documents/${uploaded._id}`, { method: "DELETE" }, adminCookie)).status, 204);
  assert.equal((await request(`/chat/conversations/${chat.conversationId}`, { method: "DELETE" }, studentLoginCookie)).status, 204);
  const persisted = JSON.parse(await readFile(dataPath, "utf8"));
  assert.equal(persisted.documents.length, 0);
  assert.equal(persisted.chunks.length, 2);
  assert.ok(persisted.chunks.every(({ metadata }) => metadata.filename.startsWith("DEMO_FAQ_")));
  assert.equal(persisted.conversations.length, 0);
});

test("local JSON store survives a new store instance and serializes concurrent writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "campus-local-store-"));
  const dataPath = join(directory, "data.json");
  try {
    const stores = Array.from({ length: 3 }, () => new LocalStore(dataPath));
    await Promise.all(Array.from({ length: 15 }, (_, index) => stores[index % stores.length].update((state) => {
      state.users.push({ id: index });
    })));
    const second = new LocalStore(dataPath);
    const users = await second.read((state) => state.users);
    assert.equal(users.length, 15);
    assert.deepEqual(users.map((user) => user.id).sort((left, right) => left - right), Array.from({ length: 15 }, (_, index) => index));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
