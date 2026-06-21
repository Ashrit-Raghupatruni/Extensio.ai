import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { validateExtensionOutput } from "../utils/validateExtensionOutput.js";
import { sanitizeFilename, safePath } from "../utils/fileUtils.js";
import { sanitizeGeneratedCode } from "../utils/sanitizeCode.js";
import { sanitizeUserPrompt } from "../utils/promptGuard.js";
import { checkCrossFileReferences } from "../utils/crossFileChecker.js";

const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");
const TMP_DIR = path.join(__dirname, "..", "tmp");

await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
await fs.mkdir(TMP_DIR, { recursive: true });

// ─── Maximum self-correction attempts after validation failures ───────────
const MAX_SELF_CORRECTION_ATTEMPTS = 2;

// ─── Enhanced Multi-Shot System Prompt ────────────────────────────────────
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
10. Every file referenced in manifest.json MUST be included in the output. Do NOT reference files you did not generate.
11. Every <script src="..."> and <link href="..."> in HTML files MUST point to a file that is included in the output.
12. Only declare permissions that the code actually uses. Do not over-declare permissions.

ALLOWED FILENAMES:
manifest.json, popup.html, popup.js, popup.css, content.js, content.css, background.js, options.html, options.js, options.css, styles.css, and any icon files like icons/icon16.png, icons/icon48.png, icons/icon128.png.

EXTENSION ARCHITECTURE GUIDE:
- Popup-Only extensions: Use manifest.json + popup.html + popup.js + popup.css. Good for simple tools, calculators, quick UIs.
- Content Script extensions: Use manifest.json + content.js (+ content.css). Good for modifying web pages (DOM manipulation, styling changes, ad blocking). Must include "content_scripts" in manifest with proper "matches".
- Background Worker extensions: Use manifest.json + background.js (+ popup if needed). Good for event-driven tasks (alarms, notifications, context menus). Use "background.service_worker" in manifest.
- Hybrid extensions: Combine popup + content + background as needed. Ensure all referenced files exist.

EXAMPLE 1 — Simple Popup Extension (Color Picker):
{
  "files": [
    {
      "filename": "manifest.json",
      "content": "{\\"manifest_version\\": 3, \\"name\\": \\"Color Picker\\", \\"version\\": \\"1.0.0\\", \\"description\\": \\"A simple color picker tool\\", \\"action\\": {\\"default_popup\\": \\"popup.html\\"}, \\"permissions\\": [\\"activeTab\\"]}"
    },
    {
      "filename": "popup.html",
      "content": "<!DOCTYPE html><html><head><meta charset=\\"utf-8\\"><link rel=\\"stylesheet\\" href=\\"popup.css\\"></head><body><h2>Color Picker</h2><input type=\\"color\\" id=\\"picker\\"><p id=\\"hex\\">#000000</p><script src=\\"popup.js\\"></script></body></html>"
    },
    {
      "filename": "popup.js",
      "content": "document.getElementById('picker').addEventListener('input', e => { document.getElementById('hex').textContent = e.target.value; });"
    },
    {
      "filename": "popup.css",
      "content": "body { width: 200px; padding: 16px; font-family: 'Segoe UI', sans-serif; } h2 { margin: 0 0 12px; font-size: 16px; } input[type=color] { width: 100%; height: 40px; border: none; cursor: pointer; } #hex { text-align: center; font-family: monospace; font-size: 18px; margin-top: 8px; }"
    }
  ]
}

