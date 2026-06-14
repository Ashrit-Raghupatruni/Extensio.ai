# ✦ Extensio.ai — Backend Service & REST API

This directory contains the robust, database-backed Node.js Express server that powers the text-to-extension platform. It orchestrates user sessions, MongoDB schema management, Gemini API generation pipelines, Stripe subscription billing, multi-layer security enforcement, on-the-fly zip compiling, and scheduled resource cleanups.

---

## 🛠️ Tech Stack & Key Components

- **Runtime & Web Framework**: Node.js, Express.
- **Database Persistence**: MongoDB utilizing **Mongoose ODM** for schema definition, verification, and database interactions.
- **AI Generation Engine**: Gemini 2.5 Flash with tuned temperature (0.15), multi-shot prompt engineering, self-healing validation pipeline, prompt injection guard, and cross-file reference integrity checking.
- **Security & Hashing**: Native Node.js `crypto` with `scrypt` salt-hashing (eliminating heavy native compilations like bcrypt inside Docker).
- **Security Headers**: `helmet` middleware for CSP, X-Frame-Options, HSTS, X-Content-Type-Options, and more.
- **CSRF Protection**: Double-submit cookie pattern via `utils/csrfProtection.js` — validates `X-CSRF-Token` headers on all state-changing requests.
- **CORS**: Restricted to explicitly allowed origins via `ALLOWED_ORIGINS` environment variable.
- **Session Management**: Session documents persisted in MongoDB with automatic **Time-To-Live (TTL)** index expirations.
- **Payments**: Stripe Checkout for subscription upgrades, webhook handler for lifecycle events, Customer Portal for management.
- **ZIP Compression**: On-the-fly zip compilation using the `archiver` streaming compression engine.
- **Testing**: Complete E2E integration test suite built with `axios` (16 tests).

---

## 💾 Database Schemas (Mongoose)

### 1. User (`models/User.js`)
- `username`: String (Unique, Indexed, Trimmed, Lowercase).
- `passwordHash`: String (Secure cryptographic hash).
- `salt`: String (Cryptographic salt).
- `subscriptionTier`: String (Enum: `free`, `premium`, `cancelled`. Default: `free`).
- `usageCount`: Number (Tracks total generations per user).
- `maxFreeGenerations`: Number (Default: 5).
- `stripeCustomerId`: String (Stripe customer ID, set on first checkout).
- `stripeSubscriptionId`: String (Active Stripe subscription ID).
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
  - `files`: `Schema.Types.Mixed` (Native BSON Map of file names like `manifest.json` mapped to their text contents).

---

## 🛡️ Security Implementations

1. **Helmet.js Security Headers (`server.js`)**:
   - Content-Security-Policy (CSP) with strict directives.
   - X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security (HSTS).
   - Referrer-Policy, Cross-Origin policies.

2. **CORS Restriction (`server.js`)**:
   - Origins restricted to `ALLOWED_ORIGINS` environment variable.
   - Rejects requests from unauthorized domains.
   - Credentials mode enabled for cookie-based auth.

