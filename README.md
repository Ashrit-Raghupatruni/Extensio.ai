# Extensio.ai

No-code Chrome extension generator backend for Project 3.

## Overview

This Node.js backend receives a user prompt, generates a Chrome extension manifest and source files via OpenAI, writes them to a temporary workspace, packs them into a `.zip`, and serves an immediate download link.

## Endpoints

- `POST /api/extensions/generate`
  - Body: `{ "prompt": "...", "projectName": "..." }`
  - Response: `{ "downloadUrl": "/downloads/<file>.zip", "projectId": "...", "files": { ... } }`

- `GET /api/projects`
  - Lists saved extension projects.

- `GET /api/projects/:id`
  - Returns a saved project by ID.

- `POST /api/projects/save`
  - Body: `{ "id": "optional", "projectName": "...", "prompt": "...", "files": { ... } }`
  - Saves or updates a project.

## Setup

1. Copy `.env.example` or set `OPENAI_API_KEY` in your environment.
2. Run `npm install`.
3. Start with `npm start` or `npm run dev`.

## Notes

- Generated `manifest.json` is validated as JSON before the archive is created.
- Downloads are served from `/downloads`.
- Saved projects are persisted in `data/projects.json`.
