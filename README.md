# Smart Campus Assistant

A responsive, source-grounded university information assistant for Mangalayatan University. Students can ask questions about official notices and syllabi; answers are generated from retrieved passages and cite the source filename and page. Administrators can upload, inspect, and remove knowledge-base documents.

## Stack and architecture

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide icons.
- **API:** Node.js 20+, Express, Zod validation, HTTP-only JWT cookie authentication.
- **Services mode:** MongoDB/Mongoose stores accounts, conversations, answer citations, and feedback; ChromaDB persists document chunks and page/source metadata.
- **Default local mode:** JSON file storage and local keyword retrieval support Docker-free development.
- **AI providers:** OpenAI-compatible embeddings API (default `text-embedding-3-small`) and Anthropic Messages API for grounded answer generation.
- **Ingestion:** PDF pages are extracted individually with PDF.js; DOCX and UTF-8 TXT are extracted and assigned page 1. Text is split into configurable, overlapping chunks.

Original uploads are processed in memory and are not retained on disk. Student accounts can self-register; administrator accounts can only be created by an operator using the bootstrap script. Choose `DATA_MODE=local` for standalone development or `DATA_MODE=services` for the MongoDB/ChromaDB implementation; production requires services mode.

## Requirements

- Node.js 20 or newer and npm.
- The default `DATA_MODE=local` needs only Node.js/npm; Docker, MongoDB, ChromaDB, and AI API keys are not needed to run the development application.
- `DATA_MODE=services` and production deployments require MongoDB 6+, ChromaDB 0.6.x, and an OpenAI-compatible embedding API key and Anthropic API key.
- Docker Desktop with Docker Compose is optional and is used by the services-mode development path.

## Local setup

1. Install dependencies from the project root:

   ```powershell
   npm install
   ```

2. Optional: initialize `.env` if you want to configure AI provider keys or other settings:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   The example selects `DATA_MODE=local`; AI keys are not used in local mode. For services mode, set `DATA_MODE=services` and add the embedding and Anthropic API keys. Development startup replaces the example JWT placeholder with a fresh random secret. Never commit `.env` or put real credentials in `.env.example`.

3. Start the app from the project root:

   ```powershell
   npm run dev
   ```

   This starts the API and frontend without Docker or external services. The API prints a `LOCAL DEVELOPMENT MODE` banner and stores users, admin accounts, conversations, uploaded document metadata, extracted text chunks, and feedback in `.local-dev/data.json`. Retrieval is local keyword matching, and answers quote matching document excerpts with citations rather than using an external AI model. This data is local, unbacked, and intended for development only. On first startup, a cryptographically random 48-byte `JWT_SECRET` is created in the ignored `.env`; existing settings are preserved. Production never generates a secret and cannot use local storage.

   To use the MongoDB/ChromaDB services path during development instead, set `DATA_MODE=services` in `.env` and start the app. The launcher then attempts to start missing local services with Docker Compose, waits for readiness, and prints actionable instructions if Docker is unavailable.

   Docker-free exact run steps:

   ```powershell
   npm install
   npm run dev
   ```

   Local data persists across restarts. To intentionally reset only the local development database, stop the app and remove the specific data file:

   ```powershell
   Remove-Item .local-dev\data.json
   ```

4. In a second PowerShell terminal, bootstrap an administrator. Supply credentials directly to this one-time command; do not put the admin password in source control:

   ```powershell
   npm run create-admin --workspace backend -- admin@example.edu "a-long-unique-password" "Campus Administrator"
   ```

5. Open <http://localhost:5173>. The API listens on <http://localhost:4000>; its health endpoint is `/api/health`.

When using services mode with Docker Compose, the MongoDB and ChromaDB containers use persistent Docker volumes. To stop them without deleting data, run `docker compose down`; do not use `docker compose down -v` unless you intend to delete the service-mode database and index.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `PORT` | Runtime mode and API port. |
| `DATA_MODE` | `local` (default for development) uses the Docker-free JSON store and lexical retrieval; `services` uses MongoDB and ChromaDB. Production rejects `local`. |
| `CLIENT_ORIGIN` | Exact allowed browser origin for credentialed CORS. |
| `MONGODB_URI` | MongoDB connection string. |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_SECURE` | Signing key, token lifetime, and secure-cookie setting. Use HTTPS and secure cookies in production. |
| `MAX_UPLOAD_MB` | In-memory upload limit (1–50 MB; default 15). |
| `CHROMA_URL`, `CHROMA_COLLECTION` | ChromaDB endpoint and collection name. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `EMBEDDING_MODEL` | OpenAI-compatible vector embedding service. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Anthropic answer-generation service. |
| `CHUNK_SIZE`, `CHUNK_OVERLAP` | Chunk sizing in characters and overlap. |
| `RAG_MAX_DISTANCE` | Maximum Chroma cosine distance considered relevant. Tune against representative university questions and documents. |
| `VITE_API_URL` | Optional frontend API origin; defaults to `http://localhost:4000`. |

