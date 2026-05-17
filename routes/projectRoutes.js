import express from "express";
import { listProjects, getProject, saveProject } from "../services/projectService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const projects = await listProjects();
  res.json(projects);
});

router.get("/:id", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(project);
});

router.post("/save", async (req, res) => {
  const { id, projectName, prompt, files } = req.body;
  if (!projectName || !prompt || !files) {
    return res.status(400).json({ error: "projectName, prompt, and files are required." });
  }

  const saved = await saveProject({ id, projectName, prompt, files });
  res.json(saved);
});

export default router;
