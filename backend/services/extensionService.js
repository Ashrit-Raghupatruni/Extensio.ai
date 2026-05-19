import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import { validateExtensionOutput } from "../utils/validateExtensionOutput.js";
import { sanitizeFilename, safePath } from "../utils/fileUtils.js";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");
const TMP_DIR = path.join(__dirname, "..", "tmp");

await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
await fs.mkdir(TMP_DIR, { recursive: true });

const systemPrompt = `You are Extensio.ai, a Chrome Extension code generator. Your job is to generate complete, working Chrome extensions from user prompts.

RESPONSE FORMAT:
Respond ONLY with a valid JSON object mapping filenames to file contents. No markdown, no explanations, no code fences — just pure JSON.

Example format:
{
  "manifest.json": "{...}",
  "popup.html": "<html>...</html>",
  "popup.js": "...",
  "content.js": "...",
  "styles.css": "..."
}

RULES:
1. manifest.json is REQUIRED and must be valid JSON with manifest_version: 3.
2. Generate ALL files needed for the extension to work — popup HTML/JS/CSS, content scripts, background service workers, options pages, etc.
3. Use only standard Chrome Extension APIs (Manifest V3). No external CDNs.
4. Always include a popup.html with a clean, styled UI unless the user explicitly asks otherwise.
5. Include inline CSS or a separate styles.css for polished visual design.
6. All file content must be strings (even manifest.json — it will be a stringified JSON).
7. Keep code clean, functional, and well-structured.
8. If the extension needs permissions, declare them properly in manifest.json.
9. Use service_worker for background scripts (Manifest V3 requirement).
10. Ensure popup.html references any popup.js and styles.css files you generate.

ALLOWED FILENAMES:
manifest.json, popup.html, popup.js, popup.css, content.js, content.css, background.js, options.html, options.js, options.css, styles.css, and any icon files like icons/icon16.png, icons/icon48.png, icons/icon128.png.

IMPORTANT: Your entire response must be parseable by JSON.parse(). Do NOT wrap in code fences or add any text outside the JSON object.`;

/**
 * Extracts JSON from LLM response text, handling cases where the model
 * wraps output in markdown code fences or adds extra text.
 * @param {string} rawText - Raw LLM response text
 * @returns {object} Parsed JSON object
 */
function extractJSON(rawText) {
  let text = rawText.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try to find JSON object boundaries if there's extra text
  if (!text.startsWith("{")) {
    const firstBrace = text.indexOf("{");
    if (firstBrace !== -1) {
      text = text.slice(firstBrace);
    }
  }

  if (!text.endsWith("}")) {
    const lastBrace = text.lastIndexOf("}");
    if (lastBrace !== -1) {
      text = text.slice(0, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      "LLM output was not valid JSON. Parse error: " +
        error.message +
        "\nReceived (first 800 chars): " +
        rawText.slice(0, 800)
    );
  }
}

/**
 * Generates a Chrome extension from a prompt, writes files to a temp directory,
 * packages them into a ZIP, and returns a download URL.
 *
 * @param {string} prompt - User's extension description
 * @param {string} projectName - Name for the project/extension
 * @returns {object} { downloadUrl, projectId, files, fileList }
 */
async function generateExtensionZip(prompt, projectName) {
  console.log(`[generate] Starting generation for: "${projectName}"`);
  console.log(`[generate] Prompt: "${prompt.slice(0, 100)}..."`);

  let rawText = "";

  if (!openai) {
    console.log(`[generate] MOCK MODE: OpenAI API key missing. Generating mock extension.`);
    const mockOutput = {
      "manifest.json": JSON.stringify({
        manifest_version: 3,
        name: projectName,
        version: "1.0.0",
        description: `Generated from prompt: ${prompt}`,
        action: { default_popup: "popup.html" },
        permissions: ["activeTab", "storage"]
      }, null, 2),
      "popup.html": `<!DOCTYPE html>
<html>
<head>
  <style>body { width: 250px; font-family: sans-serif; padding: 10px; }</style>
</head>
<body>
  <h3>${projectName}</h3>
  <p>Mock generated extension</p>
  <button id="btn">Click me</button>
  <script src="popup.js"></script>
</body>
</html>`,
      "popup.js": `document.getElementById('btn').addEventListener('click', () => alert('Mock clicked!'));`
    };
    rawText = JSON.stringify(mockOutput);
  } else {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate a Chrome extension for: ${prompt}` },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    });

    rawText = response.choices?.[0]?.message?.content ?? "";
  }
  console.log(`[generate] Received ${rawText.length} chars from LLM`);

  if (!rawText.trim()) {
    throw new Error("LLM returned an empty response.");
  }

  // Extract and parse JSON (handles code fences, extra text)
  const output = extractJSON(rawText);

  // Validate output structure, filenames, and manifest
  validateExtensionOutput(output);
  console.log(`[generate] Validated ${Object.keys(output).length} files`);

  // Create temp project folder
  const projectId = uuidv4();
  const projectFolder = path.join(TMP_DIR, projectId);
  await fs.mkdir(projectFolder, { recursive: true });

  const fileList = [];

  try {
    // Write each file with path safety checks
    for (const [filename, fileBody] of Object.entries(output)) {
      // Double-check filename safety
      const sanitized = sanitizeFilename(filename);

      // Ensure resolved path stays within project folder
      const filePath = safePath(projectFolder, sanitized);

      // Create subdirectories if needed (e.g., icons/icon16.png)
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      await fs.writeFile(filePath, fileBody, "utf8");

      fileList.push({
        name: sanitized,
        size: Buffer.byteLength(fileBody, "utf8"),
      });

      console.log(`[generate] Written: ${sanitized} (${Buffer.byteLength(fileBody, "utf8")} bytes)`);
    }

    // Create ZIP
    const zipName = `${projectName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}-${projectId}.zip`;
    const zipPath = path.join(DOWNLOADS_DIR, zipName);

    await zipFolder(projectFolder, zipPath);

    // Verify ZIP integrity
    const zipStats = await fs.stat(zipPath);
    if (zipStats.size === 0) {
      throw new Error("Generated ZIP file is empty — archive creation failed.");
    }
    console.log(`[generate] ZIP created: ${zipName} (${zipStats.size} bytes)`);

    return {
      downloadUrl: `/downloads/${zipName}`,
      projectId,
      files: output,
      fileList,
      zipSize: zipStats.size,
    };
  } finally {
    // Always clean up temp folder, even on error
    await fs.rm(projectFolder, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Archives a directory into a ZIP file.
 * @param {string} sourceDir - Source directory to zip
 * @param {string} outPath - Output ZIP file path
 */
async function zipFolder(sourceDir, outPath) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const output = createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    output.on("close", () => {
      resolve();
    });
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn("[zip] Warning:", err.message);
      } else {
        reject(err);
      }
    });
    archive.directory(sourceDir, false);
    archive.pipe(output);
    archive.finalize();
  });
}

export { generateExtensionZip };
