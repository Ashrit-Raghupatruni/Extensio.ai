# ✦ Extensio.ai — Text-to-Extension

**Extensio.ai** is a complete, containerized SaaS-style developer platform that converts natural language text descriptions into production-ready Chrome Extensions (Manifest V3, HTML, CSS, JavaScript). 

Featuring user session authentication, Stripe-powered subscription billing, CSRF-protected APIs, dynamic database state persistence in MongoDB, a chronological version history timeline, a beautiful interactive Code Studio viewer, **multi-layer security scanning**, and on-the-fly zip packaging, it provides a seamless feedback loop for designing, inspecting, and refining extensions in real-time.

---

## 🏛️ System Architecture & Separation of Concerns

Extensio.ai is designed around a modern **split-directory architectural model** to keep concerns cleanly decoupled:

```
Project 3 - Text-to-Extension Developer Platform/
├── docker-compose.yml       # Multi-container orchestration (App & MongoDB Stack)
├── render.yaml              # Render.com Infrastructure-as-Code deployment blueprint
├── README.md                # Global project overview & run instructions
│
├── .github/
│   └── workflows/
│       └── deploy.yml       # CI/CD pipeline (E2E tests + auto-deploy)
│
├── frontend/                # Frontend Client Subsystem (Static UI SPA)
│   ├── index.html           # Glassmorphic SaaS workspace UI and Client logic
│   └── README.md            # Frontend layout & style guide documentation
│
└── backend/                 # Backend Server Subsystem (Express Service)
    ├── server.js            # Main entrypoint & dynamic folder router
    ├── models/              # Mongoose MongoDB Data Schemas
    │   ├── User.js          # User accounts, subscription tiers, Stripe IDs
    │   ├── Session.js       # Auth session tokens with TTL indexing
    │   └── Project.js       # Extension projects with versioned file histories
    ├── routes/              # REST API endpoint definitions
    │   ├── authRoutes.js    # Registration, login, logout, profile
    │   ├── extensionRoutes.js  # AI generation pipeline
    │   ├── projectRoutes.js    # Project CRUD, version preview, ZIP download
    │   └── stripeRoutes.js     # Stripe Checkout, webhooks, Customer Portal
    ├── services/            # Gemini generation and file zip processors
    │   ├── extensionService.js  # AI orchestration, JSON extraction, zipping
    │   └── projectService.js    # Project persistence logic
    ├── utils/               # Security, auth, database, and rate limiters
    │   ├── auth.js              # Session-based authentication middleware
    │   ├── csrfProtection.js    # CSRF token generation & validation
    │   ├── db.js                # MongoDB connection manager
    │   ├── fileUtils.js         # Path traversal protection & file sanitization
    │   ├── rateLimiter.js       # Sliding window rate limiter (env-gated bypass)
    │   ├── sanitizeCode.js      # AI-generated code security scanner
    │   ├── subscription.js      # Free/premium tier gating logic
    │   └── validateExtensionOutput.js  # Manifest V3 & permission auditor
    ├── test-e2e.js          # Automated End-To-End validation suite (13 tests)
    ├── Dockerfile           # Multi-stage production container build
    ├── .env.example         # Environment variable template
    └── README.md            # API endpoints, schemas, & testing documentation
```

### 🔗 Dynamic Static Folder Resolution
To facilitate testing both inside Docker and natively on the host, the Express backend uses a **dynamic static asset resolution system**:
1. Checks for a local `public/index.html` within the backend folder.
2. If absent, it automatically falls back to serving the adjacent `../frontend` workspace.
3. In Docker, the host `./frontend` directory is mapped directly as a development volume mount (`/usr/src/frontend`), allowing real-time client UI rendering without recompilations.

---

## 🧠 Tech Stack Deep Dive: Building Cognitive Architectures

Extensio.ai is designed not merely as a simple AI prompt wrapper, but as a comprehensive **Cognitive Architecture** that handles memory persistence, multi-file reasoning, structured generation, and real-time interactive simulation:

### The AI Component Layers

