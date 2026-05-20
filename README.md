# ✦ Extensio.ai — Text-to-Extension SaaS Platform

**Extensio.ai** is a complete, containerized SaaS-style developer platform that converts natural language text descriptions into production-ready Chrome Extensions (Manifest V3, HTML, CSS, JavaScript). 

Featuring user session authentication, dynamic database state persistence in MongoDB, a chronological version history timeline, a beautiful interactive Code Studio viewer, and on-the-fly zip packaging, it provides a seamless feedback loop for designing, inspecting, and refining extensions in real-time.

---

## 🏛️ System Architecture & Separation of Concerns

Extensio.ai is designed around a modern **split-directory architectural model** to keep concerns cleanly decoupled:

```
Project 3 - Text-to-Extension Developer Platform/
├── docker-compose.yml     # Multi-container orchestration (App & MongoDB Stack)
├── README.md              # Global project overview & run instructions
│
├── frontend/              # Frontend Client Subsystem (Static UI SPA)
│   ├── index.html         # Glassmorphic SaaS workspace UI and Client logic
│   └── README.md          # Frontend layout & style guide documentation
│
└── backend/               # Backend Server Subsystem (Express Service)
    ├── server.js          # Main entrypoint & dynamic folder router
    ├── models/            # Mongoose MongoDB Data Schemas
    ├── routes/            # REST API endpoint definitions
    ├── services/          # OpenAI generation and file zip processors
    ├── utils/             # Scrypt auth, database connections, and volume helpers
    ├── test-e2e.js        # Automated End-To-End validation suite
    ├── Dockerfile         # Container building specifications
    └── README.md          # API endpoints, schemas, & testing documentation
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
*   **Engine**: Gemini 1.5 Flash (via Google AI Studio) & Llama 3 (via Groq).
*   **Philosophy**: Generative multi-file workflows (simultaneously compiling `manifest.json`, `popup.html`, `popup.css`, and `popup.js`) demand expansive context windows and fast inference. Gemini 1.5 Flash provides the reasoning capacity to ingest historical codebase states and merge user modification requests seamlessly.
*   **Role**: Analyzes current files, accepts iterative prompt modifiers (e.g., *"Make button light violet"*), performs structural code merging, and yields valid production-ready Chrome Extension scripts.

#### 2. 💾 The Memory (Database Layer)
*   **Engine**: MongoDB Document & Version Persistence.
*   **Philosophy**: Running in stateless containerized environments (Docker) means we avoid writing active project codebases directly to local disk mounts. Instead, all projects, prompts, chronological history timestamps, and BSON-mapped multi-file version nodes are stored directly inside MongoDB.
*   **Role**: Keeping session authentication data and hierarchical extension versions in a single MongoDB repository enables instant context recovery and real-time version rollback switches.

#### 3. ⚙️ The Orchestrator (Backend Reasoning Hub)
*   **Engine**: LangChain.js / Custom Multi-File Iteration Controllers.
*   **Philosophy**: Governs the orchestration loop and guarantees safety bounds across generations.
*   **Role**: Manages the iterative compilation flow:
    $$\text{User Iteration Prompt} + \text{Previous Extension Files} \longrightarrow \text{Context Aggregation} \longrightarrow \text{OpenAI/Gemini Prompt Synthesis} \longrightarrow \text{BSON Version Commit}$$
    It enforces strict directory traversal protections, validates `manifest_version: 3` compliance, and runs **Smart Mock Heuristics** to execute offline development seamlessly when API keys are absent.

#### 4. 📺 The Interface (Interaction & Preview Simulation)
*   **Engine**: Vanilla CSS Glassmorphism / Client-Side Event Hooks.
*   **Philosophy**: Speed and interactivity are critical for developer workflows.
*   **Role**: We engineered a custom **Chrome Extension popover simulator** using an isolated, sandboxed `<iframe>`. The client SPA interfaces with wildcard API streams (`/api/projects/:id/versions/:versionId/preview/*`), serving files with strict MIME type headers (`text/html`, `text/css`, `application/javascript`) directly from MongoDB to enable instant hot-reloading when navigating version histories.

---

## 🐳 Infrastructure Essentials

To ensure strict environment parity and deliver enterprise-ready SaaS integrations, this portfolio utilizes:
*   **Docker & Docker Compose**: Enforces absolute environment isolation and portability across dev, staging, and production clusters.
*   **Puppeteer**: Headless rendering library used to compile and export pixel-perfect, printable PDF documents.
*   **Stripe**: Payment rails managing subscription plans, credit tiers, webhooks, and secure transaction handling.

---

## 🌟 Premium Core Features

- **Multi-Container Architecture**: Single-command containerization for MongoDB (`db`) and Node Express (`app`) via Docker Compose.
- **Glassmorphic SaaS Dashboard SPA**: Stunning, responsive dashboard featuring deep indigo palettes, glowing card layouts, interactive modals, and micro-animations.
- **Secure PBKDF2/scrypt Authentication**: Cryptographically signed sessions using Node's native `crypto` libraries. Persisted in MongoDB with **Time-To-Live (TTL) indexing** for automatic cookie expiration.
- **Chronological Version History**: A tracking timeline documenting prompts, timestamp logs, and previous versions. Instantly toggle between versions in a visual explorer.
- **Interactive Code Studio**: An explorer featuring a nested file list tree and a monospace code viewer panel with single-click copy-to-clipboard functionality.
- **AI Modification & Iteration Console**: A feedback prompt interface enabling updates (e.g., *"Make button light violet instead of red"*) that merges AI changes into the codebase and commits a new version.
- **Interactive Live Extension Preview**: Side-by-side Live Preview segmented controller that mimics a Chrome Extension popup card. It executes the active version's `popup.html`, `popup.css`, and `popup.js` inside an isolated, sandboxed `<iframe>`, resolving relative asset paths dynamically from MongoDB.
- **Real-Time Hot-Reloading & Event Controls**: Instantly reloads the preview environment when switching between version timeline entries, committing new AI changes, or clicking the manual refresh button.
- **Offline Smart Mock Mode**: Development fallback heuristic mechanism that changes styling, increments manifest version integers, and adds comments to codebases offline when `OPENAI_API_KEY` is not present.
- **On-the-Fly ZIP Streaming**: Compiles and streams the `.zip` archive of any selected version directly from MongoDB binary mappings, avoiding hard disk bloat.
- **Disk Cleaners**: Dynamic background scheduler that cleans up older temporary server directories automatically.

---

## 🛠️ Verification: E2E Integration Test Suite

We've written an automated integration test suite ([backend/test-e2e.js](file:///c:/Users/ashri/webDev%20-%20Internship/Project%203%20-%20Text-to-Extension%20Developer%20Platform/backend/test-e2e.js)) that exercises the complete system flow.

All 12 integration steps pass successfully:
```
🚀 STARTING END-TO-END VERIFICATION TESTS...
Using Base URL: http://localhost:4000/api

[Test 1] Registering a new user... ✅ Registration successful!
[Test 2] Fetching user profile details via /auth/me... ✅ Profile retrieved successfully!
[Test 3] Creating a new extension project "Tab Tracker"... ✅ Extension generated successfully! ( manifest.json, popup.html created )
[Test 4] Requesting modification: "change button background to violet"... ✅ Iteration applied! (Smart Mock Verified: Button background is violet)
[Test 5] Fetching complete project details with version history... ✅ Multiversioning verified: 2 versions stored correctly in MongoDB.
[Test 5.5] Querying Live Preview asset popup.html for Version 2... ✅ Live Preview asset retrieved successfully! (Content-Type: text/html; charset=utf-8)
[Test 6] Downloading Version 2 ZIP archive on-the-fly... ✅ ZIP package received successfully! (1259 bytes)
[Test 7] Renaming project to "Tab Tracker Elite"... ✅ Project renamed successfully!
[Test 8] Listing projects on SaaS Dashboard... ✅ Dashboard list verified! Found project "Tab Tracker Elite" (v2).
[Test 9] Deleting project... ✅ Project deleted successfully!
[Test 10] Verifying deletion in database... ✅ Deletion verified! Project is no longer retrievable (HTTP 404).
[Test 11] Logging out and ending session... ✅ Session logged out successfully!

🎉 ALL TESTS PASSED SUCCESSFULLY!
```

---

## 🚀 How to Run the Application

You can execute the stack either through **Docker Compose (Recommended)** or **Natively** on your machine.

### Method A: Docker Compose (1-Click Execution)

#### Prerequisites
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ensure the docker daemon is active).

#### Steps
1. Navigate to the project root directory:
   ```bash
   cd "Project 3 - Text-to-Extension Developer Platform"
   ```
2. Create/update a `.env` file in the root or `backend` folder (Optional: add `GEMINI_API_KEY` to enable active AI iterations, otherwise Smart Mock Mode runs offline):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
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
   ```
4. Start the server (runs with nodemon hot-reload support):
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to **[http://localhost:4000](http://localhost:4000)** (which will dynamically read the frontend files from the sibling directory `/frontend`).
6. Run the integration test suite to verify connection status:
   ```bash
   node test-e2e.js
   ```
