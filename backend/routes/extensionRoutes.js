import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { generateExtensionZip } from "../services/extensionService.js";
import { saveProject, getProject } from "../services/projectService.js";
import { requireAuth } from "../utils/auth.js";
import { createRateLimiter } from "../utils/rateLimiter.js";
import { checkSubscriptionLimit } from "../utils/subscription.js";

// Strict rate limit for AI generation: 3 requests per minute per user
const generateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 3,
  message: "Generation rate limit exceeded. Please wait before generating another extension.",
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");

const router = express.Router();

// Secure all extension endpoints
router.use(requireAuth);

/**
 * POST /api/extensions/generate
 * Receives a prompt + projectName, generates/updates a Chrome extension via LLM,
 * packages it into a ZIP, automatically saves it in MongoDB, and returns the project and download URL.
 */
router.post("/generate", generateLimiter, checkSubscriptionLimit, async (req, res) => {
  try {
    const { prompt, projectName, projectId } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "A non-empty 'prompt' string is required." });
    }

    if (!projectName || typeof projectName !== "string" || projectName.trim().length === 0) {
      return res.status(400).json({ error: "A non-empty 'projectName' string is required." });
    }

    if (prompt.length > 5000) {
      return res.status(400).json({ error: "Prompt is too long. Maximum 5000 characters." });
    }

    let previousFiles = null;

    // If it is an iteration, retrieve the latest files from MongoDB
    if (projectId) {
      console.log(`[extensionRoutes] Iteration requested for project ${projectId}`);
      const project = await getProject(projectId, req.user._id);
      if (!project) {
        return res.status(404).json({ error: "Project not found or access denied." });
      }

      if (project.versions && project.versions.length > 0) {
        const latestVersion = project.versions[project.versions.length - 1];
        previousFiles = latestVersion.files; // Mongoose Map
      }
    }

    // Call extension generator engine
    const result = await generateExtensionZip(prompt.trim(), projectName.trim(), previousFiles);

    // Save project / version immediately in MongoDB
    const savedProject = await saveProject({
      id: projectId || null,
      userId: req.user._id,
      projectName: projectName.trim(),
      prompt: prompt.trim(),
      files: result.files,
    });

    const newVersion = savedProject.versions[savedProject.versions.length - 1];

    // Increment user usage metrics upon successful generation
    req.user.usageCount += 1;
    await req.user.save();

    res.json({
      downloadUrl: `/api/projects/${savedProject._id}/versions/${newVersion.versionId}/download`,
      projectId: savedProject._id,
      versionId: newVersion.versionId,
      files: result.files,
      fileList: result.fileList,
      zipSize: result.zipSize,
      project: savedProject,
      zipUrl: result.downloadUrl.replace("/downloads/", "/api/extensions/download/"),
    });
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
 * NOTE: Legacy support. Newer clients will use the project version download endpoint.
 */
router.get("/download/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\") ||
      !filename.endsWith(".zip")
    ) {
      return res.status(400).json({ error: "Invalid filename." });
    }

    const filePath = path.join(DOWNLOADS_DIR, filename);

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

    res.sendFile(filePath);
  } catch (error) {
    console.error("[extension/download] Error:", error.message);
    res.status(500).json({ error: "Failed to download file." });
  }
});

export default router;