The example JWT value is a placeholder and is rejected by the API. A configured secret must be at least 43 characters and contain sufficient character variation. For manual production setup, generate a 48-byte secret in PowerShell with `$secret = node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"` and store it in the deployment platform's secret manager as `JWT_SECRET`; do not commit it. Keep provider credentials and database credentials in the deployment platform's secret manager.

## API overview

All protected endpoints require the `campus_session` HTTP-only cookie. Student registration always assigns the `student` role.

| Method and path | Access | Description |
| --- | --- | --- |
| `POST /api/auth/register` | Public, rate-limited | Create a student account. |
| `POST /api/auth/login` | Public, rate-limited | Sign in and issue a session cookie. |
| `POST /api/auth/logout` | Public | Clear the session cookie. |
| `GET /api/auth/me` | Signed in | Current account. |
| `GET /api/chat/conversations` | Signed in | Recent conversations owned by the current account. |
| `GET /api/chat/conversations/:id` | Signed in | One owned conversation and its messages. |
| `DELETE /api/chat/conversations/:id` | Signed in | Delete one owned conversation. |
| `POST /api/chat` | Signed in, rate-limited | Retrieve evidence, generate a grounded answer, and store the turn. |
| `POST /api/chat/feedback` | Signed in | Record thumbs-up/down for an assistant response. |
| `GET /api/documents` | Admin | List indexed source documents. |
| `POST /api/documents` | Admin | Multipart upload using the `file` field (PDF, DOCX, or TXT). |
| `DELETE /api/documents/:id` | Admin | Remove document metadata and its indexed chunks. |
| `GET /api/health` | Public | Basic API process health. |

Errors use a JSON `{ "error": "..." }` response. The API limits authentication attempts and chat submissions, validates request bodies, caps uploads, hashes passwords with bcrypt, and does not expose admin registration.

## RAG behavior and document handling

Uploads are extracted page by page where the format supports it (PDFs are limited to 500 pages), then split into overlapping chunks while preserving page/source metadata. In default local development mode, chunks are stored in `.local-dev/data.json`, keyword retrieval finds matching excerpts, and the assistant quotes those excerpts verbatim with their source citations; there is no generated synthesis or AI provider call. In services mode, chunks are embedded in batches and stored in ChromaDB, similarity-filtered retrieval provides context to Anthropic, and the model is instructed to ignore embedded instructions, answer only from the excerpts, and abstain rather than guess.

Scanned/image-only PDFs do not contain extractable text and will fail ingestion with a clear “no readable text” error; OCR is not currently included. DOCX and TXT do not have stable page layout, so their citations use page 1. Uploads are held in memory only for parsing. In local mode, the ignored `.local-dev/data.json` stores user password hashes, document metadata and extracted chunks, conversation history, citations, and feedback. In services mode, MongoDB retains account/document/chat data and ChromaDB retains extracted chunks and source metadata.

## Production deployment

Deploy the frontend static build and the API separately or behind one HTTPS reverse proxy. Provision persistent MongoDB and ChromaDB services and set `DATA_MODE=services` and their private connection URLs in the API environment. Set `NODE_ENV=production`, `COOKIE_SECURE=true`, `CLIENT_ORIGIN` to the exact HTTPS frontend origin, a fresh high-entropy `JWT_SECRET`, and the provider/API credentials as deployment secrets. Production startup rejects `DATA_MODE=local`; there is no in-memory/JSON fallback in production. Build the frontend with `npm run build --workspace frontend` (or `npm run build`) and serve `frontend/dist`; start the API with `npm run start --workspace backend`. Set `VITE_API_URL` at frontend build time if the API is not on the same host/origin. Expose `/api/health` to platform health checks and back up MongoDB and ChromaDB persistent data independently.

The supplied Compose file is for local development; it does not configure production TLS, database authentication, or public-service hardening. Do not expose those development services directly to the public internet.

## Validation

```powershell
npm test
npm run build
```

Tests cover chunking, development secret safeguards, production rejection of local storage, and end-to-end local registration/login, role authorization, document ingestion/search/deletion, chat history, citations, and feedback. Verifying the optional `DATA_MODE=services` integration still requires MongoDB, ChromaDB, and valid embedding and Anthropic credentials.
