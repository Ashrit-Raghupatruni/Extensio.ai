import { sanitizeFilename } from "./fileUtils.js";

// ─── Manifest Permission Security Rules ─────────────────────────────────────

/** Permissions that are outright blocked — too dangerous for AI-generated extensions */
const BLOCKED_PERMISSIONS = new Set([
  "debugger",        // Arbitrary code debugging on any tab
  "proxy",           // Intercept/modify all network traffic
  "vpnProvider",     // VPN traffic interception
  "nativeMessaging", // Communicate with native executables on host OS
]);

/** Permissions that are allowed but flagged as warnings in the audit log */
const WARNED_PERMISSIONS = new Set([
  "webRequest",
  "webRequestBlocking",
  "cookies",
  "history",
  "management",
  "browsingData",
  "downloads",
]);

/**
 * Validates the LLM-generated extension output object.
 *
 * Rules:
 * - Output must be a non-null object
 * - manifest.json is required and must be valid JSON with manifest_version: 3
 * - All filenames are validated via sanitizeFilename (allowlisted chars + extensions)
 * - All file contents must be non-empty strings
 * - Manifest permissions are audited against blocked/warned lists
 * - Content Security Policy is checked for unsafe directives
 *
 * @param {object} output - The parsed LLM response (filename → content map)
 * @throws {Error} If validation fails
 * @returns {{ warnings: string[] }} Audit warnings (non-fatal)
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

  // ─── Permission Security Audit ──────────────────────────────────────────
  const warnings = [];
  const allPermissions = [
    ...(manifest.permissions || []),
    ...(manifest.optional_permissions || []),
  ];

  for (const perm of allPermissions) {
    if (BLOCKED_PERMISSIONS.has(perm)) {
      throw new Error(
        `manifest.json contains blocked permission: "${perm}". ` +
        `This permission is too dangerous for AI-generated extensions.`
      );
    }

    if (WARNED_PERMISSIONS.has(perm)) {
      const msg = `⚠️  Sensitive permission detected: "${perm}" — review carefully before installing.`;
      warnings.push(msg);
      console.warn(`[manifest-audit] ${msg}`);
    }
  }

  // ─── Host Permission Audit ────────────────────────────────────────────
  const hostPermissions = manifest.host_permissions || [];
  for (const host of hostPermissions) {
    if (host === "<all_urls>" || host === "*://*/*") {
      const msg = `⚠️  Broad host permission detected: "${host}" — grants access to all websites.`;
      warnings.push(msg);
      console.warn(`[manifest-audit] ${msg}`);
    }
  }

  // ─── Content Security Policy Audit ────────────────────────────────────
  const csp = manifest.content_security_policy;
  if (csp) {
    const cspString = typeof csp === "string" ? csp : JSON.stringify(csp);
    if (cspString.includes("unsafe-eval")) {
      throw new Error(
        "manifest.json content_security_policy contains 'unsafe-eval' which is blocked for security."
      );
    }
    if (cspString.includes("unsafe-inline")) {
      throw new Error(
        "manifest.json content_security_policy contains 'unsafe-inline' which is blocked for security."
      );
    }
  }

  return { warnings };
}

