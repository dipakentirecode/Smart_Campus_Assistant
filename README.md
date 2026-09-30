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
- Deployed frontend/API sessions should share one HTTPS origin, with a reverse proxy routing `/api` to the backend.

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

   This starts the API and frontend without Docker or external services. The launcher waits for the Express `/api/health` endpoint before starting Vite, avoiding login/chat requests racing API startup. Vite proxies `/api/*` to `http://localhost:4000` by default; if the API uses another port, set matching `PORT` and `API_PROXY_TARGET` values in `.env`. The proxy leaves `Set-Cookie` and incoming `Cookie` headers intact; the browser API client uses `credentials: "include"`. The API prints a `LOCAL DEVELOPMENT MODE` banner and stores users, admin accounts, conversations, uploaded document metadata, extracted text chunks, two clearly labeled illustrative FAQ excerpts, and feedback in `.local-dev/data.json`. The sample FAQ dates (18 November 2026 for exams and 15 December 2026 for fees) are fictional test values, explicitly marked as not official, and returned with `DEMO_FAQ_..._NOT_OFFICIAL.txt` citations. Replace them with verified university notices before any real-world use. Retrieval is local keyword matching, and answers quote matching excerpts rather than using an external AI model. Greetings receive a short welcome; questions with no matching passage receive suggested questions and an explicit no-guessing notice. This data is local, unbacked, and intended for development only. On first startup, a cryptographically random 48-byte `JWT_SECRET` is created in the ignored `.env`; existing settings are preserved. Production never generates a secret and cannot use local storage.

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
| `NODE_ENV`, `PORT`, `HOST` | Runtime mode and API bind settings. `HOST` defaults to `0.0.0.0` so the API is reachable through a deployment container/host ingress; `PORT` defaults to `4000` and honors the platform-provided port. |
| `DATA_MODE` | `local` (default for development) uses the Docker-free JSON store and lexical retrieval; `services` uses MongoDB and ChromaDB. Production rejects `local`. |
| `CLIENT_ORIGIN` | Exact allowed browser origin for credentialed CORS. |
| `VITE_API_URL` | Optional frontend build-time API origin for a separate same-site backend; blank/unset uses same-origin `/api`. |
| `API_PROXY_TARGET` | Optional Vite development proxy target; defaults to `http://localhost:4000`. |
| `MONGODB_URI` | MongoDB connection string. |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_SECURE` | Signing key, token lifetime, and secure-cookie setting. Use HTTPS and secure cookies in production. |
| `MAX_UPLOAD_MB` | In-memory upload limit (1–50 MB; default 15). |
| `CHROMA_URL`, `CHROMA_COLLECTION` | ChromaDB endpoint and collection name. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `EMBEDDING_MODEL` | OpenAI-compatible vector embedding service. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Anthropic answer-generation service. |
| `CHUNK_SIZE`, `CHUNK_OVERLAP` | Chunk sizing in characters and overlap. |
| `RAG_MAX_DISTANCE` | Maximum Chroma cosine distance considered relevant. Tune against representative university questions and documents. |

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

Uploads are extracted page by page where the format supports it (PDFs are limited to 500 pages), then split into overlapping chunks while preserving page/source metadata. In default local development mode, chunks and two explicitly fictional, not-official exam/fee FAQ examples are stored in `.local-dev/data.json`, keyword retrieval finds matching excerpts, and the assistant quotes those excerpts verbatim with filename/page citations; there is no generated synthesis or AI provider call. The example dates are for local testing only and must not be treated as university policy. Local greetings receive a welcome, while other unmatched requests receive concrete suggested questions with no fabricated citation. In services mode, chunks are embedded in batches and stored in ChromaDB, similarity-filtered retrieval provides context to Anthropic, and the model is instructed to ignore embedded instructions, answer only from the excerpts, and abstain rather than guess.

Scanned/image-only PDFs do not contain extractable text and will fail ingestion with a clear “no readable text” error; OCR is not currently included. DOCX and TXT do not have stable page layout, so their citations use page 1. Uploads are held in memory only for parsing. In local mode, the ignored `.local-dev/data.json` stores user password hashes, document metadata and extracted chunks, conversation history, citations, and feedback. In services mode, MongoDB retains account/document/chat data and ChromaDB retains extracted chunks and source metadata.

## Production deployment

Provision persistent MongoDB and ChromaDB services and set `DATA_MODE=services` and their private connection URLs in the API environment. Set `NODE_ENV=production`, `COOKIE_SECURE=true`, `CLIENT_ORIGIN` to the exact HTTPS frontend origin, a fresh high-entropy `JWT_SECRET`, and the provider/API credentials as deployment secrets. Run `npm run start --workspace backend`; the API binds to `0.0.0.0` by default and listens on the platform's `PORT` (or `4000` when unset). Production startup rejects `DATA_MODE=local`; there is no in-memory/JSON fallback in production. If startup fails, check the first `Startup failed:` log line: MongoDB must be reachable before the API opens its listener.

For the recommended single-origin deployment, serve `frontend/dist` and configure the HTTPS host/reverse proxy to forward `/api/*` to the Express API's `PORT`. The frontend defaults to same-origin `/api` requests, which preserves the HTTP-only session cookie and avoids hard-coded localhost URLs. The backend exposes `POST /api/auth/login` and `GET /api/health`; the hosting layer must make those paths reach this process (binding to `0.0.0.0` does not itself create a public route). As one example, an Nginx location can use `proxy_pass http://127.0.0.1:4000;` under `location /api/ { ... }`.

If the frontend and API must be on separate origins, set `VITE_API_URL` to the backend **origin only** (for example, `https://api.example.edu`) before building the frontend; it is embedded at build time and must not include `/api` or credentials. Set backend `CLIENT_ORIGIN` to the exact frontend origin. Use the same site (such as sibling HTTPS subdomains) so the `SameSite=Lax` session cookie is sent; unrelated cross-site origins are not supported by the current cookie policy. For example, in PowerShell before `npm run build --workspace frontend`, run `$env:VITE_API_URL = "https://api.example.edu"`. The API server does not read `VITE_API_URL`; it is a frontend build setting. Build the frontend with `npm run build --workspace frontend` (or `npm run build`) and serve `frontend/dist`; start the API with `npm run start --workspace backend`. Expose `/api/health` to platform health checks and back up MongoDB and ChromaDB persistent data independently.

If the deployed login page reports a connection error, first open `https://<your-site>/api/health`. A `200` JSON response means the same-origin proxy reaches Express; a `404`, HTML page, or connection failure means the hosting/reverse-proxy must route `/api/*` to the backend. For a separately hosted API, test `https://<api-host>/api/health` directly, build the frontend with `VITE_API_URL` set to that API origin, and set the backend `CLIENT_ORIGIN` to the frontend origin exactly (scheme and hostname, with no path). For an auth-path smoke test, use PowerShell:

```powershell
$login = @{ email = "your-account@example.edu"; password = "<account-password>" } | ConvertTo-Json
Invoke-WebRequest -Method Post -Uri "https://<api-host>/api/auth/login" -Headers @{ Origin = "https://<frontend-host>" } -ContentType "application/json" -Body $login -SessionVariable campusSession
```

The response should be HTTP 200 with a user object and a `campus_session` cookie. HTTP 401 means the backend is reachable but the credentials are incorrect; a PowerShell connection failure means the API host/port/ingress is not reachable; a browser-only CORS failure means `CLIENT_ORIGIN` does not exactly match the frontend origin or the preflight is not being forwarded.

The supplied Compose file is for local development; it does not configure production TLS, database authentication, or public-service hardening. Do not expose those development services directly to the public internet.

## Validation

```powershell
npm test
npm run build
npm run report:build
```

Tests cover chunking, development secret safeguards, production rejection of local storage, and end-to-end local registration/login, role authorization, document ingestion/search/deletion, greeting and no-match responses, seeded demo FAQ retrieval/citations, chat history, and feedback. Verifying the optional `DATA_MODE=services` integration still requires MongoDB, ChromaDB, and valid embedding and Anthropic credentials.

The college-submission project report source is `docs/Smart_Campus_Assistant_Project_Report.md`. Regenerate its paginated PDF with `npm run report:build`; replace the clearly marked certificate/declaration fields and verify the synopsis-sourced student, enrollment, guide, and institution details before printing.
