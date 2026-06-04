import express from "express";
import crypto from "crypto";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { hashPassword, verifyPassword, requireAuth } from "../utils/auth.js";
import { createRateLimiter } from "../utils/rateLimiter.js";

const router = express.Router();
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Rate limiters for auth endpoints
const registerLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: "Too many registration attempts. Please try again later.",
});

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: "Too many login attempts. Please try again later.",
});

/**
 * Helper to set standard HttpOnly cookie
 */
function setSessionCookie(res, token) {
  res.cookie("extensio_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_DURATION_MS,
    path: "/",
  });
}

/**
 * POST /api/auth/register
 * Registers a new user and logs them in immediately.
 */
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters." });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check if username already exists
    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(409).json({ error: "Username is already taken." });
    }

    // Hash password
    const { salt, hash } = hashPassword(password);

    // Save User
    const user = new User({
      username: cleanUsername,
      passwordHash: hash,
      salt,
    });
    await user.save();

    // Create session immediately
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const session = new Session({
      token: sessionToken,
      userId: user._id,
      expiresAt,
    });
    await session.save();

    setSessionCookie(res, sessionToken);

    res.status(201).json({
      message: "Registration successful",
      token: sessionToken,
      user: {
        id: user._id,
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[auth/register] error:", error);
    res.status(500).json({ error: "Failed to register user." });
  }
});

/**
 * POST /api/auth/login
 * Authenticates user and sets session cookie.
 */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Find user
    const user = await User.findOne({ username: cleanUsername });
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // Verify password
    const isValid = verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const session = new Session({
      token: sessionToken,
      userId: user._id,
      expiresAt,
    });
    await session.save();

    setSessionCookie(res, sessionToken);

    res.json({
      message: "Login successful",
      token: sessionToken,
      user: {
        id: user._id,
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[auth/login] error:", error);
    res.status(500).json({ error: "Failed to login." });
  }
});

/**
 * POST /api/auth/logout
 * Deletes session and clears cookies.
 */
router.post("/logout", requireAuth, async (req, res) => {
  try {
    await Session.deleteOne({ token: req.sessionToken });
    
    // Clear cookie
    res.clearCookie("extensio_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.json({ message: "Logout successful." });
  } catch (error) {
    console.error("[auth/logout] error:", error);
    res.status(500).json({ error: "Failed to logout." });
  }
});

/**
 * GET /api/auth/me
 * Retrieves the currently logged-in user profile.
 */
router.get("/me", requireAuth, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      subscriptionTier: req.user.subscriptionTier || "free",
      usageCount: req.user.usageCount || 0,
      maxFreeGenerations: req.user.maxFreeGenerations || 5,
      createdAt: req.user.createdAt,
    },
  });
});

export default router;
