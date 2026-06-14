/**
 * crossFileChecker.js — Cross-File Reference Integrity Validator
 *
 * After AI generation, validates that all inter-file references are consistent:
 * - manifest.json references (default_popup, service_worker, content_scripts, etc.)
 * - HTML <script src=""> and <link href=""> references
 * - Ensures no file references a non-existent file in the output
 *
 * @module utils/crossFileChecker
 */

/**
 * Checks all inter-file references in the generated extension output.
 *
 * @param {object} output - The parsed extension files map { filename: content }
 * @returns {string[]} Array of broken reference error messages (empty if all references valid)
 */
export function checkCrossFileReferences(output) {
  const fileSet = new Set(Object.keys(output));
  const errors = [];

  // ─── 1. Validate manifest.json references ────────────────────────────
  if (!output["manifest.json"]) return errors;

  let manifest;
  try {
    manifest = JSON.parse(output["manifest.json"]);
  } catch {
    // If manifest can't be parsed, the main validator will catch this
    return errors;
  }

  const manifestRefs = [];

  // Action popup
  if (manifest.action?.default_popup) {
    manifestRefs.push({ ref: manifest.action.default_popup, field: "action.default_popup" });
  }

  // Background service worker
  if (manifest.background?.service_worker) {
    manifestRefs.push({ ref: manifest.background.service_worker, field: "background.service_worker" });
  }

  // Options page
  if (manifest.options_page) {
    manifestRefs.push({ ref: manifest.options_page, field: "options_page" });
  }
  if (manifest.options_ui?.page) {
    manifestRefs.push({ ref: manifest.options_ui.page, field: "options_ui.page" });
  }

  // DevTools page
  if (manifest.devtools_page) {
    manifestRefs.push({ ref: manifest.devtools_page, field: "devtools_page" });
  }

  // Content scripts
  if (Array.isArray(manifest.content_scripts)) {
    for (const [i, cs] of manifest.content_scripts.entries()) {
      if (Array.isArray(cs.js)) {
        for (const jsFile of cs.js) {
          manifestRefs.push({ ref: jsFile, field: `content_scripts[${i}].js` });
        }
      }
      if (Array.isArray(cs.css)) {
        for (const cssFile of cs.css) {
          manifestRefs.push({ ref: cssFile, field: `content_scripts[${i}].css` });
        }
      }
    }
  }

  // Web accessible resources
  if (Array.isArray(manifest.web_accessible_resources)) {
    for (const war of manifest.web_accessible_resources) {
      if (Array.isArray(war.resources)) {
        for (const res of war.resources) {
          // Skip glob patterns like "*.png"
          if (!res.includes("*")) {
            manifestRefs.push({ ref: res, field: "web_accessible_resources" });
          }
        }
      }
    }
  }

  // Check manifest references
  for (const { ref, field } of manifestRefs) {
    if (!fileSet.has(ref)) {
      errors.push(`manifest.json "${field}" references "${ref}" but this file was not generated`);
    }
  }

  // ─── 2. Validate HTML file references ────────────────────────────────
  for (const [filename, content] of Object.entries(output)) {
    if (!filename.endsWith(".html")) continue;

    // Find <script src="..."> references (exclude external URLs)
    const scriptRefs = [...content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map(m => m[1])
      .filter(src => !src.startsWith("http") && !src.startsWith("//") && !src.startsWith("data:"));

    // Find <link href="..."> CSS references (exclude external URLs and non-stylesheet links)
    const linkRefs = [...content.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi)]
      .map(m => m[1])
      .filter(href => !href.startsWith("http") && !href.startsWith("//"));

    for (const ref of [...scriptRefs, ...linkRefs]) {
      // Normalize path (remove leading ./)
      const normalizedRef = ref.replace(/^\.\//, "");
      if (!fileSet.has(normalizedRef) && !fileSet.has(ref)) {
        errors.push(`${filename} references "${ref}" but this file was not generated`);
      }
    }
  }

  return errors;
}