#### 1. 🧠 The Brain (Reasoning Layer)
*   **Engine**: Gemini 2.5 Flash (via Google AI Studio).
*   **Philosophy**: Generative multi-file workflows (simultaneously compiling `manifest.json`, `popup.html`, `popup.css`, and `popup.js`) demand expansive context windows and fast inference. Gemini 2.5 Flash provides the reasoning capacity to ingest historical codebase states and merge user modification requests seamlessly.
*   **Role**: Analyzes current files, accepts iterative prompt modifiers (e.g., *"Make button light violet"*), performs structural code merging, and yields valid production-ready Chrome Extension scripts.

#### 2. 💾 The Memory (Database Layer)
*   **Engine**: MongoDB Document & Version Persistence.
*   **Philosophy**: Running in stateless containerized environments (Docker) means we avoid writing active project codebases directly to local disk mounts. Instead, all projects, prompts, chronological history timestamps, and BSON-mapped multi-file version nodes are stored directly inside MongoDB.
*   **Role**: Keeping session authentication data and hierarchical extension versions in a single MongoDB repository enables instant context recovery and real-time version rollback switches.

#### 3. ⚙️ The Orchestrator (Backend Reasoning Hub)
*   **Engine**: Custom Multi-File Iteration Controllers.
*   **Philosophy**: Governs the orchestration loop and guarantees safety bounds across generations.
*   **Role**: Manages the iterative compilation flow and enforces strict directory traversal protections, validates `manifest_version: 3` compliance, runs **multi-layer security scans**, and executes **Smart Mock Heuristics** for offline development.

#### 4. 📺 The Interface (Interaction & Preview Simulation)
*   **Engine**: Vanilla CSS Glassmorphism / Client-Side Event Hooks.
*   **Philosophy**: Speed and interactivity are critical for developer workflows.
*   **Role**: We engineered a custom **Chrome Extension popover simulator** using an isolated, sandboxed `<iframe>`. The client SPA interfaces with wildcard API streams, serving files with strict MIME type headers directly from MongoDB to enable instant hot-reloading when navigating version histories.

#### 5. 💳 The Commerce Layer (Stripe Billing)
*   **Engine**: Stripe Checkout + Webhooks + Customer Portal.
*   **Philosophy**: Monetization should be frictionless. Users upgrade via Stripe's hosted payment page — no credit card forms to build or PCI compliance to manage.
*   **Role**: Handles checkout sessions, subscription lifecycle events (created, updated, cancelled, payment failures), and self-service subscription management via Stripe Customer Portal.

---

## 🐳 Infrastructure Essentials

*   **Docker & Docker Compose**: Enforces absolute environment isolation and portability across dev, staging, and production clusters.
*   **Render.com Deployment**: Infrastructure-as-Code via `render.yaml` for one-click cloud deployment with managed MongoDB.
*   **GitHub Actions CI/CD**: Automated E2E testing on every push, auto-deploy to production on merge to `main`.
*   **Stripe**: Payment rails managing subscription plans, webhooks, and secure transaction handling.

---

## 🌟 Premium Core Features

- **Multi-Container Architecture**: Single-command containerization for MongoDB (`db`) and Node Express (`app`) via Docker Compose.
- **Glassmorphic SaaS Dashboard SPA**: Stunning, responsive dashboard featuring deep indigo palettes, glowing card layouts, interactive modals, and micro-animations.
- **Secure PBKDF2/scrypt Authentication**: Cryptographically signed sessions using Node's native `crypto` libraries. Persisted in MongoDB with **Time-To-Live (TTL) indexing** for automatic cookie expiration.
- **Stripe Subscription Billing**: Premium upgrade via Stripe Checkout → webhook-driven tier changes → Customer Portal for self-service management. Subscription badge (`FREE` / `⭐ PRO`) displayed in the UI header.
- **Chronological Version History**: A tracking timeline documenting prompts, timestamp logs, and previous versions. Instantly toggle between versions in a visual explorer.
- **Interactive Code Studio**: An explorer featuring a nested file list tree and a monospace code viewer panel with single-click copy-to-clipboard functionality.
- **AI Modification & Iteration Console**: A feedback prompt interface enabling updates (e.g., *"Make button light violet instead of red"*) that merges AI changes into the codebase and commits a new version.
- **Interactive Live Extension Preview**: Side-by-side Live Preview segmented controller that mimics a Chrome Extension popup card. It executes the active version's `popup.html`, `popup.css`, and `popup.js` inside an isolated, sandboxed `<iframe>`, resolving relative asset paths dynamically from MongoDB.
- **Real-Time Hot-Reloading & Event Controls**: Instantly reloads the preview environment when switching between version timeline entries, committing new AI changes, or clicking the manual refresh button.
- **Offline Smart Mock Mode**: Development fallback heuristic mechanism that changes styling, increments manifest version integers, and adds comments to codebases offline when `GEMINI_API_KEY` is not present.
- **On-the-Fly ZIP Streaming**: Compiles and streams the `.zip` archive of any selected version directly from MongoDB binary mappings, avoiding hard disk bloat.
- **Disk Cleaners**: Dynamic background scheduler that cleans up older temporary server directories automatically.

