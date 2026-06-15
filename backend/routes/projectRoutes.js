import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { listProjects, getProject, deleteProject, renameProject } from "../services/projectService.js";
import { requireAuth } from "../utils/auth.js";
import { zipFolder } from "../services/extensionService.js";
import { safePath, sanitizeFilename } from "../utils/fileUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");
const TMP_DIR = path.join(__dirname, "..", "tmp");

const router = express.Router();

// Secure all endpoints with authentication
router.use(requireAuth);

/**
 * GET /api/projects
 * Lists all projects for the authenticated user (metadata only, no code files).
 */
router.get("/", async (req, res) => {
  const projects = await listProjects(req.user._id);
  res.json(projects);
});

/**
 * GET /api/projects/:id
 * Returns a specific project including all file contents.
 */
router.get("/:id", async (req, res) => {
  const project = await getProject(req.params.id, req.user._id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(project);
});

/**
 * PATCH /api/projects/:id/rename
 * Renames a project.
 */
router.patch("/:id/rename", async (req, res) => {
  try {
    const { projectName } = req.body;
    if (!projectName || typeof projectName !== "string" || projectName.trim().length === 0) {
      return res.status(400).json({ error: "A valid non-empty 'projectName' string is required." });
    }

    const updated = await renameProject(req.params.id, projectName.trim(), req.user._id);
    if (!updated) {
      return res.status(404).json({ error: "Project not found or access denied." });
    }

    res.json(updated);
  } catch (error) {
    console.error("[projectRoutes/rename] error:", error);
    res.status(500).json({ error: "Failed to rename project." });
  }
});

/**
 * DELETE /api/projects/:id
 * Deletes a project.
 */
router.delete("/:id", async (req, res) => {
  try {
    const success = await deleteProject(req.params.id, req.user._id);
    if (!success) {
      return res.status(404).json({ error: "Project not found or access denied." });
    }
    res.json({ success: true, message: "Project deleted successfully." });
  } catch (error) {
    console.error("[projectRoutes/delete] error:", error);
    res.status(500).json({ error: "Failed to delete project." });
  }
});

/**
 * GET /api/projects/:id/versions/:versionId/preview/*
 * Serves a specific version's code files dynamically with correct MIME types
 * to allow full live relative assets loading inside a preview frame.
 */
router.get("/:id/versions/:versionId/preview/*", async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const requestedFile = req.params[0]; // e.g. "popup.html", "popup.js", "popup.css"

    if (!requestedFile) {
      return res.status(400).json({ error: "Filename parameter is required." });
    }

    const project = await getProject(id, req.user._id);
    if (!project) {
      return res.status(404).json({ error: "Project not found or access denied." });
    }

    const version = project.versions.find((v) => v.versionId === versionId);
    if (!version) {
      return res.status(404).json({ error: "Project version not found." });
    }

    const filesObj = typeof version.files.entries === "function"
      ? Object.fromEntries(version.files)
      : version.files;

    if (!filesObj[requestedFile]) {
      return res.status(404).json({ error: `File '${requestedFile}' not found in this version.` });
    }

    const fileContent = filesObj[requestedFile];

    // Determine correct MIME type based on file extension
    const ext = path.extname(requestedFile).toLowerCase();
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml"
    };

    const contentType = mimeTypes[ext] || "text/plain; charset=utf-8";
    res.setHeader("Content-Type", contentType);

    if (ext === ".html") {
      const injectionScript = `
<script>
(function() {
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  
  function sendLog(type, args) {
    const msg = Array.from(args).map(arg => {
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch(e) { return String(arg); }
      }
      return String(arg);
    }).join(' ');
    window.parent.postMessage({ type: 'CONSOLE_LOG', level: type, message: msg }, '*');
  }

  console.log = function() {
    sendLog('log', arguments);
    origLog.apply(console, arguments);
  };
  console.warn = function() {
    sendLog('warn', arguments);
    origWarn.apply(console, arguments);
  };
  console.error = function() {
    sendLog('error', arguments);
    origError.apply(console, arguments);
  };

  window.addEventListener('error', function(e) {
    window.parent.postMessage({ 
      type: 'CONSOLE_LOG', 
      level: 'error', 
      message: 'Runtime Error: ' + e.message + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno
    }, '*');
  });

  window.addEventListener('unhandledrejection', function(e) {
    window.parent.postMessage({ 
      type: 'CONSOLE_LOG', 
      level: 'error', 
      message: 'Unhandled Promise Rejection: ' + e.reason 
    }, '*');
  });

  if (!window.chrome) {
    const pathParts = window.location.pathname.split('/');
    const projectId = pathParts[3] || 'default';
    const storageKeyPrefix = 'extensio_project_' + projectId + '_';

    window.chrome = {
      runtime: {
        id: 'mock-extension-id',
        getURL: function(path) { return path; },
        sendMessage: function(message, responseCallback) {
          console.log('[chrome.runtime.sendMessage]', message);
          if (responseCallback) {
            setTimeout(() => responseCallback({ status: 'success', mock: true }), 0);
          }
        },
        onMessage: {
          addListener: function(listener) {
            console.log('[chrome.runtime.onMessage.addListener] registered listener');
            window.addEventListener('message', function(event) {
              if (event.data && event.data.type === 'SIMULATED_BACKGROUND_MESSAGE') {
                listener(event.data.message, {}, function(response) {
                  console.log('[chrome.runtime.onMessage] response from listener:', response);
                });
              }
            });
          },
          removeListener: function() {},
          hasListener: function() { return true; }
        }
      },
      storage: {
        local: {
          get: function(keys, callback) {
            const result = {};
            try {
              if (typeof keys === 'string') {
                const val = localStorage.getItem(storageKeyPrefix + keys);
                result[keys] = val ? JSON.parse(val) : undefined;
              } else if (Array.isArray(keys)) {
                keys.forEach(k => {
                  const val = localStorage.getItem(storageKeyPrefix + k);
                  result[k] = val ? JSON.parse(val) : undefined;
                });
              } else if (typeof keys === 'object' && keys !== null) {
                Object.keys(keys).forEach(k => {
                  const val = localStorage.getItem(storageKeyPrefix + k);
                  result[k] = val ? JSON.parse(val) : keys[k];
                });
              } else {
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && key.indexOf(storageKeyPrefix) === 0) {
                    const realKey = key.substring(storageKeyPrefix.length);
                    const val = localStorage.getItem(key);
                    result[realKey] = val ? JSON.parse(val) : undefined;
                  }
                }
              }
            } catch (e) {
              console.error('chrome.storage.local.get error:', e);
            }
            if (callback) callback(result);
            return Promise.resolve(result);
          },
          set: function(items, callback) {
            try {
              Object.keys(items).forEach(k => {
                localStorage.setItem(storageKeyPrefix + k, JSON.stringify(items[k]));
              });
            } catch (e) {
              console.error('chrome.storage.local.set error:', e);
            }
            if (callback) callback();
            return Promise.resolve();
          },
          remove: function(keys, callback) {
            try {
              if (typeof keys === 'string') {
                localStorage.removeItem(storageKeyPrefix + keys);
              } else if (Array.isArray(keys)) {
                keys.forEach(k => localStorage.removeItem(storageKeyPrefix + k));
              }
            } catch (e) {
              console.error('chrome.storage.local.remove error:', e);
            }
            if (callback) callback();
            return Promise.resolve();
          },
          clear: function(callback) {
            try {
              const toRemove = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.indexOf(storageKeyPrefix) === 0) {
                  toRemove.push(key);
                }
              }
              toRemove.forEach(k => localStorage.removeItem(k));
            } catch (e) {
              console.error('chrome.storage.local.clear error:', e);
            }
            if (callback) callback();
            return Promise.resolve();
          }
        },
        sync: {
          get: function(keys, callback) { return window.chrome.storage.local.get(keys, callback); },
          set: function(items, callback) { return window.chrome.storage.local.set(items, callback); },
          remove: function(keys, callback) { return window.chrome.storage.local.remove(keys, callback); },
          clear: function(callback) { return window.chrome.storage.local.clear(callback); }
        }
      },
      tabs: {
        query: function(queryInfo, callback) {
          const mockTabs = [{ id: 1, url: 'https://example.com', title: 'Example Page', active: true }];
          if (callback) callback(mockTabs);
          return Promise.resolve(mockTabs);
        },
        create: function(createProperties, callback) {
          console.log('[chrome.tabs.create]', createProperties);
          const mockTab = { id: 2, url: createProperties.url || '', active: true };
          if (callback) callback(mockTab);
          return Promise.resolve(mockTab);
        }
      }
    };
  }
})();
</script>`;

      let modifiedContent = fileContent;
      if (fileContent.includes("<head>")) {
        modifiedContent = fileContent.replace("<head>", "<head>" + injectionScript);
      } else if (fileContent.includes("<body>")) {
        modifiedContent = fileContent.replace("<body>", "<body>" + injectionScript);
      } else {
        modifiedContent = injectionScript + fileContent;
      }
      res.send(modifiedContent);
    } else {
      res.send(fileContent);
    }
  } catch (error) {
    console.error("[projectRoutes/preview] error:", error);
    res.status(500).json({ error: "Failed to serve preview asset." });
  }
});

