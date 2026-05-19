# Extensio.ai

A No-code Chrome extension generator platform.

## Overview

Extensio.ai is a full-stack platform that takes a user prompt, generates a complete Chrome extension (Manifest V3, scripts, HTML, CSS) via OpenAI, safely writes the files to a temporary workspace, packs them into a `.zip` archive, and serves them for immediate download. 

It features a built-in modern frontend UI for testing the complete "Prompt → AI → Files → ZIP → Download" flow.

## Features

- **Flexible AI Generation**: Automatically generates complete extensions (manifests, background workers, popup scripts, styles, etc.).
- **Security Hardened**: Includes robust path traversal prevention, strict filename/extension allowlists, and JSON validation.
- **Mock Mode**: If no OpenAI API key is provided, the backend falls back to a mock mode, generating a dummy extension so you can test the packaging and download flow safely without burning credits.
- **Single-Page UI**: A sleek, glassmorphic UI served directly from Express with live generation logs.
- **Automated Cleanup**: A background cron job automatically cleans up old temporary files and ZIP downloads to manage disk space.

## Setup

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` in your environment (Optional: leave blank to test using Mock Mode).
2. Run `npm install` to install dependencies.
3. Start the server with `npm run dev`.
4. Open `http://localhost:4000` in your browser to use the Extensio.ai UI.

## Endpoints

### Extensions
- `POST /api/extensions/generate`
  - Body: `{ "prompt": "...", "projectName": "..." }`
  - Response: `{ "downloadUrl": "/api/extensions/download/<file>.zip", "projectId": "...", "files": { ... }, "fileList": [ ... ] }`
  - Generates the extension files and creates a ZIP archive.
  
- `GET /api/extensions/download/:filename`
  - Serves the generated `.zip` file with proper download headers.

### Projects
- `GET /api/projects`
  - Lists saved extension projects.
  
- `GET /api/projects/:id`
  - Returns a saved project by ID.
  
- `POST /api/projects/save`
  - Body: `{ "id": "optional", "projectName": "...", "prompt": "...", "files": { ... } }`
  - Saves or updates a project.

### System
- `GET /api/health`
  - Health check endpoint returning server status and uptime.

## Notes

- Generated `manifest.json` is strictly validated to ensure `manifest_version: 3` before the archive is created.
- Downloads are served securely using Express `sendFile`.
- Saved projects are persisted locally in `data/projects.json`.
