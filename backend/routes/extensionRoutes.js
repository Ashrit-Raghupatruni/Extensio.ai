import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { generateExtensionZip } from "../services/extensionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");

const router = express.Router();

/**
 * POST /api/extensions/generate
 * Receives a prompt + projectName, generates a Chrome extension via LLM,
 * packages it into a ZIP, and returns a download URL.
 */
router.post("/generate", async (req, res) => {
  try {
    const { prompt, projectName } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "A non-empty 'prompt' string is required." });
    }

    if (!projectName || typeof projectName !== "string" || projectName.trim().length === 0) {
      return res.status(400).json({ error: "A non-empty 'projectName' string is required." });
    }

    // Limit prompt length to prevent abuse
    if (prompt.length > 5000) {
      return res.status(400).json({ error: "Prompt is too long. Maximum 5000 characters." });
    }

    const result = await generateExtensionZip(prompt.trim(), projectName.trim());
    res.json(result);
  } catch (error) {
    console.error("[extension/generate] Error:", error.message);
    res.status(500).json({
      error: error.message || "Failed to generate extension.",
    });
  }
});

/**
 * GET /api/extensions/download/:filename
 * Serves a generated ZIP file with proper Content-Disposition header.
 * Validates filename to prevent path traversal.
 */
router.get("/download/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    // Block path traversal
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\") ||
      !filename.endsWith(".zip")
    ) {
      return res.status(400).json({ error: "Invalid filename." });
    }

    const filePath = path.join(DOWNLOADS_DIR, filename);

    // Check file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: "File not found." });
    }

    const stats = await fs.stat(filePath);

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": stats.size,
    });

    // Use Express sendFile for proper streaming
    res.sendFile(filePath);
  } catch (error) {
    console.error("[extension/download] Error:", error.message);
    res.status(500).json({ error: "Failed to download file." });
  }
});

export default router;
