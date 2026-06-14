/**
 * promptGuard.js — Prompt Injection Detection & Sanitization
 *
 * Protects the AI generation pipeline from prompt injection attacks
 * by scanning user prompts for known injection patterns and enforcing
 * length limits before they reach the LLM.
 *
 * @module utils/promptGuard
 */

/** Maximum allowed prompt length in characters */
const MAX_PROMPT_LENGTH = 5000;

/**
 * Patterns that indicate prompt injection attempts.
 * Each entry has a regex pattern and a human-readable description.
 */
const INJECTION_PATTERNS = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, desc: "Attempt to override system prompt" },
  { pattern: /ignore\s+(the\s+)?(above|system|initial)\s+(prompt|instructions|rules)/i, desc: "Attempt to override system prompt" },
  { pattern: /disregard\s+(all\s+)?(?:previous|above|prior|your)\s/i, desc: "Attempt to disregard rules" },
  { pattern: /you\s+are\s+now\s+(?:a\s+)?(?:different|new|evil|unrestricted|unfiltered)/i, desc: "Role reassignment attempt" },
  { pattern: /override\s+(system|safety|security|your)\s/i, desc: "System override attempt" },
  { pattern: /pretend\s+(?:you\s+are|to\s+be)\s+(?:a|an)\s+(?:different|unrestricted|evil)/i, desc: "Role reassignment attempt" },
  { pattern: /do\s+not\s+follow\s+(?:the|any|your)\s+rules/i, desc: "Rule bypass attempt" },
  { pattern: /jailbreak/i, desc: "Jailbreak keyword detected" },
  { pattern: /\bDAN\b.*\bmode\b/i, desc: "DAN mode jailbreak attempt" },
  { pattern: /bypass\s+(?:your|the|all)\s+(?:filters|restrictions|safety|rules)/i, desc: "Filter bypass attempt" },
  { pattern: /act\s+as\s+(?:an?\s+)?(?:unrestricted|unfiltered|evil)/i, desc: "Role reassignment attempt" },
  { pattern: /output\s+(?:your|the)\s+(?:system|initial)\s+prompt/i, desc: "System prompt extraction attempt" },
  { pattern: /reveal\s+(?:your|the)\s+(?:system|hidden|secret)\s+(?:prompt|instructions)/i, desc: "System prompt extraction attempt" },
];

/**
 * Dangerous content patterns — prompts asking to generate malicious extensions.
 * These are softer checks — we warn but still allow (the code sanitizer catches actual malicious output).
 */
const DANGEROUS_INTENT_PATTERNS = [
  { pattern: /(?:steal|harvest|exfiltrate)\s+(?:cookies|passwords|credentials|tokens|data)/i, desc: "Data theft intent" },
  { pattern: /(?:keylog|key\s*log)/i, desc: "Keylogger intent" },
  { pattern: /crypto\s*(?:min(?:e|ing)|jack)/i, desc: "Cryptomining intent" },
  { pattern: /(?:phishing|spoof|fake\s+login)/i, desc: "Phishing intent" },
  { pattern: /(?:ransomware|encrypt\s+(?:their|user)\s+files)/i, desc: "Ransomware intent" },
  { pattern: /(?:send|upload|post)\s+(?:to|data\s+to)\s+(?:my|external|remote)\s+server/i, desc: "Data exfiltration intent" },
];

/**
 * Validates and sanitizes a user prompt before it reaches the LLM.
 *
 * @param {string} prompt - The raw user prompt
 * @returns {{ sanitized: string, warnings: string[] }} The cleaned prompt and any warnings
 * @throws {Error} If the prompt contains injection patterns or exceeds length limits
 */
export function sanitizeUserPrompt(prompt) {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Prompt must be a non-empty string.");
  }

  const trimmed = prompt.trim();

  // Length check
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    throw new Error(
      `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters (received ${trimmed.length}). Please shorten your description.`
    );
  }

  if (trimmed.length < 3) {
    throw new Error("Prompt is too short. Please provide a meaningful description of the extension you want.");
  }

  // Injection pattern check — hard reject
  for (const { pattern, desc } of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn(`[prompt-guard] ⛔ Prompt injection detected: ${desc}`);
      console.warn(`[prompt-guard] Prompt (first 200 chars): "${trimmed.slice(0, 200)}"`);
      throw new Error(
        "Your prompt contains patterns that resemble prompt injection attempts. " +
        "Please rephrase your extension request using a natural description."
      );
    }
  }

  // Dangerous intent check — soft warning (still allowed, code sanitizer catches output)
  const warnings = [];
  for (const { pattern, desc } of DANGEROUS_INTENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      warnings.push(`⚠️ Potentially dangerous intent detected: ${desc}`);
      console.warn(`[prompt-guard] ⚠️ Dangerous intent flagged: ${desc}`);
    }
  }

  return { sanitized: trimmed, warnings };
}
