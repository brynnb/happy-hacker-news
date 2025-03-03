import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import axios from "axios";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS to allow requests from the frontend
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());

// Database setup
let db;

const setupDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const dbPath = path.join(__dirname, "hn.db");
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error("Error connecting to database:", err);
        reject(err);
        return;
      }

      console.log("Connected to SQLite database");

      // Create stories table if it doesn't exist
      db.run(
        `
        CREATE TABLE IF NOT EXISTS stories (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          url TEXT,
          points INTEGER,
          comments INTEGER,
          timestamp INTEGER NOT NULL
        )
      `,
        (err) => {
          if (err) {
            console.error("Error creating stories table:", err);
            reject(err);
            return;
          }

          // Check if position column exists, add it if it doesn't
          db.all(`PRAGMA table_info(stories)`, (err, rows) => {
            if (err) {
              console.error("Error checking table schema:", err);
              reject(err);
              return;
            }

            const hasPositionColumn = rows.some(
              (row) => row.name === "position"
            );

            if (!hasPositionColumn) {
              console.log("Adding position column to stories table");
              db.run(
                `ALTER TABLE stories ADD COLUMN position INTEGER`,
                (err) => {
                  if (err) {
                    console.error("Error adding position column:", err);
                    reject(err);
                    return;
                  }
                  console.log("Database setup complete");
                  resolve(db);
                }
              );
            } else {
              console.log("Database setup complete");
              resolve(db);
            }
          });
        }
      );
    });
  });
};

// Fetch and store Hacker News stories from a specific page
const fetchAndStoreHackerNews = async (page = 1) => {
  try {
    const url =
      page === 1
        ? "https://news.ycombinator.com/"
        : `https://news.ycombinator.com/news?p=${page}`;

    console.log(`Fetching Hacker News page ${page} from ${url}`);

    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    const stories = [];

    // Use a single timestamp for all stories in this batch
    const batchTimestamp = Date.now();

    // Parse the stories from the HTML
    // The structure of HN has changed - each story is in a tr with class="athing"
    $("tr.athing").each((i, element) => {
      const id = $(element).attr("id") || "";
      const titleElement = $(element).find(".titleline > a").first();
      const title = titleElement.text().trim();
      const url = titleElement.attr("href") || null;

      // Get the subtext row which contains points and comments
      const subtext = $(element).next("tr").find(".subtext");

      // Extract points
      const pointsText = subtext.find(".score").text().trim();
      const points = pointsText
        ? parseInt(pointsText.match(/(\d+)/)?.[0] || "0")
        : 0;

      // Extract comments count - find the last <a> tag that contains "comments"
      const links = subtext.find("a");
      let comments = 0;

      links.each((i, link) => {
        const linkText = $(link).text().trim();
        if (linkText.includes("comment")) {
          const match = linkText.match(/(\d+)/);
          comments = match ? parseInt(match[0]) : 0;
        }
      });

      // Only add if we have a valid ID and title
      if (id && title) {
        stories.push({
          id,
          title,
          url,
          points,
          comments,
          timestamp: batchTimestamp,
          position: i + (page - 1) * 30, // Adjust position based on page number (30 stories per page)
        });
      }
    });

    // Store stories in the database
    const db = await setupDatabase();

    // Use a transaction for better performance
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO stories (id, title, url, points, comments, timestamp, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stories.forEach((story) => {
        stmt.run(
          story.id,
          story.title,
          story.url,
          story.points,
          story.comments,
          story.timestamp,
          story.position
        );
      });

      stmt.finalize();
      db.run("COMMIT");
    });

    console.log(
      `Fetched and stored ${stories.length} stories from Hacker News page ${page}`
    );
    return stories;
  } catch (error) {
    console.error(`Error fetching Hacker News page ${page}:`, error);
    throw error;
  }
};

// Fetch multiple pages with rate limiting
const fetchMultiplePages = async (maxPages = 5) => {
  try {
    // Always fetch the first page immediately
    await fetchAndStoreHackerNews(1);

    // Then fetch subsequent pages with rate limiting
    for (let page = 2; page <= maxPages; page++) {
      // Wait 5 seconds between page requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await fetchAndStoreHackerNews(page);
    }

    console.log(`Completed fetching ${maxPages} pages from Hacker News`);
  } catch (error) {
    console.error("Error in fetchMultiplePages:", error);
  }
};

// Initialize database
setupDatabase();

// API routes
app.get("/api/stories", async (req, res) => {
  try {
    const db = await setupDatabase();

    db.all("SELECT * FROM stories ORDER BY position ASC", [], (err, rows) => {
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
    const maxPages = req.body.maxPages || 5;
    await fetchMultiplePages(maxPages);
    res.json({
      success: true,
      message: `Stories fetched and stored successfully from ${maxPages} pages`,
    });
  } catch (error) {
    console.error("Error fetching stories:", error);
    res.status(500).json({ error: "Failed to fetch stories" });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist/index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Fetch stories on server start
  fetchMultiplePages().catch(console.error);

  // Set up periodic scraping of the front page every minute
  setInterval(() => {
    console.log("Running scheduled update of Hacker News front page");
    fetchAndStoreHackerNews(1).catch(console.error);
  }, 60000); // 60000 ms = 1 minute

  // Set up periodic full refresh (all pages) every 30 minutes
  setInterval(() => {
    console.log("Running scheduled full refresh of all Hacker News pages");
    fetchMultiplePages().catch(console.error);
  }, 1800000); // 1800000 ms = 30 minutes
});
