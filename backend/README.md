# ✦ Extensio.ai — Backend Service & REST API

This directory contains the robust, database-backed Node.js Express server that powers the text-to-extension platform. It orchestrates user sessions, MongoDB schema management, Gemini API generation pipelines, on-the-fly zip compiling, and scheduled resource cleanups.

---

## 🛠️ Tech Stack & Key Components

- **Runtime & Web Framework**: Node.js, Express.
- **Database Persistence**: MongoDB utilizing **Mongoose ODM** for schema definition, verification, and database interactions.
- **Security & Hashing**: Native Node.js `crypto` with `scrypt` salt-hashing (eliminating heavy native compilations like bcrypt inside Docker).
- **Session Management**: Session documents persisted in MongoDB with automatic **Time-To-Live (TTL)** index expirations.
- **ZIP Compression**: On-the-fly zip compilation using the `archiver` streaming compression engine.
- **Testing**: Complete E2E integration test suite built with `axios`.

---

## 💾 Database Schemas (Mongoose)

### 1. User (`models/User.js`)
- `username`: String (Unique, Indexed, Trimmed, Lowercase).
- `passwordHash`: String (Secure cryptographic hash).
- `salt`: String (Cryptographic salt).
- `createdAt`: Date.

### 2. Session (`models/Session.js`)
- `token`: String (Unique, Indexed).
- `userId`: ObjectId (Refers to `User`).
- `createdAt`: Date.
- `expiresAt`: Date (Configured with a MongoDB **TTL Index** to automatically delete sessions when expired).

### 3. Project (`models/Project.js`)
- `userId`: ObjectId (Refers to `User`, Indexed).
- `projectName`: String (Trimmed).
- `createdAt`: Date.
- `updatedAt`: Date.
- `versions`: Array of version objects:
  - `versionId`: String (UUIDv4).
  - `timestamp`: Date.
  - `prompt`: String.
  - `files`: `Schema.Types.Mixed` (Native BSON Map of file names like `manifest.json` mapped to their text contents. Storing as Mixed solves dot-in-key casting errors for files with dot extensions in MongoDB).

---

## 🛡️ Security Implementations

1. **Authentication Middleware (`utils/auth.js`)**:
   - Implements `requireAuth` to extract cookie session tokens (or `Authorization: Bearer` headers).
   - Validates active sessions against MongoDB and injects the current user profile.
2. **Directory Traversal Defense**:
   - Enforces clean input filenames.
   - Prevents path modifications by rejecting double-dots (`..`), slash commands, or unapproved directories in compilation.
3. **Strict Extension & Content Check**:
   - Limits file outputs to approved extensions: `.html`, `.css`, `.js`, `.json`, `.md`, `.png`, `.jpg`.
   - Automatically validates `manifest.json` structures, enforcing that `manifest_version: 3` is populated.
4. **Code Sanitization (`utils/sanitizeCode.js`)**:
   - Scans and sanitizes all generated extension code to block malicious behavior.
   - Prevents executing code inside `eval()`, `new Function()`, or writing dynamic HTML via `document.write()`.
   - Blocks crypto miners, external tracking scripts/pixels, code obfuscation structures (such as `String.fromCharCode`), and data exfiltration routes.
5. **Manifest Permission Auditing (`utils/validateExtensionOutput.js`)**:
   - Restricts high-risk Chrome API permissions (e.g. `debugger`, `proxy`, `vpnProvider`, `nativeMessaging`).
   - Warns users if sensitive or overly broad permissions (e.g. `webRequest`, `cookies`, `<all_urls>`, `*://*/*`) are requested.
   - Performs a static check on Content Security Policy (CSP) headers to block `unsafe-eval` and `unsafe-inline`.
6. **API Rate Limiting (`utils/rateLimiter.js`)**:
   - Enforces strict sliding window API rate limits using an lightweight, auto-cleaning memory store.
   - Restricts operations globally (60 req/min), extension iterations (3 per-user req/min), and authentication routes (5 registration/15min, 10 login/15min).

---

## 🔌 API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register`: Create a new user account. Returns a session token.
- `POST /api/auth/login`: Authenticates credentials. Sets a secure HttpOnly cookie and returns a JSON session payload.
- `POST /api/auth/logout`: Invalidates and permanently deletes the session record from MongoDB.
- `GET /api/auth/me`: Verifies active session token and returns logged-in user profile.

### Projects & Operations (`/api/projects`)
- `GET /api/projects`: Lists all extension projects owned by the logged-in user.
- `GET /api/projects/:id`: Returns a complete project object including all compiled version histories.
- `PATCH /api/projects/:id/rename`: Renames an active project in the database.
- `DELETE /api/projects/:id`: Permanently deletes the project and all its nested version archives.
- `GET /api/projects/:id/versions/:versionId/preview/*`: Wildcard endpoint that retrieves a specific version's static asset (e.g. `popup.html`, `popup.css`, `popup.js`) directly from MongoDB and serves it with correct, strict MIME headers (e.g., `text/html; charset=utf-8`, `text/css; charset=utf-8`, `application/javascript; charset=utf-8`) for execution inside a sandboxed browser workspace.
- `GET /api/projects/:id/versions/:versionId/download`: Dynamic endpoint that retrieves the exact files associated with `versionId` from MongoDB, zips them on-the-fly, and streams the `.zip` binary directly to the browser.

### Generation Pipeline (`/api/extensions`)
- `POST /api/extensions/generate`: Accepts user prompts.
  - Body: `{ "projectName": "Name", "prompt": "Prompt text", "projectId": "Optional ID for iterations" }`
  - Injects historical file contexts if iterating on an existing project.
  - Communicates with Gemini API (or falls back to **Smart Mock Mode** if `GEMINI_API_KEY` is not configured).
  - Automatically saves the newly generated version to MongoDB under the user's project record.

---

## 🤖 Smart Mock Mode Heuristics (Offline Dev-friendly)

If you are developing locally without an active Gemini API key, the server falls back to an intelligent mock heuristic model instead of throwing errors:
- **Style Overrides**: Detects color strings in prompts (e.g., *blue*, *violet*, *green*) and automatically modifies styling rules in `popup.html`/`popup.css`.
- **Manifest Increments**: Automatically increments manifest.json `version` integers on iterations.
- **Code Annotations**: Prepends timeline iteration commentaries inside generated JS scripts.
- This ensures that 100% of the SaaS multiversioning, history timeline switches, ZIP streaming, and database layers can be verified offline for free.

---

## 🧪 Running & Verifying Natively

To run the backend service outside Docker directly on your host environment:

### Prerequisites
- Node.js (v18+)
- Local MongoDB instance running on `localhost:27017`

### Steps
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Copy `.env.example` to `.env` and fill in:
   ```env
   PORT=4000
   MONGO_URI=mongodb://localhost:27017/extensio
   GEMINI_API_KEY=your_key_here # Optional
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start in development mode (with hot-reloads):
   ```bash
   npm run dev
   ```
5. **Run Integration Tests**:
   - Run the E2E verification test suite natively to verify functionality:
     ```bash
     node test-e2e.js
     ```
