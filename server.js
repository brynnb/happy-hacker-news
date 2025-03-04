import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

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

    // Delete the existing database file if it exists
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
        console.log("Deleted existing database file");
      } catch (err) {
        console.error("Error deleting database file:", err);
      }
    }

    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error("Error connecting to database:", err);
        reject(err);
        return;
      }

      console.log("Connected to SQLite database");

      // Create stories table
      db.run(
        `
        CREATE TABLE IF NOT EXISTS stories (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          url TEXT,
          points INTEGER,
          comments INTEGER,
          timestamp INTEGER NOT NULL,
          submission_datetime INTEGER,
          position INTEGER
        )
      `,
        (err) => {
          if (err) {
            console.error("Error creating stories table:", err);
            reject(err);
            return;
          }

          console.log("Database setup complete");
          resolve(db);
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

      // Get the subtext row which contains points, comments, and time
      const subtext = $(element).next("tr").find(".subtext");

      // Extract points
      const pointsText = subtext.find(".score").text().trim();
      const points = pointsText
        ? parseInt(pointsText.match(/(\d+)/)?.[0] || "0")
        : 0;

      // Extract submission time
      const ageElement = subtext.find(".age");
      let submissionDatetime = null;
      if (ageElement.length > 0) {
        const ageText = ageElement.attr("title");
        if (ageText) {
          // The title attribute contains the timestamp in format "2025-03-04T15:00:51 1741100451"
          // The second part is the Unix timestamp in seconds, so we need to convert to milliseconds
          const unixTimestampMatch = ageText.match(/\s(\d+)$/);
          if (unixTimestampMatch && unixTimestampMatch[1]) {
            submissionDatetime = parseInt(unixTimestampMatch[1]) * 1000; // Convert seconds to milliseconds
          } else {
            // Fallback to parsing the ISO date if the Unix timestamp is not available
            submissionDatetime = new Date(ageText).getTime();
          }
        }
      }

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
          submission_datetime: submissionDatetime,
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
        INSERT OR REPLACE INTO stories (id, title, url, points, comments, timestamp, submission_datetime, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stories.forEach((story) => {
        stmt.run(
          story.id,
          story.title,
          story.url,
          story.points,
          story.comments,
          story.timestamp,
          story.submission_datetime,
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    // Get the current date in EST
    const now = new Date();
    const estDate = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" })
    );

    // Calculate the date 4 days ago in EST
    const fourDaysAgo = new Date(estDate);
    fourDaysAgo.setDate(estDate.getDate() - 4);

    // Convert to Unix timestamp (milliseconds)
    const fourDaysAgoTimestamp = fourDaysAgo.getTime();

    // Query to get stories from the last 4 days based on submission_datetime
    // If submission_datetime is not available, fall back to timestamp
    const query = `
      SELECT * FROM stories 
      WHERE (submission_datetime IS NOT NULL AND submission_datetime >= ?) 
         OR (submission_datetime IS NULL AND timestamp >= ?)
      ORDER BY submission_datetime DESC
      LIMIT ? OFFSET ?
    `;

    db.all(
      query,
      [fourDaysAgoTimestamp, fourDaysAgoTimestamp, limit, offset],
      (err, rows) => {
        if (err) {
          console.error("Error fetching stories:", err);
          return res.status(500).json({ error: "Failed to fetch stories" });
        }

        res.json(rows);
      }
    );
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