---

## 🛡️ Security & Sanitization Layer

Extensio.ai implements a **multi-layer security pipeline** that audits every AI-generated extension before it reaches the user:

### HTTP Security Headers (`helmet`)
All responses include production-grade security headers:
- **Content-Security-Policy**: Strict CSP directives limiting scripts, styles, fonts, frames, and connections.
- **X-Frame-Options**: Prevents clickjacking attacks.
- **Strict-Transport-Security**: Enforces HTTPS in production.
- **X-Content-Type-Options**: Prevents MIME sniffing.

### CORS Restriction
- Origins restricted to `ALLOWED_ORIGINS` environment variable.
- Rejects all cross-origin requests from unauthorized domains.

### CSRF Protection (`utils/csrfProtection.js`)
- Double-submit cookie pattern using `extensio_csrf` cookie.
- All POST/PUT/PATCH/DELETE requests require matching `X-CSRF-Token` header.
- Frontend `apiFetch()` wrapper automatically includes the token.
- Stripe webhook exempt (uses its own signature verification).

### Code Sanitization Engine (`utils/sanitizeCode.js`)
Scans all generated files for dangerous patterns and rejects extensions containing:

| Category | What's Blocked |
|---|---|
| **Code Execution** | `eval()`, `new Function()`, `setTimeout/setInterval` with string arguments |
| **Script Injection** | `<script src="http://...">`, `document.write()` |
| **Crypto Miners** | References to known mining domains (coinhive.com, crypto-loot.com, jsecoin.com, etc.) |
| **Hidden Trackers** | Known tracking domains, 1x1 pixel tracking images |
| **Insecure URLs** | All non-HTTPS external URLs (allows localhost) |
| **Data Exfiltration** | `navigator.sendBeacon()`, insecure WebSocket connections |
| **Obfuscation** | Long `String.fromCharCode()` chains, bulk hex escape sequences |

### Manifest Permission Validator (`utils/validateExtensionOutput.js`)
Audits Chrome API permissions declared in `manifest.json`:

- **Blocked entirely**: `debugger`, `proxy`, `vpnProvider`, `nativeMessaging`
- **Flagged as warnings**: `webRequest`, `cookies`, `history`, `management`, `browsingData`
- **CSP enforcement**: Rejects `unsafe-eval` and `unsafe-inline` in content security policies
- **Host permission audit**: Warns on `<all_urls>` or `*://*/*` broad access patterns

### Backend Rate Limiting (`utils/rateLimiter.js`)
Lightweight, in-memory sliding window rate limiter with automatic cleanup:

| Endpoint | Window | Max Requests |
|---|---|---|
| `POST /api/auth/register` | 15 min | 5 |
| `POST /api/auth/login` | 15 min | 10 |
| `POST /api/extensions/generate` | 1 min | 3 |
| Global API fallback | 1 min | 60 |

Returns `429 Too Many Requests` with `Retry-After` and `X-RateLimit-*` headers.  
**Note**: Developer bypass is environment-gated — disabled in production (`NODE_ENV=production`).

---

## 🛠️ Verification: E2E Integration Test Suite

We've written an automated integration test suite (`backend/test-e2e.js`) that exercises the complete system flow including security audits.

