import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECTS_FILE = path.join(__dirname, "..", "data", "projects.json");

async function readProjects() {
  try {
    const raw = await fs.readFile(PROJECTS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeProjects(projects) {
  await fs.mkdir(path.dirname(PROJECTS_FILE), { recursive: true });
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf8");
}

export async function listProjects() {
  return await readProjects();
}

export async function getProject(id) {
  const projects = await readProjects();
  return projects.find((project) => project.id === id) ?? null;
}

export async function saveProject(payload) {
  const projects = await readProjects();
  const time = new Date().toISOString();
  const project = {
    id: payload.id || uuidv4(),
    projectName: payload.projectName,
    prompt: payload.prompt,
    files: payload.files,
    updatedAt: time,
    createdAt: payload.id ? projects.find((item) => item.id === payload.id)?.createdAt || time : time,
  };

  const existingIndex = projects.findIndex((item) => item.id === project.id);
  if (existingIndex >= 0) {
    projects[existingIndex] = project;
  } else {
    projects.unshift(project);
  }

  await writeProjects(projects);
  return project;
}
