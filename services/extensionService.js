import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import { validateExtensionOutput } from "../utils/validateExtensionOutput.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");
const TMP_DIR = path.join(__dirname, "..", "tmp");

await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
await fs.mkdir(TMP_DIR, { recursive: true });

const systemPrompt = `You are extenso.ai, a Chrome extension code generator. Respond ONLY with valid JSON in this exact format and no extra text:
{
  "manifest.json": "...",
  "content.js": "...",
  "popup.html": "..."
}

Requirements:
1. Generate a valid Chrome Extension Manifest V3.
2. Keep all code minimal and functional.
3. Do not include comments in generated files.
4. Do not include any extra properties outside manifest.json, content.js, popup.html.
5. Ensure manifest.json content is syntactically valid JSON when inserted in a file.
6. Use only standard Chrome extension APIs and no external CDNs.
7. If the prompt requires a popup, include popup.html and a matching action in manifest.json.
8. If the prompt does not require a popup, generate an empty but valid popup.html and still include it.

Example:
{"manifest.json":"{\"manifest_version\":3,\"name\":\"Background Color Changer\",\"version\":\"1.0\",\"action\":{\"default_popup\":\"popup.html\"},\"permissions\":[\"activeTab\"],\"background\":{\"service_worker\":\"content.js\"}}","content.js":"chrome.action.onClicked.addListener((tab)=>{chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{document.body.style.backgroundColor='yellow';}});}","popup.html":"<html><body><button id=run>Run</button><script>document.getElementById('run').addEventListener('click',()=>{chrome.tabs.query({active:true,currentWindow:true},tabs=>{chrome.scripting.executeScript({target:{tabId:tabs[0].id},func:()=>{document.body.style.backgroundColor='yellow';}});});});</script></body></html>"}
`;

async function generateExtensionZip(prompt, projectName) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate a Chrome extension for: ${prompt}` }
    ],
    max_tokens: 1200,
    temperature: 0.2
  });

  const jsonText = response.choices?.[0]?.message?.content ?? "";
  let output;

  try {
    output = JSON.parse(jsonText.trim());
  } catch (error) {
    throw new Error("LLM output was not valid JSON. Received: " + jsonText.slice(0, 500));
  }

  validateExtensionOutput(output);

  const projectId = uuidv4();
  const projectFolder = path.join(TMP_DIR, projectId);
  await fs.mkdir(projectFolder, { recursive: true });

  for (const [filename, fileBody] of Object.entries(output)) {
    const filePath = path.join(projectFolder, filename);
    await fs.writeFile(filePath, fileBody, "utf8");
  }

  const zipName = `${projectName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}-${projectId}.zip`;
  const zipPath = path.join(DOWNLOADS_DIR, zipName);

  await zipFolder(projectFolder, zipPath);
  await fs.rm(projectFolder, { recursive: true, force: true });

  return {
    downloadUrl: `/downloads/${zipName}`,
    projectId,
    files: output
  };
}

async function zipFolder(sourceDir, outPath) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const output = createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.directory(sourceDir, false);
    archive.pipe(output);
    archive.finalize();
  });
}

export { generateExtensionZip };