All 14 integration steps pass successfully:
```
🚀 STARTING END-TO-END VERIFICATION TESTS...

[Test 1]  Registering a new user... ✅ Registration successful!
[Test 2]  Fetching user profile... ✅ Profile retrieved!
[Test 3]  Creating extension "Tab Tracker"... ✅ Generated!
[Test 4]  Modification: "change button to violet"... ✅ Iteration applied!
[Test 5]  Fetching version history... ✅ 2 versions in MongoDB
[Test 5.5] Live Preview asset popup.html... ✅ MIME text/html verified
[Test 6]  Downloading ZIP archive... ✅ ZIP received!
[Test 7]  Renaming project... ✅ Renamed!
[Test 8]  Listing dashboard projects... ✅ Verified!
[Test 9]  Deleting project... ✅ Deleted!
[Test 10] Verifying deletion... ✅ HTTP 404 confirmed
[Test 10.5] Subscription gating... ✅ Stripe-simulated upgrade verified!
[Test 11] Session logout... ✅ Logged out!
[Test 12] Security sanitization audit... ✅ eval() BLOCKED, crypto miners BLOCKED, clean code PASSED
[Test 13] Rate limiter verification... ✅ HTTP 429 triggered

🎉 ALL TESTS PASSED SUCCESSFULLY!
```

---

## 🚀 How to Run the Application

You can execute the stack either through **Docker Compose (Recommended)**, **Natively** on your machine, or deploy to the **Cloud**.

### Method A: Docker Compose (1-Click Execution)

#### Prerequisites
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ensure the docker daemon is active).

#### Steps
1. Navigate to the project root directory:
   ```bash
   cd "Project 3 - Text-to-Extension Developer Platform"
   ```
2. Create/update a `.env` file in the root or `backend` folder:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   NODE_ENV=development
   ALLOWED_ORIGINS=http://localhost:4000,http://localhost:3000
   
   # Stripe (optional — subscription features disabled if absent)
   STRIPE_SECRET_KEY=sk_test_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   STRIPE_PRICE_ID=price_xxx
   APP_URL=http://localhost:4000
   ```
3. Boot the complete multi-container stack:
   ```bash
   docker compose up -d --build
   ```
4. Access the platform:
   - Web application: Open **[http://localhost:4000](http://localhost:4000)** in your browser.
   - Database server: Accessible on standard port `27017` locally.
5. Tear down the stack when finished:
   ```bash
   docker compose down -v
   ```

---

### Method B: Native Host Execution

#### Prerequisites
- Install [Node.js](https://nodejs.org/) (v18+)
- Install and start a local [MongoDB Community Server](https://www.mongodb.com/try/download/community) locally on port `27017`.

#### Steps
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the necessary node modules:
   ```bash
   npm install
   ```
3. Copy the template `.env.example` to `.env` and adjust the variables:
   ```env
   PORT=4000
   MONGO_URI=mongodb://localhost:27017/extensio
   GEMINI_API_KEY=your_key_here
   NODE_ENV=development
   ALLOWED_ORIGINS=http://localhost:4000,http://localhost:3000
   ```
4. Start the server (runs with nodemon hot-reload support):
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to **[http://localhost:4000](http://localhost:4000)** (which will dynamically read the frontend files from the sibling directory `/frontend`).
6. Run the integration test suite to verify connection status:
   ```bash
   RATE_LIMIT_BYPASS_SECRET=developer-secret node test-e2e.js
   ```

---

### Method C: Cloud Deployment (Render)

#### One-Click Deploy
1. Push your repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
3. Connect your GitHub repo — Render will detect the `render.yaml` and auto-provision:
   - A web service running the Dockerized backend.
   - A managed MongoDB database.
4. Set the required environment variables in the Render dashboard.
5. Your app will be live at `https://your-app.onrender.com`.

#### Stripe Webhook Setup for Production
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/) → **Developers** → **Webhooks**.
2. Add an endpoint: `https://your-domain.com/api/stripe/webhook`.
3. Select events: `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`, `invoice.payment_failed`.
4. Copy the webhook signing secret to your `STRIPE_WEBHOOK_SECRET` env var.

---

## 📦 CI/CD Pipeline

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:

1. **On every push/PR to `main`**: Spins up a MongoDB service container, installs dependencies, starts the server, and runs the full E2E test suite.
2. **On merge to `main`**: Triggers an auto-deploy to Render via deploy hook.

```yaml
# Trigger: push or PR to main
# Jobs: test → deploy (only on merge)
```