EXAMPLE 2 — Content Script Extension (Page Word Counter):
{
  "files": [
    {
      "filename": "manifest.json",
      "content": "{\\"manifest_version\\": 3, \\"name\\": \\"Word Counter\\", \\"version\\": \\"1.0.0\\", \\"description\\": \\"Counts words on any page\\", \\"action\\": {\\"default_popup\\": \\"popup.html\\"}, \\"permissions\\": [\\"activeTab\\", \\"scripting\\"]}"
    },
    {
      "filename": "popup.html",
      "content": "<!DOCTYPE html><html><head><meta charset=\\"utf-8\\"><link rel=\\"stylesheet\\" href=\\"popup.css\\"></head><body><h2>Word Counter</h2><button id=\\"count\\">Count Words</button><p id=\\"result\\">Click to count</p><script src=\\"popup.js\\"></script></body></html>"
    },
    {
      "filename": "popup.js",
      "content": "document.getElementById('count').addEventListener('click', async () => { const [tab] = await chrome.tabs.query({active: true, currentWindow: true}); const results = await chrome.scripting.executeScript({ target: {tabId: tab.id}, func: () => document.body.innerText.split(/\\\\s+/).filter(w => w.length > 0).length }); document.getElementById('result').textContent = results[0].result + ' words'; });"
    },
    {
      "filename": "popup.css",
      "content": "body { width: 220px; padding: 16px; font-family: 'Segoe UI', sans-serif; } button { width: 100%; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; } button:hover { background: #45a049; } #result { text-align: center; margin-top: 12px; font-size: 18px; font-weight: bold; }"
    }
  ]
}

EXAMPLE 3 — Background + Storage Extension (Quick Notes):
{
  "files": [
    {
      "filename": "manifest.json",
      "content": "{\\"manifest_version\\": 3, \\"name\\": \\"Quick Notes\\", \\"version\\": \\"1.0.0\\", \\"description\\": \\"Save quick notes with persistence\\", \\"action\\": {\\"default_popup\\": \\"popup.html\\"}, \\"permissions\\": [\\"storage\\"]}"
    },
    {
      "filename": "popup.html",
      "content": "<!DOCTYPE html><html><head><meta charset=\\"utf-8\\"><link rel=\\"stylesheet\\" href=\\"popup.css\\"></head><body><h2>Quick Notes</h2><textarea id=\\"note\\" placeholder=\\"Type a note...\\"></textarea><button id=\\"save\\">Save</button><div id=\\"notes\\"></div><script src=\\"popup.js\\"></script></body></html>"
    },
    {
      "filename": "popup.js",
      "content": "const noteEl = document.getElementById('note'); const notesEl = document.getElementById('notes'); function render(notes) { notesEl.innerHTML = notes.map((n,i) => '<div class=\\"note-item\\">' + n + '<span onclick=\\"del('+i+')\\">&times;</span></div>').join(''); } chrome.storage.local.get(['notes'], r => render(r.notes || [])); document.getElementById('save').addEventListener('click', () => { const text = noteEl.value.trim(); if (!text) return; chrome.storage.local.get(['notes'], r => { const notes = r.notes || []; notes.unshift(text); chrome.storage.local.set({notes}, () => { noteEl.value = ''; render(notes); }); }); }); window.del = i => { chrome.storage.local.get(['notes'], r => { const notes = r.notes || []; notes.splice(i,1); chrome.storage.local.set({notes}, () => render(notes)); }); };"
    },
    {
      "filename": "popup.css",
      "content": "body { width: 280px; padding: 16px; font-family: 'Segoe UI', sans-serif; } textarea { width: 100%; height: 60px; border: 1px solid #ddd; border-radius: 6px; padding: 8px; resize: none; box-sizing: border-box; } button { width: 100%; margin-top: 8px; padding: 8px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; } .note-item { display: flex; justify-content: space-between; padding: 6px 8px; margin-top: 6px; background: #f5f5f5; border-radius: 4px; font-size: 13px; } .note-item span { cursor: pointer; color: #e53935; font-weight: bold; }"
    }
  ]
}`;

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
 * Generates mock extension files using smart offline heuristics.
 * @param {string} prompt
 * @param {string} projectName
 * @param {object} previousFiles
 * @returns {string} Stringified JSON files mapping
 */
function generateMockExtensionFiles(prompt, projectName, previousFiles) {
  if (previousFiles) {
    const updatedFiles = {};
    const filesObj = typeof previousFiles.entries === "function" 
      ? Object.fromEntries(previousFiles) 
      : previousFiles;

    for (const [filename, fileBody] of Object.entries(filesObj)) {
      updatedFiles[filename] = fileBody;
    }

    const colors = ["blue", "green", "purple", "yellow", "orange", "black", "violet", "pink", "teal", "cyan", "red", "indigo"];
    let foundColor = null;
    for (const color of colors) {
      if (prompt.toLowerCase().includes(color)) {
        foundColor = color;
        break;
      }
    }

    if (updatedFiles["popup.html"]) {
      if (foundColor) {
        updatedFiles["popup.html"] = updatedFiles["popup.html"].replace(
          /background-color:\s*[^;"]+/g,
          `background-color: ${foundColor}`
        );
      }
      updatedFiles["popup.html"] = updatedFiles["popup.html"].replace(
        /<p id="desc">[\s\S]*?<\/p>/g,
        `<p id="desc">Iterated mock: ${prompt}</p>`
      );
      updatedFiles["popup.html"] = updatedFiles["popup.html"].replace(
        /<div id="iter-info"[\s\S]*?>[\s\S]*?<\/div>/g,
        `<div id="iter-info" style="margin-top: 10px; font-size: 11px; color: #777;">Latest Prompt: "${prompt}"</div>`
      );
    }

    if (updatedFiles["popup.css"] && foundColor) {
      updatedFiles["popup.css"] = updatedFiles["popup.css"] + `\n/* Added style */\nbutton { background-color: ${foundColor} !important; }`;
    }

    if (updatedFiles["popup.js"]) {
      updatedFiles["popup.js"] = `// Iterated: ${prompt} on ${new Date().toLocaleTimeString()}\n` + updatedFiles["popup.js"];
    }

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

    return JSON.stringify(updatedFiles);
  } else {
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
    return JSON.stringify(mockOutput);
  }
}

