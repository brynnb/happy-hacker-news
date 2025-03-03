import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { setupDatabase } from "./db/database.js";
import { fetchAndStoreHackerNews } from "./scraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize database
setupDatabase();

// API routes
app.get("/api/stories", async (req, res) => {
  try {
    const db = await setupDatabase();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const filter = (req.query.filter as string) || "all";
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM stories";
    const params: any[] = [];

    // Add filter conditions if needed
    if (filter === "homepage") {
      query += " WHERE position IS NOT NULL";
    }

    // Add ordering - use submitted_timestamp if available, otherwise fall back to timestamp
    query +=
      " ORDER BY CASE WHEN submitted_timestamp IS NOT NULL THEN submitted_timestamp ELSE timestamp/1000 END DESC";

    // Add pagination
    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error("Error fetching stories:", err);
        return res.status(500).json({ error: "Failed to fetch stories" });
      }

      res.json(rows);
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Fetch new stories from Hacker News
app.post("/api/fetch-stories", async (req, res) => {
  try {
    await fetchAndStoreHackerNews();
    res.json({
      success: true,
      message: "Stories fetched and stored successfully",
    });
  } catch (error) {
    console.error("Error fetching stories:", error);
    res.status(500).json({ error: "Failed to fetch stories" });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Fetch stories on server start
fetchAndStoreHackerNews().catch(console.error);
