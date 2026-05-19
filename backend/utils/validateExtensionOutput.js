import { promises as fs } from "fs";

const requiredFiles = ["manifest.json", "content.js", "popup.html"];

export function validateExtensionOutput(output) {
  if (typeof output !== "object" || output === null) {
    throw new Error("Extension output must be a JSON object.");
  }

  for (const file of requiredFiles) {
    if (!(file in output)) {
      throw new Error(`Missing required extension file: ${file}`);
    }
    if (typeof output[file] !== "string" || output[file].trim().length === 0) {
      throw new Error(`File ${file} must be a non-empty string.`);
    }
  }

  try {
    JSON.parse(output["manifest.json"]);
  } catch (error) {
    throw new Error("manifest.json content is not valid JSON.");
  }
}