/**
 * Converts parsed LLM output (files array) into a flat { filename: content } map.
 * @param {object} parsed - The parsed JSON from LLM
 * @returns {object} Flat file map
 */
function convertToFileMap(parsed) {
  let output = {};
  if (parsed && Array.isArray(parsed.files)) {
    for (const fileObj of parsed.files) {
      if (fileObj.filename && fileObj.content !== undefined) {
        output[fileObj.filename] = fileObj.content;
      }
    }
  } else if (parsed) {
    output = parsed;
  }
  return output;
}

/**
 * Runs the full validation pipeline on generated output.
 * Returns an array of error messages (empty = all passed).
 *
 * @param {object} output - The { filename: content } file map
 * @returns {{ errors: string[], warnings: string[] }}
 */
function runValidationPipeline(output) {
  const errors = [];
  const warnings = [];

  // 1. Security: Sanitize code for dangerous patterns
  try {
    const securityReport = sanitizeGeneratedCode(output);
    if (!securityReport.safe) {
      errors.push(...securityReport.violations.map(v => `[Security] ${v}`));
    }
  } catch (e) {
    errors.push(`[Security] ${e.message}`);
  }

  // 2. Validate manifest structure, permissions, CSP
  try {
    const validationResult = validateExtensionOutput(output);
    if (validationResult.warnings) {
      warnings.push(...validationResult.warnings);
    }
  } catch (e) {
    errors.push(`[Manifest] ${e.message}`);
  }

  // 3. Cross-file reference integrity check
  try {
    const refErrors = checkCrossFileReferences(output);
    errors.push(...refErrors.map(e => `[CrossRef] ${e}`));
  } catch (e) {
    errors.push(`[CrossRef] ${e.message}`);
  }

  return { errors, warnings };
}

/**
 * Generates a Chrome extension from a prompt (and optional previousFiles to modify),
 * writes files to a temp directory, packages them into a ZIP, and returns a download URL.
 *
 * Features:
 * - Prompt injection guard
 * - Multi-shot system prompt with 3 golden examples
 * - Low temperature for deterministic code generation
 * - Self-healing pipeline with validation-aware auto-retry
 * - Cross-file reference integrity checking
 *
 * @param {string} prompt - User's extension description or iteration prompt
 * @param {string} projectName - Name for the project/extension
 * @param {object} previousFiles - Existing project files map { filename: content }
 * @returns {object} { downloadUrl, projectId, files, fileList }
 */
