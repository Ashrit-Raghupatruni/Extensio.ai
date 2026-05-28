import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import connectDB from "./utils/db.js";
import authRoutes from "./routes/authRoutes.js";
import extensionRoutes from "./routes/extensionRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import { cleanupOldFiles } from "./utils/fileUtils.js";
import { createRateLimiter } from "./utils/rateLimiter.js";

// Connect to MongoDB
await connectDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Global API Rate Limiting (60 requests/minute per IP) ---
app.use("/api", createRateLimiter({ windowMs: 60 * 1000, max: 60, message: "Too many requests. Please slow down and try again." }));

// --- Static files ---
const publicPath = fs.existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public")
  : path.join(__dirname, "..", "frontend");

app.use(express.static(publicPath));
app.use("/downloads", express.static(path.join(__dirname, "downloads")));

// --- API Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/extensions", extensionRoutes);
app.use("/api/projects", projectRoutes);

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "extensio.ai",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// --- Global error handler ---
app.use((err, req, res, _next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// --- Periodic cleanup ---
const DOWNLOADS_DIR = path.join(__dirname, "downloads");
const TMP_DIR = path.join(__dirname, "tmp");
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FILE_AGE_MS = 60 * 60 * 1000; // 1 hour

async function runCleanup() {
  console.log("[cleanup] Running periodic cleanup...");
  await cleanupOldFiles(DOWNLOADS_DIR, MAX_FILE_AGE_MS);
  await cleanupOldFiles(TMP_DIR, MAX_FILE_AGE_MS);
}

// Run cleanup on startup and then periodically
runCleanup();
const cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);

// --- Start server ---
const server = app.listen(PORT, () => {
  console.log(`\n  ✦ Extensio.ai backend running on http://localhost:${PORT}`);
  console.log(`  ✦ API docs: POST /api/extensions/generate`);
  console.log(`  ✦ Health check: GET /api/health\n`);

  // Boot environment checks
  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️  [Warning] GEMINI_API_KEY is not defined in the environment variables!");
    console.warn("⚠️  [Warning] The engine will run using OFFLINE SMART MOCK MODE HEURISTICS.\n");
  } else {
    console.log("✅ [Success] GEMINI_API_KEY verified. AI Orchestration Engine is online!\n");
  }
});

// --- Graceful Shutdown Handler ---
import mongoose from "mongoose";

async function gracefulShutdown(signal) {
  console.log(`\n[server] ${signal} signal received. Starting graceful shutdown sequence...`);
  
  // 1. Clear files cleanup intervals
  clearInterval(cleanupInterval);
  console.log("[server] Periodic files cleanup interval cleared.");

  // 2. Shut down express HTTP listener
  server.close(async () => {
    console.log("[server] Express server closed. No longer accepting new connections.");
    
    try {
      // 3. Cleanly close MongoDB connection pool
      await mongoose.connection.close();
      console.log("[server] MongoDB connection terminated cleanly.");
      
      console.log("[server] Graceful shutdown completed. Exiting process.");
      process.exit(0);
    } catch (err) {
      console.error("[server] Error closing MongoDB connection:", err);
      process.exit(1);
    }
  });

  // Force shutdown backup timeout (10 seconds)
  setTimeout(() => {
    console.error("[server] Forced shutdown initiated due to timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));


