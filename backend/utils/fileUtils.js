import fs from "fs/promises";
import path from "path";

// Allowed file extensions for Chrome extensions
const ALLOWED_EXTENSIONS = new Set([
  ".json",
  ".js",
  ".html",
  ".css",
  ".png",
  ".svg",
  ".md",
  ".txt",
  ".woff",
  ".woff2",
  ".ttf",
  ".gif",
  ".jpg",
  ".jpeg",
  ".webp",
  ".ico",
]);

// Regex: only allow alphanumeric, hyphens, underscores, dots, and forward slashes (for subdirs like icons/icon16.png)
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_\-./]+$/;

/**
 * Validates and sanitizes a filename from LLM output.
 * Blocks path traversal, disallowed characters, and invalid extensions.
 * @param {string} filename - The filename to validate
 * @returns {string} The validated filename
 * @throws {Error} If the filename is invalid or unsafe
 */
export function sanitizeFilename(filename) {
  if (typeof filename !== "string" || filename.trim().length === 0) {
    throw new Error("Filename must be a non-empty string.");
  }

  // Normalize and trim
  const normalized = filename.trim().replace(/\\/g, "/");

  // Block path traversal
  if (normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error(`Unsafe filename detected (path traversal): ${filename}`);
  }

  // Block disallowed characters
  if (!SAFE_FILENAME_REGEX.test(normalized)) {
    throw new Error(
      `Filename contains disallowed characters: ${filename}. Only alphanumeric, hyphens, underscores, dots, and forward slashes are permitted.`
    );
  }

  // Validate extension
  const ext = path.extname(normalized).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `File extension "${ext}" is not allowed. Permitted: ${[...ALLOWED_EXTENSIONS].join(", ")}`
    );
  }

  return normalized;
}

/**
 * Validates that a resolved file path stays within the intended base directory.
 * Prevents any directory escape even after OS-level path resolution.
 * @param {string} baseDir - The allowed base directory (absolute path)
 * @param {string} filename - The relative filename to check
 * @returns {string} The safe, fully resolved path
 * @throws {Error} If the path escapes the base directory
 */
export function safePath(baseDir, filename) {
  const resolved = path.resolve(baseDir, filename);
  const normalizedBase = path.resolve(baseDir) + path.sep;

  if (!resolved.startsWith(normalizedBase) && resolved !== path.resolve(baseDir)) {
    throw new Error(`Path traversal blocked: ${filename} resolves outside project folder.`);
  }

  return resolved;
}

/**
 * Removes files and directories older than maxAgeMs from a directory.
 * Used for periodic cleanup of tmp/ and downloads/ directories.
 * @param {string} dir - Directory to clean up
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
export async function cleanupOldFiles(dir, maxAgeMs = 60 * 60 * 1000) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        const stats = await fs.stat(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          if (entry.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true });
          } else {
            await fs.unlink(fullPath);
          }
          console.log(`[cleanup] Removed old file: ${entry.name}`);
        }
      } catch (err) {
        console.warn(`[cleanup] Failed to process ${entry.name}:`, err.message);
      }
    }
  } catch (err) {
    // Directory may not exist yet — that's fine
    if (err.code !== "ENOENT") {
      console.warn(`[cleanup] Could not read directory ${dir}:`, err.message);
    }
  }
}
