import User from "../models/User.js";

/**
 * Utility to inspect a prompt for premium keywords representing "Advanced Features"
 * (e.g. API requests, background handlers, cross-origin requests, cookies).
 * @param {string} prompt 
 * @returns {boolean} True if prompt requests advanced premium features
 */
export function isAdvancedPrompt(prompt) {
  if (!prompt || typeof prompt !== "string") return false;
  const lowercasePrompt = prompt.toLowerCase();
  const advancedKeywords = [
    "api", "fetch", "ajax", "axios", "http request", "https request",
    "background script", "background worker", "service worker",
    "webrequest", "cookie", "storage.sync", "cross-origin", "cors"
  ];
  return advancedKeywords.some(keyword => lowercasePrompt.includes(keyword));
}

/**
 * Express middleware to enforce subscription limit checks and feature gates.
 * Allows Pro/Premium users to bypass all limits.
 */
export async function checkSubscriptionLimit(req, res, next) {
  const user = req.user;
  const { prompt } = req.body;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized. User profile missing." });
  }

  // If user is premium/pro, bypass all checks
  if (user.subscriptionTier === "premium" || user.subscriptionTier === "pro") {
    return next();
  }

  // 1. Generation limits check
  if (user.usageCount >= user.maxFreeGenerations) {
    return res.status(403).json({
      error: "Subscription limit reached.",
      code: "FREE_LIMIT_EXCEEDED",
      message: `You have exhausted your ${user.maxFreeGenerations} free generation credits. Please upgrade to Premium Pro to unlock unlimited generations!`
    });
  }

  // 2. Advanced features check
  if (prompt && isAdvancedPrompt(prompt)) {
    return res.status(403).json({
      error: "Premium Feature Required.",
      code: "PREMIUM_FEATURE_REQUIRED",
      message: "External API requests, background workers, and cross-origin calls are advanced features. Please upgrade to Premium Pro to build extensions with these capabilities!"
    });
  }

  next();
}
