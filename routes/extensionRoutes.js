import express from "express";
import { generateExtensionZip } from "../services/extensionService.js";

const router = express.Router();

router.post("/generate", async (req, res) => {
  try {
    const { prompt, projectName } = req.body;
    if (!prompt || !projectName) {
      return res.status(400).json({ error: "prompt and projectName are required." });
    }

    const result = await generateExtensionZip(prompt, projectName);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to generate extension." });
  }
});

export default router;