3. **CSRF Protection (`utils/csrfProtection.js`)**:
   - Double-submit cookie pattern using `extensio_csrf` cookie.
   - All POST/PUT/PATCH/DELETE requests validated against `X-CSRF-Token` header.
   - Stripe webhook endpoint exempt (uses Stripe's own signature verification).

4. **Authentication Middleware (`utils/auth.js`)**:
   - Implements `requireAuth` to extract cookie session tokens (or `Authorization: Bearer` headers).
   - Validates active sessions against MongoDB and injects the current user profile.

5. **Directory Traversal Defense (`utils/fileUtils.js`)**:
   - Enforces clean input filenames.
   - Prevents path modifications by rejecting double-dots (`..`), slash commands, or unapproved directories.

6. **Code Sanitization (`utils/sanitizeCode.js`)**:
   - Scans all generated extension code to block malicious behavior.
   - Prevents `eval()`, `new Function()`, `document.write()`, crypto miners, external trackers, insecure URLs, data exfiltration, and code obfuscation.

7. **Manifest Permission Auditing (`utils/validateExtensionOutput.js`)**:
   - Blocks high-risk permissions: `debugger`, `proxy`, `vpnProvider`, `nativeMessaging`.
   - Warns on sensitive permissions: `webRequest`, `cookies`, `history`, `management`, `browsingData`.
   - CSP audit to block `unsafe-eval` and `unsafe-inline`.

8. **API Rate Limiting (`utils/rateLimiter.js`)**:
   - Sliding window rate limiter with automatic cleanup.
   - Developer bypass is **environment-gated** — impossible in production (`NODE_ENV=production`).
   - Requires `RATE_LIMIT_BYPASS_SECRET` env var to match header (dev/test only).

9. **Prompt Injection Guard (`utils/promptGuard.js`)**:
   - Detects 13+ injection patterns (role reassignment, jailbreak, system prompt extraction, filter bypass).
   - Enforces 5000-character prompt length limit.
   - Flags dangerous intent (data theft, keyloggers, cryptomining, phishing) as soft warnings.

10. **Cross-File Reference Integrity (`utils/crossFileChecker.js`)**:
    - Validates manifest.json references (`default_popup`, `service_worker`, `content_scripts`, etc.).
    - Validates HTML `<script src="">` and `<link href="">` references.
    - Detects broken references (files referenced but not generated).

---

## 🧠 AI Generation Pipeline

The code generation engine uses a **self-healing validation pipeline** with tuned LLM parameters:

### Generation Config
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `temperature` | 0.15 | Low randomness for deterministic, reliable code |
| `topP` | 0.9 | Nucleus sampling threshold |
| `topK` | 40 | Top-K token selection |
| `maxOutputTokens` | 32,768 | Sufficient for large multi-file extensions |
| `timeout` | 60s | Generous timeout for complex generations |

### Multi-Shot System Prompt
The system prompt includes 3 golden few-shot examples covering:
1. **Popup-Only** — Simple extension (Color Picker)
2. **Content Script** — DOM-manipulating extension (Word Counter)
3. **Background + Storage** — Persistent data extension (Quick Notes)

### Self-Healing Validation Pipeline
```
User Prompt → Injection Guard → LLM Generate → Parse JSON
    → Security Scan → Manifest Validation → Cross-File Check
    → [Errors?] → Re-prompt LLM with errors → Validate again
    → [Still errors?] → Re-prompt (max 2 attempts) → Validate
    → [All passed] → Write files → ZIP → Return
```

- Up to **2 self-correction attempts** where the LLM receives its own validation errors and fixes them.
- Falls back to **Smart Mock Mode** if the Gemini API is unavailable.

## 🔌 API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create a new user account. Returns session token. |
| `POST` | `/api/auth/login` | Authenticates credentials. Sets HttpOnly cookie. |
| `POST` | `/api/auth/logout` | Invalidates and deletes the session from MongoDB. |
| `GET` | `/api/auth/me` | Returns the logged-in user profile and subscription status. |

### Projects & Operations (`/api/projects`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | Lists all projects owned by the logged-in user. |
| `GET` | `/api/projects/:id` | Returns a project with all version histories. |
| `PATCH` | `/api/projects/:id/rename` | Renames a project. |
| `DELETE` | `/api/projects/:id` | Permanently deletes a project and all versions. |
| `GET` | `/api/projects/:id/versions/:vid/preview/*` | Serves a version's static asset with correct MIME headers. |
| `GET` | `/api/projects/:id/versions/:vid/download` | Zips a version's files on-the-fly and streams the `.zip`. |

### Generation Pipeline (`/api/extensions`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/extensions/generate` | Generates or iterates an extension. Body: `{ projectName, prompt, projectId? }` |

### Stripe Billing (`/api/stripe`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/stripe/create-checkout-session` | Creates a Stripe Checkout session for premium upgrade. |
| `POST` | `/api/stripe/webhook` | Receives Stripe webhook events (subscription lifecycle). |
| `POST` | `/api/stripe/portal` | Creates a Stripe Customer Portal session for managing subscriptions. |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check endpoint for monitoring and load balancers. |

---

## 💳 Stripe Subscription Integration

The platform uses **Stripe Checkout** for premium subscriptions:

1. **Checkout Flow**: Authenticated user clicks "Upgrade" → backend creates a Stripe Checkout session → user is redirected to Stripe's hosted payment page → on success, webhook updates the user's tier to `premium`.
2. **Webhook Events Handled**:
   - `checkout.session.completed` — Upgrades user to premium.
   - `customer.subscription.deleted` — Reverts user to free tier.
   - `customer.subscription.updated` — Syncs subscription status changes.
   - `invoice.payment_failed` — Logs payment failure.
3. **Customer Portal**: Premium users can manage their subscription (cancel, update payment method) via Stripe's hosted portal.

---

## 🤖 Smart Mock Mode Heuristics (Offline Dev-friendly)

If you are developing locally without an active Gemini API key, the server falls back to an intelligent mock heuristic model:
- **Style Overrides**: Detects color strings in prompts and modifies styling rules.
- **Manifest Increments**: Automatically increments manifest.json `version` on iterations.
- **Code Annotations**: Prepends timeline iteration commentaries inside generated JS scripts.
- This ensures 100% of the SaaS features can be verified offline without an API key.

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Optional | Google AI Studio API key for Gemini 2.5 Flash. Falls back to mock mode if absent. |
| `MONGO_URI` | Yes | MongoDB connection string (e.g., `mongodb://localhost:27017/extensio`). |
| `PORT` | Optional | Server port (default: `4000`). |
| `NODE_ENV` | Optional | Environment mode: `development`, `test`, or `production`. |
| `ALLOWED_ORIGINS` | Optional | Comma-separated list of allowed CORS origins (default: `http://localhost:4000,http://localhost:3000`). |
| `RATE_LIMIT_BYPASS_SECRET` | Optional | Secret for dev/test rate limiter bypass header. Disabled in production. |
| `STRIPE_SECRET_KEY` | Optional | Stripe API secret key for payment processing. |
| `STRIPE_PUBLISHABLE_KEY` | Optional | Stripe publishable key (used by frontend). |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signing secret for signature verification. |
| `STRIPE_PRICE_ID` | Optional | Stripe Price ID for the premium subscription product. |
| `APP_URL` | Optional | Public URL of the application (default: `http://localhost:4000`). Used for Stripe redirect URLs. |

---

## 🧪 Running & Verifying Natively

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
   GEMINI_API_KEY=your_key_here  # Optional
   NODE_ENV=development
   ALLOWED_ORIGINS=http://localhost:4000,http://localhost:3000
   STRIPE_SECRET_KEY=sk_test_xxx  # Optional
   STRIPE_WEBHOOK_SECRET=whsec_xxx  # Optional
   STRIPE_PRICE_ID=price_xxx  # Optional
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
   ```bash
   RATE_LIMIT_BYPASS_SECRET=developer-secret node test-e2e.js
   ```