/**
 * GET /api/projects/:id/versions/:versionId/download
 * Compiles a specific version's code files from MongoDB, packages them into a ZIP archive,
 * and streams it directly to the browser.
 */
router.get("/:id/versions/:versionId/download", async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const project = await getProject(id, req.user._id);
    if (!project) {
      return res.status(404).json({ error: "Project not found or access denied." });
    }

    const version = project.versions.find((v) => v.versionId === versionId);
    if (!version) {
      return res.status(404).json({ error: "Project version not found." });
    }

    // Create a temp folder for packaging
    const tempId = uuidv4();
    const tempFolder = path.join(TMP_DIR, tempId);
    await fs.mkdir(tempFolder, { recursive: true });

    try {
      // Write files to the temporary directory
      const filesObj = typeof version.files.entries === "function"
        ? Object.fromEntries(version.files)
        : version.files;

      for (const [filename, fileBody] of Object.entries(filesObj)) {
        const sanitized = sanitizeFilename(filename);
        const filePath = safePath(tempFolder, sanitized);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, fileBody, "utf8");
      }

      // Build the ZIP archive
      const cleanProjName = project.projectName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
      const zipName = `${cleanProjName}-${versionId}.zip`;
      const zipPath = path.join(DOWNLOADS_DIR, zipName);
      
      await zipFolder(tempFolder, zipPath);

      // Verify ZIP integrity
      const zipStats = await fs.stat(zipPath);
      if (zipStats.size === 0) {
        throw new Error("Created ZIP is empty.");
      }

      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Content-Length": zipStats.size,
      });

      // Stream ZIP to client
      res.sendFile(zipPath);
    } finally {
      // Clean up the temporary packaging directory asynchronously after response
      setTimeout(() => {
        fs.rm(tempFolder, { recursive: true, force: true }).catch(() => {});
      }, 5000);
    }
  } catch (error) {
    console.error("[projectRoutes/download] error:", error.message);
    res.status(500).json({ error: "Failed to compile and download project version." });
  }
});

export default router;