async function generateExtensionZip(prompt, projectName, previousFiles = null) {
  console.log(`[generate] Starting generation/iteration for: "${projectName}"`);
  console.log(`[generate] Prompt: "${prompt.slice(0, 100)}..."`);

  // ─── Upgrade 2: Prompt Injection Guard ──────────────────────────────
  const { sanitized: safePrompt, warnings: promptWarnings } = sanitizeUserPrompt(prompt);
  if (promptWarnings.length > 0) {
    console.warn(`[prompt-guard] ${promptWarnings.length} warning(s):`);
    promptWarnings.forEach(w => console.warn(`  → ${w}`));
  }

  if (previousFiles) {
    console.log(`[generate] Modification mode activated. Existing file count: ${Object.keys(previousFiles).length || previousFiles.size}`);
  }

  let rawText = "";

  if (!genAI) {
    console.log(`[generate] MOCK MODE: Gemini API key missing. Performing mock generation/iteration.`);
    rawText = generateMockExtensionFiles(safePrompt, projectName, previousFiles);
  } else {
    // ─── Build Gemini model with tuned config ───────────────────────────
    const responseSchema = {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string" },
              content: { type: "string" }
            },
            required: ["filename", "content"]
          }
        }
      },
      required: ["files"]
    };

    // Upgrade 1: Temperature & Token Budget Tuning
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.15,        // Low temperature = deterministic, reliable code
        topP: 0.9,                // Nucleus sampling threshold
        topK: 40,                 // Top-K token selection
        maxOutputTokens: 32768,   // Sufficient for large multi-file extensions
      }
    }, { timeout: 60000 });       // 60s timeout (was 10s — too tight for complex extensions)

    // ─── Build the user prompt content ──────────────────────────────────
    let promptContent = "";
    if (previousFiles) {
      const filesObj = typeof previousFiles.entries === "function" 
        ? Object.fromEntries(previousFiles) 
        : previousFiles;

      promptContent = `We have an existing Chrome extension project named "${projectName}".
Here are the existing files in the project:
${JSON.stringify(filesObj, null, 2)}

The user wants to modify this extension with the following instruction:
"${safePrompt}"

Please modify, update, add, or delete files as necessary based on the instruction. Output the complete, updated set of files for the extension in the required JSON format. Make sure to keep any files that don't need changes, and edit the others. Return a fully valid JSON containing all the extension files.`;
    } else {
      promptContent = `Generate a Chrome extension for: ${safePrompt}`;
    }

    // ─── Gemini API call with exponential backoff retry ─────────────────
    let success = false;
    let lastError = null;
    const retries = 3;
    let delay = 1000;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[generate] Contacting Gemini API (Attempt ${attempt}/${retries})...`);
        const response = await model.generateContent(promptContent);
        rawText = response.response.text();
        success = true;
        break;
      } catch (error) {
        lastError = error;
        console.error(`[generate] Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < retries) {
          console.log(`[generate] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }

    if (!success) {
      console.warn(`[generate] ⚠️ Gemini API generation failed after ${retries} attempts due to: ${lastError.message}`);
      console.warn(`[generate] Falling back to offline Smart Mock Mode heuristics to keep user service uninterrupted.`);
      rawText = generateMockExtensionFiles(safePrompt, projectName, previousFiles);
    }

    // ─── Upgrade 5: Self-Healing Pipeline (Validation-Aware Auto-Retry) ─
    if (success) {
      let output = null;
      let validationErrors = [];
      let correctionAttempt = 0;

      for (correctionAttempt = 0; correctionAttempt <= MAX_SELF_CORRECTION_ATTEMPTS; correctionAttempt++) {
        // Parse the raw text
        if (!rawText.trim()) {
          validationErrors = ["LLM returned an empty response."];
          break;
        }

        try {
          const parsed = extractJSON(rawText);
          output = convertToFileMap(parsed);
        } catch (parseError) {
          validationErrors = [`[JSON] ${parseError.message}`];
          
          if (correctionAttempt < MAX_SELF_CORRECTION_ATTEMPTS) {
            console.warn(`[self-correct] Attempt ${correctionAttempt + 1}: JSON parse failed, asking LLM to fix...`);
            try {
              const fixPrompt = `Your previous output was not valid JSON. Error: ${parseError.message}\n\nPlease regenerate the complete Chrome extension as valid JSON. Original request: ${promptContent}`;
              const fixResponse = await model.generateContent(fixPrompt);
              rawText = fixResponse.response.text();
              continue;
            } catch {
              break;
            }
          }
          break;
        }

        // Run the full validation pipeline
        const { errors, warnings } = runValidationPipeline(output);
        
        if (warnings.length > 0) {
          console.warn(`[manifest-audit] ${warnings.length} permission warning(s):`);
          warnings.forEach(w => console.warn(`  → ${w}`));
        }

        if (errors.length === 0) {
          // All validations passed!
          if (correctionAttempt > 0) {
            console.log(`[self-correct] ✅ Self-correction succeeded on attempt ${correctionAttempt}!`);
          }
          console.log(`[security] ✅ Code sanitization passed — no violations detected`);
          console.log(`[generate] Validated ${Object.keys(output).length} files`);
          
          // Write files and create ZIP (reuse output below)
          rawText = JSON.stringify({ files: Object.entries(output).map(([filename, content]) => ({ filename, content })) });
          break;
        }

        validationErrors = errors;

        // If we have correction attempts left, ask the LLM to fix
        if (correctionAttempt < MAX_SELF_CORRECTION_ATTEMPTS) {
          console.warn(`[self-correct] Attempt ${correctionAttempt + 1}: ${errors.length} validation error(s) found:`);
          errors.forEach(e => console.warn(`  → ${e}`));

          const errorList = errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
          const fixPrompt = `Your previous Chrome extension output had the following validation errors:\n${errorList}\n\nPlease fix ALL of these issues and regenerate the complete extension. Make sure:\n- Every file referenced in manifest.json is included in the output\n- Every <script> and <link> in HTML files points to a generated file\n- No dangerous code patterns (eval, document.write, etc.)\n- manifest.json has manifest_version: 3 with valid name and version\n\nOriginal request: ${promptContent}`;
          
          try {
            console.log(`[self-correct] Asking LLM to fix ${errors.length} error(s)...`);
            const fixResponse = await model.generateContent(fixPrompt);
            rawText = fixResponse.response.text();
          } catch (fixError) {
            console.error(`[self-correct] Fix attempt failed: ${fixError.message}`);
            break;
          }
        }
      }

      // If we exhausted all correction attempts and still have errors, throw
      if (validationErrors.length > 0) {
        console.error(`[self-correct] ❌ Generation failed after ${correctionAttempt} self-correction attempt(s).`);
        validationErrors.forEach(e => console.error(`  → ${e}`));
        throw new Error(
          `Generated extension failed validation after ${correctionAttempt} self-correction attempt(s) (${validationErrors.length} error(s)): ` +
          validationErrors.slice(0, 3).join("; ") +
          (validationErrors.length > 3 ? `; ...and ${validationErrors.length - 3} more` : "")
        );
      }
    }
  }
  
  console.log(`[generate] Received ${rawText.length} chars from LLM`);

  if (!rawText.trim()) {
    throw new Error("LLM returned an empty response.");
  }

  // Extract and parse JSON (handles code fences, extra text)
  const parsed = extractJSON(rawText);
  const output = convertToFileMap(parsed);

  // For mock mode (no self-healing loop), run validation directly
  if (!genAI) {
    const securityReport = sanitizeGeneratedCode(output);
    if (!securityReport.safe) {
      console.warn(`[security] ⛔ ${securityReport.violations.length} violation(s) found:`);
      securityReport.violations.forEach(v => console.warn(`  → ${v}`));
      throw new Error(
        `Generated extension failed security audit (${securityReport.violations.length} violation(s)): ` +
        securityReport.violations.slice(0, 3).join("; ") +
        (securityReport.violations.length > 3 ? `; ...and ${securityReport.violations.length - 3} more` : "")
      );
    }
    console.log(`[security] ✅ Code sanitization passed — no violations detected`);

    const validationResult = validateExtensionOutput(output);
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      console.warn(`[manifest-audit] ${validationResult.warnings.length} permission warning(s):`);
      validationResult.warnings.forEach(w => console.warn(`  → ${w}`));
    }

    const refErrors = checkCrossFileReferences(output);
    if (refErrors.length > 0) {
      console.warn(`[cross-ref] ${refErrors.length} broken reference(s):`);
      refErrors.forEach(e => console.warn(`  → ${e}`));
    }

    console.log(`[generate] Validated ${Object.keys(output).length} files`);
  }

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
