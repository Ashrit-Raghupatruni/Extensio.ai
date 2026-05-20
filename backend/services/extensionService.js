import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { validateExtensionOutput } from "../utils/validateExtensionOutput.js";
import { sanitizeFilename, safePath } from "../utils/fileUtils.js";

const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");
const TMP_DIR = path.join(__dirname, "..", "tmp");

await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
await fs.mkdir(TMP_DIR, { recursive: true });

const systemPrompt = `You are Extensio.ai, a Chrome Extension code generator. Your job is to generate complete, working Chrome extensions from user prompts.

You must output a JSON object containing a "files" array of objects with "filename" and "content" keys. Do not include markdown code fences or any conversational text.

RULES:
1. manifest.json is REQUIRED and must be valid stringified JSON with manifest_version: 3.
2. Generate ALL files needed for the extension to work — popup HTML/JS/CSS, content scripts, background service workers, options pages, etc.
3. Use only standard Chrome Extension APIs (Manifest V3). No external CDNs.
4. Always include a popup.html with a clean, styled UI unless the user explicitly asks otherwise.
5. Include inline CSS or a separate styles.css for polished visual design.
6. Keep code clean, functional, and well-structured.
7. If the extension needs permissions, declare them properly in manifest.json.
8. Use service_worker for background scripts (Manifest V3 requirement).
9. Ensure popup.html references any popup.js and styles.css files you generate.

ALLOWED FILENAMES:
manifest.json, popup.html, popup.js, popup.css, content.js, content.css, background.js, options.html, options.js, options.css, styles.css, and any icon files like icons/icon16.png, icons/icon48.png, icons/icon128.png.`;

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
 * Generates a Chrome extension from a prompt (and optional previousFiles to modify),
 * writes files to a temp directory, packages them into a ZIP, and returns a download URL.
 *
 * @param {string} prompt - User's extension description or iteration prompt
 * @param {string} projectName - Name for the project/extension
 * @param {object} previousFiles - Existing project files map { filename: content }
 * @returns {object} { downloadUrl, projectId, files, fileList }
 */
async function generateExtensionZip(prompt, projectName, previousFiles = null) {
  console.log(`[generate] Starting generation/iteration for: "${projectName}"`);
  console.log(`[generate] Prompt: "${prompt.slice(0, 100)}..."`);
  if (previousFiles) {
    console.log(`[generate] Modification mode activated. Existing file count: ${Object.keys(previousFiles).length || previousFiles.size}`);
  }

  let rawText = "";

  if (!genAI) {
    console.log(`[generate] MOCK MODE: Gemini API key missing. Performing mock generation/iteration.`);
    
    if (previousFiles) {
      // 1. Iteration Mode in Mock Setup
      const updatedFiles = {};
      
      // Handle Mongoose Map or standard JS object
      const filesObj = typeof previousFiles.entries === "function" 
        ? Object.fromEntries(previousFiles) 
        : previousFiles;

      for (const [filename, fileBody] of Object.entries(filesObj)) {
        updatedFiles[filename] = fileBody;
      }

      // Check if prompt contains color names
      const colors = ["blue", "green", "purple", "yellow", "orange", "black", "violet", "pink", "teal", "cyan", "red", "indigo"];
      let foundColor = null;
      for (const color of colors) {
        if (prompt.toLowerCase().includes(color)) {
          foundColor = color;
          break;
        }
      }

      // Modify HTML styled button if color found
      if (updatedFiles["popup.html"]) {
        if (foundColor) {
          updatedFiles["popup.html"] = updatedFiles["popup.html"].replace(
            /background-color:\s*[^;"]+/g,
            `background-color: ${foundColor}`
          );
        }
        
        // Update description paragraph
        updatedFiles["popup.html"] = updatedFiles["popup.html"].replace(
          /<p id="desc">[\s\S]*?<\/p>/g,
          `<p id="desc">Iterated mock: ${prompt}</p>`
        );

        // Update version logs inside body
        updatedFiles["popup.html"] = updatedFiles["popup.html"].replace(
          /<div id="iter-info"[\s\S]*?>[\s\S]*?<\/div>/g,
          `<div id="iter-info" style="margin-top: 10px; font-size: 11px; color: #777;">Latest Prompt: "${prompt}"</div>`
        );
      }

      // Modify CSS if it exists
      if (updatedFiles["popup.css"] && foundColor) {
        updatedFiles["popup.css"] = updatedFiles["popup.css"] + `\n/* Added style */\nbutton { background-color: ${foundColor} !important; }`;
      }

      // Prepend a comment to popup.js to show it was edited
      if (updatedFiles["popup.js"]) {
        updatedFiles["popup.js"] = `// Iterated: ${prompt} on ${new Date().toLocaleTimeString()}\n` + updatedFiles["popup.js"];
      }

      // Increment Manifest Version
      if (updatedFiles["manifest.json"]) {
        try {
          const manifest = JSON.parse(updatedFiles["manifest.json"]);
          const parts = (manifest.version || "1.0.0").split(".");
          parts[2] = String(parseInt(parts[2] || 0) + 1);
          manifest.version = parts.join(".");
          manifest.description = `Iterated version. Latest: ${prompt}`;
          updatedFiles["manifest.json"] = JSON.stringify(manifest, null, 2);
        } catch (e) {
          console.warn("[mock iteration] manifest.json parsing failed", e.message);
        }
      }

      rawText = JSON.stringify(updatedFiles);
    } else {
      // 2. Initial Mode in Mock Setup
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
  <meta charset="utf-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <h3>${projectName}</h3>
  <p id="desc">Mock generated extension</p>
  <button id="btn" style="background-color: red; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; transition: all 0.2s;">Click me</button>
  <div id="iter-info" style="margin-top: 10px; font-size: 11px; color: #777;">Version 1 (Initial)</div>
  <script src="popup.js"></script>
</body>
</html>`,
        "popup.css": `body { width: 250px; font-family: sans-serif; padding: 10px; background-color: #ffffff; color: #333333; }`,
        "popup.js": `document.getElementById('btn').addEventListener('click', () => alert('Hello from ${projectName}!'));`
      };
      rawText = JSON.stringify(mockOutput);
    }
  } else {
    // Gemini generation / iteration
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    let promptContent = "";
    if (previousFiles) {
      // Convert map to plain object
      const filesObj = typeof previousFiles.entries === "function" 
        ? Object.fromEntries(previousFiles) 
        : previousFiles;

      promptContent = `We have an existing Chrome extension project named "${projectName}".
Here are the existing files in the project:
${JSON.stringify(filesObj, null, 2)}

The user wants to modify this extension with the following instruction:
"${prompt}"

Please modify, update, add, or delete files as necessary based on the instruction. Output the complete, updated set of files for the extension in the required JSON format. Make sure to keep any files that don't need changes, and edit the others. Return a fully valid JSON containing all the extension files.`;
    } else {
      promptContent = `Generate a Chrome extension for: ${prompt}`;
    }

    const response = await model.generateContent(promptContent);
    rawText = response.response.text();
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

export { generateExtensionZip, zipFolder };
