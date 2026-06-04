/**
 * csrfProtection.js — CSRF Protection Middleware
 *
 * Provides CSRF token generation and validation middleware for Express routes.
 * Uses a double-submit cookie pattern to protect against Cross-Site Request Forgery.
 *
 * @module utils/csrfProtection
 */

import crypto from "crypto";

/**
 * Middleware that generates a random CSRF token, sets it as a cookie, and
 * attaches it to the request object for use in responses/templates.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function generateCsrfToken(req, res, next) {
  const token = crypto.randomBytes(32).toString("hex");

  res.cookie("extensio_csrf", token, {
    httpOnly: false,  // Must be readable by frontend JS for double-submit pattern
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });

  req.csrfToken = token;
  next();
}

/**
 * Middleware that validates CSRF tokens on state-changing requests
 * (POST, PUT, PATCH, DELETE) by comparing the X-CSRF-Token header
 * with the extensio_csrf cookie value.
 *
 * Skips validation for the Stripe webhook endpoint which uses its own
 * signature-based verification.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateCsrf(req, res, next) {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];

  // Skip validation for safe (non-state-changing) HTTP methods
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip CSRF validation for the Stripe webhook path (uses its own signature verification)
  if (req.path === "/api/stripe/webhook") {
    return next();
  }

  const headerToken = req.headers["x-csrf-token"];
  const cookieToken = req.cookies?.extensio_csrf;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({
      error: "Invalid or missing CSRF token.",
    });
  }

  next();
}
