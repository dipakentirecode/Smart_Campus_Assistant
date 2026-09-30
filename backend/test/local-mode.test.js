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
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers }
    });
  }
  async function signIn(email, password) {
    const response = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  }

  const studentPassword = "student-password-for-local-dev";
  const registerResponse = await request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Student", email: "student@example.edu", password: studentPassword })
  });
  assert.equal(registerResponse.status, 201);
  const studentCookie = registerResponse.headers.get("set-cookie").split(";")[0];
  assert.equal((await registerResponse.json()).user.role, "student");

  const adminEmail = "admin@example.edu";
  const adminPassword = "admin-password-for-local-dev";
  await createUser({
    name: "Test Admin",
    email: adminEmail,
    passwordHash: await bcrypt.hash(adminPassword, 4),
    role: "admin"
  });
  const adminCookie = await signIn(adminEmail, adminPassword);

  assert.equal((await request("/documents", {}, studentCookie)).status, 403);
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
  }, studentCookie);
  assert.equal(chatResponse.status, 200);
  const chat = await chatResponse.json();
  assert.match(chat.message.content, /18 November/);
  assert.deepEqual(chat.message.citations.map(({ filename, page }) => ({ filename, page })), [
    { filename: "semester-notice.txt", page: 1 }
  ]);

  const historyResponse = await request("/chat/conversations", {}, studentCookie);
  const history = (await historyResponse.json()).conversations;
  assert.equal(history.length, 1);
  assert.equal(history[0].messageCount, 2);
  const detailResponse = await request(`/chat/conversations/${chat.conversationId}`, {}, studentCookie);
  assert.equal((await detailResponse.json()).conversation.messages[1].content, chat.message.content);

  const feedbackResponse = await request("/chat/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: chat.conversationId,
      messageId: chat.message._id,
      rating: "up"
    })
  }, studentCookie);
  assert.equal(feedbackResponse.status, 204);
  const storedAfterFeedback = await new LocalStore(dataPath).read((state) => state);
  assert.equal(storedAfterFeedback.conversations[0].messages[1].feedback, "up");

  assert.equal((await request(`/documents/${uploaded._id}`, { method: "DELETE" }, adminCookie)).status, 204);
  assert.equal((await request(`/chat/conversations/${chat.conversationId}`, { method: "DELETE" }, studentCookie)).status, 204);
  const persisted = JSON.parse(await readFile(dataPath, "utf8"));
  assert.equal(persisted.documents.length, 0);
  assert.equal(persisted.chunks.length, 0);
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
    assert.deepEqual(users.map((user) => user.id), Array.from({ length: 15 }, (_, index) => index));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
