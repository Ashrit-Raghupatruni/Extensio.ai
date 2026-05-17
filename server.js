import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import extensionRoutes from "./routes/extensionRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/extensions", extensionRoutes);
app.use("/api/projects", projectRoutes);

app.use("/downloads", express.static(path.join(__dirname, "downloads")));

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.listen(PORT, () => {
  console.log(`Extensio.ai backend running on http://localhost:${PORT}`);
});
