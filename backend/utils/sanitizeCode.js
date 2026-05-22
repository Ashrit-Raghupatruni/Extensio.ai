/**
 * sanitizeCode.js — AI-Generated Extension Security Scanner
 *
 * Scans every file in the AI-generated output for dangerous patterns
 * including eval(), malicious scripts, external unsafe URLs, crypto miners,
 * hidden trackers, data exfiltration, and obfuscation techniques.
 *
 * @module utils/sanitizeCode
 */

// ─── Known Malicious Domains ────────────────────────────────────────────────
const CRYPTO_MINER_DOMAINS = [
  "coinhive.com",
  "coin-hive.com",
  "crypto-loot.com",
  "jsecoin.com",
  "authedmine.com",
  "ppoi.org",
  "cryptonight.wasm",
  "minero.cc",
  "webmine.cz",
];

const TRACKER_DOMAINS = [
  "doubleclick.net",
  "googlesyndication.com",
  "adservice.google.com",
  "facebook.com/tr",
  "connect.facebook.net",
  "analytics.tiktok.com",
  "mc.yandex.ru",
];

// ─── Dangerous Code Patterns ────────────────────────────────────────────────
// Each entry: { pattern: RegExp, category: string, description: string }
const DANGEROUS_PATTERNS = [
  // === Code Execution ===
  {
    pattern: /\beval\s*\(/gi,
    category: "Code Execution",
    description: "eval() can execute arbitrary code and is a critical security risk",
  },
  {
    pattern: /new\s+Function\s*\(/gi,
    category: "Code Execution",
    description: "new Function() dynamically creates executable code from strings",
  },
  {
    pattern: /setTimeout\s*\(\s*["'`]/gi,
    category: "Code Execution",
    description: "setTimeout() with a string argument executes code dynamically (use a function reference instead)",
  },
  {
    pattern: /setInterval\s*\(\s*["'`]/gi,
    category: "Code Execution",
    description: "setInterval() with a string argument executes code dynamically (use a function reference instead)",
  },

  // === Script Injection ===
  {
    pattern: /<script[^>]+src\s*=\s*["']http:/gi,
    category: "Script Injection",
    description: "Loading external scripts over insecure HTTP is blocked",
  },
  {
    pattern: /document\.write\s*\(/gi,
    category: "Script Injection",
    description: "document.write() can overwrite the entire DOM and inject malicious content",
  },

  // === Data Exfiltration ===
  {
    pattern: /navigator\.sendBeacon\s*\(/gi,
    category: "Data Exfiltration",
    description: "navigator.sendBeacon() can silently send data to external servers",
  },
  {
    pattern: /new\s+WebSocket\s*\(\s*["'`]ws:/gi,
    category: "Data Exfiltration",
    description: "Insecure WebSocket (ws://) connections can leak data without encryption",
  },

  // === Obfuscation Techniques ===
  {
    pattern: /atob\s*\([^)]*\)\s*\)\s*;?\s*$/gim,
    category: "Obfuscation",
    description: "atob() used in a suspicious execution context (potential obfuscated code execution)",
  },
  {
    pattern: /String\.fromCharCode\s*\(\s*\d+\s*(,\s*\d+\s*){10,}\)/gi,
    category: "Obfuscation",
    description: "Long String.fromCharCode() chains are commonly used to obfuscate malicious payloads",
  },
  {
    pattern: /(\\x[0-9a-f]{2}){10,}/gi,
    category: "Obfuscation",
    description: "Bulk hex escape sequences (\\x..) detected — common obfuscation technique",
  },
];

// ─── URL Safety Scanner ─────────────────────────────────────────────────────
/**
 * Checks a file's content for references to known malicious domains.
 * @param {string} content - File content to scan
 * @param {string} filename - Name of the file being scanned
 * @returns {string[]} Array of violation descriptions
 */
function scanForMaliciousDomains(content, filename) {
  const violations = [];
  const lowerContent = content.toLowerCase();

  for (const domain of CRYPTO_MINER_DOMAINS) {
    if (lowerContent.includes(domain)) {
      violations.push(
        `[${filename}] 🪙 Crypto Miner: Reference to known crypto-mining domain "${domain}" detected`
      );
    }
  }

  for (const domain of TRACKER_DOMAINS) {
    if (lowerContent.includes(domain)) {
      violations.push(
        `[${filename}] 🕵️ Hidden Tracker: Reference to known tracking domain "${domain}" detected`
      );
    }
  }

  return violations;
}

// ─── External URL Scanner ───────────────────────────────────────────────────
/**
 * Detects insecure HTTP URLs in JS and HTML files.
 * Allows http://localhost and http://127.0.0.1 for local development.
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @returns {string[]} Violations
 */
function scanForInsecureURLs(content, filename) {
  const violations = [];
  const ext = filename.split(".").pop().toLowerCase();

  // Only scan JS, HTML, and CSS files for external URLs
  if (!["js", "html", "css"].includes(ext)) return violations;

  const httpMatches = content.match(/https?:\/\/[^\s"'`<>)}\]]+/gi) || [];

  for (const url of httpMatches) {
    // Allow https, localhost, and 127.0.0.1
    if (url.startsWith("https://")) continue;
    if (url.includes("localhost") || url.includes("127.0.0.1")) continue;

    violations.push(
      `[${filename}] 🔓 Insecure URL: Detected insecure HTTP URL "${url.slice(0, 80)}". Use HTTPS instead`
    );
  }

  return violations;
}

// ─── Hidden Pixel Tracker Scanner ───────────────────────────────────────────
/**
 * Detects hidden tracking pixels (1x1 images) in HTML files.
 * @param {string} content - HTML file content
 * @param {string} filename - Filename
 * @returns {string[]} Violations
 */
function scanForTrackingPixels(content, filename) {
  const violations = [];
  if (!filename.endsWith(".html")) return violations;

  // Match <img> tags with 1x1 or 0x0 dimensions
  const pixelPatterns = [
    /(<img[^>]*(?:width|height)\s*=\s*["']?[01](?:px)?["']?[^>]*(?:width|height)\s*=\s*["']?[01](?:px)?["']?[^>]*>)/gi,
    /(<img[^>]*style\s*=\s*["'][^"']*(?:width|height)\s*:\s*[01]px[^"']*["'][^>]*>)/gi,
  ];

  for (const pattern of pixelPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        violations.push(
          `[${filename}] 🕵️ Tracking Pixel: Detected hidden 1x1 tracking image: "${match.slice(0, 100)}..."`
        );
      }
    }
  }

  return violations;
}

// ─── Main Sanitization Function ─────────────────────────────────────────────
/**
 * Scans all files in an AI-generated extension output for security violations.
 *
 * @param {object} files - Map of { filename: content } from the LLM output
 * @returns {{ safe: boolean, violations: string[] }} Security audit report
 */
export function sanitizeGeneratedCode(files) {
  const violations = [];

  for (const [filename, content] of Object.entries(files)) {
    if (typeof content !== "string") continue;

    // 1. Scan for dangerous code patterns
    for (const rule of DANGEROUS_PATTERNS) {
      if (rule.pattern.test(content)) {
        violations.push(
          `[${filename}] ⛔ ${rule.category}: ${rule.description}`
        );
        // Reset regex lastIndex (global flag)
        rule.pattern.lastIndex = 0;
      }
      // Always reset for safety
      rule.pattern.lastIndex = 0;
    }

    // 2. Scan for known malicious domains (crypto miners, trackers)
    violations.push(...scanForMaliciousDomains(content, filename));

    // 3. Scan for insecure HTTP URLs
    violations.push(...scanForInsecureURLs(content, filename));

    // 4. Scan for hidden tracking pixels in HTML
    violations.push(...scanForTrackingPixels(content, filename));
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}
