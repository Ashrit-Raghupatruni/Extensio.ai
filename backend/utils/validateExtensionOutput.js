import { sanitizeFilename } from "./fileUtils.js";

/**
 * Validates the LLM-generated extension output object.
 *
 * Rules:
 * - Output must be a non-null object
 * - manifest.json is required and must be valid JSON with manifest_version: 3
 * - All filenames are validated via sanitizeFilename (allowlisted chars + extensions)
 * - All file contents must be non-empty strings
 * - At least one file besides manifest.json should exist
 *
 * @param {object} output - The parsed LLM response (filename → content map)
 * @throws {Error} If validation fails
 */
export function validateExtensionOutput(output) {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    throw new Error("Extension output must be a JSON object (filename → content map).");
  }

  const fileNames = Object.keys(output);

  if (fileNames.length === 0) {
    throw new Error("Extension output must contain at least one file.");
  }

  // manifest.json is always required
  if (!("manifest.json" in output)) {
    throw new Error("Missing required file: manifest.json");
  }

  // Validate every filename and content
  for (const [filename, content] of Object.entries(output)) {
    // Validate filename safety (will throw if invalid)
    sanitizeFilename(filename);

    // Content must be a non-empty string
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error(`File "${filename}" must have non-empty string content.`);
    }
  }

  // Validate manifest.json is proper JSON with manifest_version 3
  let manifest;
  try {
    manifest = JSON.parse(output["manifest.json"]);
  } catch (error) {
    throw new Error("manifest.json content is not valid JSON: " + error.message);
  }

  if (manifest.manifest_version !== 3) {
    throw new Error(
      `manifest.json must have manifest_version: 3, got: ${manifest.manifest_version}`
    );
  }

  if (!manifest.name || typeof manifest.name !== "string") {
    throw new Error("manifest.json must include a valid 'name' field.");
  }

  if (!manifest.version || typeof manifest.version !== "string") {
    throw new Error("manifest.json must include a valid 'version' field.");
  }
}
