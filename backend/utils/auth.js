import crypto from "crypto";
import Session from "../models/Session.js";
import User from "../models/User.js";

/**
 * Hashes a plain-text password using native pbkdf2 or scrypt.
 * Uses a random 16-byte salt and scryptSync.
 * @param {string} password
 * @returns {object} { salt, hash }
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

/**
 * Verifies a plain-text password against a salt and hash.
 * @param {string} password
 * @param {string} salt
 * @param {string} hash
 * @returns {boolean} True if password matches, false otherwise
 */
export function verifyPassword(password, salt, hash) {
  const checkHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return checkHash === hash;
}

/**
 * Express middleware to enforce authentication.
 * Checks for token in cookies ('extensio_session') or Authorization header ('Bearer <token>').
 */
export async function requireAuth(req, res, next) {
  let token = null;

  // 1. Try to read token from cookies
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(";").reduce((acc, c) => {
      const parts = c.split("=");
      if (parts[0] && parts[1]) {
        acc[parts[0].trim()] = (parts[1] || "").trim();
      }
      return acc;
    }, {});
    token = cookies["extensio_session"];
  }

  // 2. Try to read token from Authorization header if cookie not present
  if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  try {
    const session = await Session.findOne({ token }).populate("userId");
    if (!session || !session.userId) {
      return res.status(401).json({ error: "Session expired or invalid. Please log in again." });
    }

    // Check expiration manually just in case TTL has not triggered yet
    if (new Date() > session.expiresAt) {
      await Session.deleteOne({ token });
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    req.user = session.userId; // Attaches User model instance
    req.sessionToken = token;
    next();
  } catch (error) {
    console.error("[auth middleware] error:", error);
    res.status(500).json({ error: "Internal server error during authentication." });
  }
}
