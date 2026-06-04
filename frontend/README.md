# ✦ Extensio.ai — Frontend Single Page Application (SPA)

This directory contains the user-facing client application for **Extensio.ai**—a state-of-the-art SaaS platform for text-to-extension generation, complete with version history exploration, iterative editing, subscription management, and CSRF-protected API communication.

---

## 🎨 Design & Aesthetic Excellence

The client-side interface has been designed from the ground up as a **premium, glassmorphic Single Page Application** to deliver a premium user experience:

- **Premium Color Palette**: Built on a curated, deep indigo dark theme with vibrant glassmorphic gradients and animated background grids.
- **Modern Typography**: Uses Google Fonts' premium **Outfit** for headings and **Inter** for readable body text, moving away from browser defaults.
- **Dynamic Micro-animations**: Implements subtle transitions on interactive elements, hover-state card glowing, active version status indicators, and smooth state transitions.
- **Glassmorphic Panels**: Visual containers leverage `backdrop-filter: blur(12px)` combined with subtle translucent borders (`rgba(255, 255, 255, 0.08)`) to create depth.
- **Responsive Split Layout**: Features a flexible grid-based design that adapts gracefully across viewport sizes—adjusting the layout from side-by-side workspace split to single-panel screens dynamically.

---

## 🚀 Key Features

1. **Self-Contained Auth Module**: Modern registration and login views with client-side field validation and secure cookie/session integration.
2. **Interactive Project Dashboard**: Grid view of all generated extension projects displaying name, prompt description, generation timestamp, and total version counts.
3. **Subscription Badge & Upgrade Flow**:
   - Displays a `FREE` or `⭐ PRO` badge next to the username in the header.
   - Free users see an "Upgrade" button that redirects to **Stripe Checkout** for premium subscription.
   - Premium users can click the `⭐ PRO` badge to open the **Stripe Customer Portal** for managing their subscription.
   - Handles `?upgrade=success` and `?upgrade=cancelled` URL parameters for post-checkout feedback.
4. **Chronological Version History Timeline**: Left-hand navigation panel mapping each code iteration's prompt, timestamp, and version count. Clicking any historical node instantly loads that exact version in the Code Studio.
5. **Code Studio Workspace**: A side-by-side terminal, file list explorer, and segmented workspace:
   - **Segmented Controllers**: High-performance tabs to toggle between **Code View** and **Live Preview** seamlessly.
   - **Nested File Tree**: Chronologically displays file structures of the selected extension version (`manifest.json`, `popup.html`, etc.).
   - **Monospace Code Editor**: Sleek syntax-mocked read-only view with an instant **Copy to Clipboard** button.
   - **Live Extension Popover Simulator**: An interactive simulated Chrome popup window frame complete with simulated address bars, extension secure protocol markers, and a manual refresh trigger.
6. **Modify & Iterate Feedback Loop**: Input panel enabling users to request amendments (e.g., *"Make button light violet instead of red"*) that automatically commits a new version to the database.
7. **Real-time Live Compilation Terminal**: Embedded developer terminal output showing compilation, security validation, and generation logs in real-time.
8. **Direct ZIP Streaming**: Download button triggering server-side on-the-fly zip archival of the selected historical codebase.

---

## 🔐 Security Features

- **CSRF Protection**: All state-changing API calls (POST, PUT, PATCH, DELETE) automatically include an `X-CSRF-Token` header via the `apiFetch()` wrapper function. The token is read from the `extensio_csrf` cookie set by the backend.
- **XSS Prevention**: All user-generated content (project names, prompts) is escaped using `escapeHTML()` before rendering to prevent stored XSS attacks.
- **Secure Authentication**: Session cookies are HttpOnly with SameSite protection. Bearer token support for programmatic access.

---

## 📁 File Structure

```
frontend/
├── index.html     # Monolithic Single-Page Application (HTML structure, CSS variables, & client logic)
└── README.md      # Documentation of the frontend client
```

- **index.html**: Combines structural semantic HTML5, highly polished responsive CSS, and clean modular JavaScript to manage API communications, state management, and UI rendering without bloating package sizes or requiring bundlers.

---

## ⚙️ Running the Frontend

The frontend is served dynamically by the Express backend.

### Running with Docker Compose (Recommended)
1. Ensure the root `docker-compose.yml` is active.
2. The frontend is mounted dynamically into the container at `/usr/src/frontend` and served via `express.static()`.
3. Open `http://localhost:4000` to interact.

### Running Natively / Separately
1. The backend automatically detects the separation. When running the server via `node server.js` from the `backend/` folder, Express will search for `index.html` at `../frontend` relative to the backend path.
2. Alternatively, you can serve this folder using any standard lightweight static server (e.g., `npx serve`) but you will need to ensure the CORS requests connect to the backend running at `http://localhost:4000`.
