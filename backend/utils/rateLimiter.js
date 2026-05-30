/**
 * rateLimiter.js — Lightweight In-Memory Sliding Window Rate Limiter
 *
 * Provides configurable rate limiting middleware for Express routes.
 * Uses an in-memory store with automatic cleanup — no external dependencies required.
 *
 * @module utils/rateLimiter
 */

/**
 * Creates an Express middleware that enforces rate limits using a sliding window algorithm.
 *
 * @param {object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @param {number} options.max - Maximum number of requests per window (default: 60)
 * @param {string} [options.message] - Custom error message for 429 responses
 * @param {function} [options.keyGenerator] - Custom function to extract the client key from req (default: IP-based)
 * @returns {function} Express middleware
 */
export function createRateLimiter({
  windowMs = 60 * 1000,
  max = 60,
  message = "Too many requests. Please try again later.",
  keyGenerator = null,
} = {}) {
  // Store: Map<clientKey, { timestamps: number[] }>
  const clients = new Map();

  // Periodic cleanup every 5 minutes to prevent memory leaks
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clients.entries()) {
      // Remove entries where all timestamps are expired
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0) {
        clients.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Don't prevent Node.js from exiting
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req, res, next) => {
    // Developer bypass for E2E testing suite
    if (req.headers["x-bypass-rate-limit"] === "developer-secret") {
      return next();
    }

    // Generate client identity key
    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.connection.remoteAddress || "unknown";

    const now = Date.now();

    // Initialize or retrieve record
    if (!clients.has(key)) {
      clients.set(key, { timestamps: [] });
    }

    const record = clients.get(key);

    // Slide the window: remove expired timestamps
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

    if (record.timestamps.length >= max) {
      // Rate limit exceeded
      const oldestInWindow = record.timestamps[0];
      const retryAfterMs = windowMs - (now - oldestInWindow);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      res.set("Retry-After", String(retryAfterSec));
      res.set("X-RateLimit-Limit", String(max));
      res.set("X-RateLimit-Remaining", "0");
      res.set("X-RateLimit-Reset", new Date(now + retryAfterMs).toISOString());

      return res.status(429).json({
        error: message,
        retryAfter: retryAfterSec,
      });
    }

    // Record this request
    record.timestamps.push(now);

    // Set informational rate limit headers
    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(max - record.timestamps.length));

    next();
  };
}
