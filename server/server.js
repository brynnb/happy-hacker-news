import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { testGeminiApi } from "./geminiApi.js";
import {
  setupDatabase,
  storeStories,
  categorizeUncategorizedStories,
} from "./db/index.js";

// Load environment variables
dotenv.config();

// Feature flags
const AUTO_FETCH_ENABLED =
  process.env.AUTO_FETCH_ENABLED === "true" ? true : false;
const FETCH_MULTIPLE_PAGES =
  process.env.FETCH_MULTIPLE_PAGES === "true" ? true : false;
const CATEGORIZE_STORIES =
  process.env.CATEGORIZE_STORIES === "true" ? true : false;

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

// Initialize database
setupDatabase();

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
    const timestamp = Date.now();

    // Find all story rows
    $("tr.athing").each((index, element) => {
      const id = $(element).attr("id");
      const rank = $(element).find("span.rank").text().replace(".", "").trim();
      const title = $(element).find("span.titleline > a").first().text().trim();
      const url = $(element).find("span.titleline > a").first().attr("href");

      // Get the subtext row that follows this row
      const subtext = $(element).next("tr");
      const points = subtext
        .find("span.score")
        .text()
        .replace(" points", "")
        .trim();
      const commentsText = subtext.find("a:contains('comment')").text().trim();
      const comments = commentsText ? parseInt(commentsText.split(" ")[0]) : 0;

      // Extract submission time
      const ageText = subtext.find("span.age").text().trim();
      const ageMatch = ageText.match(/(\d+)\s+(\w+)\s+ago/);
      let submissionTimestamp = null;

      if (ageMatch) {
        const value = parseInt(ageMatch[1]);
        const unit = ageMatch[2];
        const now = new Date();

        if (unit.includes("minute")) {
          submissionTimestamp = now.getTime() - value * 60 * 1000;
        } else if (unit.includes("hour")) {
          submissionTimestamp = now.getTime() - value * 60 * 60 * 1000;
        } else if (unit.includes("day")) {
          submissionTimestamp = now.getTime() - value * 24 * 60 * 60 * 1000;
        } else if (unit.includes("week")) {
          submissionTimestamp = now.getTime() - value * 7 * 24 * 60 * 60 * 1000;
        } else if (unit.includes("month")) {
          submissionTimestamp =
            now.getTime() - value * 30 * 24 * 60 * 60 * 1000;
        } else if (unit.includes("year")) {
          submissionTimestamp =
            now.getTime() - value * 365 * 24 * 60 * 60 * 1000;
        }
      }

      stories.push({
        id,
        title,
        url,
        points: parseInt(points) || 0,
        comments: comments || 0,
        timestamp,
        submission_datetime: submissionTimestamp,
        position: parseInt(rank) || 0,
      });
    });

    console.log(`Parsed ${stories.length} stories from page ${page}`);

    // Store stories in the database
    await storeStories(stories);

    console.log(
      `Successfully stored ${stories.length} stories from page ${page}`
    );

    return stories;
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error);
    throw error;
  }
};

// Fetch multiple pages of Hacker News
const fetchMultiplePages = async (maxPages = 5) => {
  try {
    // If FETCH_MULTIPLE_PAGES is false, only fetch the first page
    const pagesToFetch = FETCH_MULTIPLE_PAGES ? maxPages : 1;

    console.log(`Fetching up to ${pagesToFetch} pages of Hacker News...`);

    for (let page = 1; page <= pagesToFetch; page++) {
      await fetchAndStoreHackerNews(page);

      // Add a delay between requests to avoid overloading the server
      if (page < pagesToFetch) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(`Completed fetching ${pagesToFetch} pages of Hacker News`);

    // Categorize uncategorized stories if enabled
    if (CATEGORIZE_STORIES) {
      await categorizeUncategorizedStories(10);
    }
  } catch (error) {
    console.error("Error fetching multiple pages:", error);
  }
};

// API routes
app.get("/api/stories", async (req, res) => {
  try {
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

    // Use the getDb function from index.js
    const { getDb } = await import("./db/index.js");
    const dbConnection = getDb();

    dbConnection.all(
      query,
      [fourDaysAgoTimestamp, fourDaysAgoTimestamp, limit, offset],
      (err, rows) => {
        if (err) {
          console.error("Error fetching stories:", err);
          res.status(500).json({ error: "Error fetching stories" });
          return;
        }
        res.json(rows);
      }
    );
  } catch (error) {
    console.error("Error in /api/stories:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/topics", async (req, res) => {
  try {
    // Use the getAllTopics function from index.js
    const { getAllTopics } = await import("./db/index.js");
    const topics = await getAllTopics();
    res.json(topics);
  } catch (error) {
    console.error("Error in /api/topics:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/prompt", async (req, res) => {
  try {
    // Use the getActivePrompt function from index.js
    const { getActivePrompt } = await import("./db/index.js");
    const prompt = await getActivePrompt();
    res.json(prompt);
  } catch (error) {
    console.error("Error in /api/prompt:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Test endpoint for Gemini API
app.get("/api/test-gemini", async (req, res) => {
  try {
    const result = await testGeminiApi();
    res.json({ success: true, result });
  } catch (error) {
    console.error("Error testing Gemini API:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to test Gemini API",
    });
  }
});

// Fetch stories from Hacker News
app.post("/api/fetch", async (req, res) => {
  try {
    // Start fetching in the background
    const maxPages = FETCH_MULTIPLE_PAGES ? 5 : 1;
    fetchMultiplePages(maxPages).catch((error) => {
      console.error("Error in background fetch:", error);
    });

    res.json({
      success: true,
      message: `Started fetching ${
        FETCH_MULTIPLE_PAGES ? "multiple pages" : "the first page"
      } of stories in the background`,
    });
  } catch (error) {
    console.error("Error starting fetch:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to start fetching",
    });
  }
});

// Categorize uncategorized stories
app.post("/api/categorize", async (req, res) => {
  try {
    const batchSize = parseInt(req.query.batchSize) || 5;

    // Start categorizing in the background
    categorizeUncategorizedStories(batchSize).catch((error) => {
      console.error("Error in background categorization:", error);
    });

    res.json({
      success: true,
      message: `Started categorizing uncategorized stories (batch size: ${batchSize}) in the background`,
    });
  } catch (error) {
    console.error("Error starting categorization:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to start categorization",
    });
  }
});

// Check Gemini API quota status
app.get("/api/gemini/status", async (req, res) => {
  try {
    // Import the geminiApi module
    const geminiApi = await import("./geminiApi.js");

    const isExhausted = geminiApi.isQuotaExhausted();

    res.json({
      success: true,
      quotaExhausted: isExhausted,
    });
  } catch (error) {
    console.error("Error checking Gemini API status:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to check Gemini API status",
    });
  }
});

// Reset Gemini API quota status (for admin use)
app.post("/api/gemini/reset", async (req, res) => {
  try {
    // Import the geminiApi module
    const geminiApi = await import("./geminiApi.js");

    geminiApi.resetQuotaExhausted();

    res.json({
      success: true,
      message: "Gemini API quota status has been reset",
    });
  } catch (error) {
    console.error("Error resetting Gemini API status:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to reset Gemini API status",
    });
  }
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === "production") {
  const clientBuildPath = path.join(__dirname, "../client/dist");
  app.use(express.static(clientBuildPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    `Feature flags: AUTO_FETCH_ENABLED=${AUTO_FETCH_ENABLED}, FETCH_MULTIPLE_PAGES=${FETCH_MULTIPLE_PAGES}, CATEGORIZE_STORIES=${CATEGORIZE_STORIES}`
  );

  // Start fetching data if AUTO_FETCH_ENABLED is true
  if (AUTO_FETCH_ENABLED) {
    console.log("Auto-fetch is enabled. Starting initial fetch...");
    fetchMultiplePages().catch((error) => {
      console.error("Error in initial auto-fetch:", error);
    });

    // Set up periodic fetching every 30 minutes
    setInterval(() => {
      console.log("Running scheduled fetch...");
      fetchMultiplePages().catch((error) => {
        console.error("Error in scheduled fetch:", error);
      });
    }, 30 * 60 * 1000); // 30 minutes
  } else {
    console.log(
      "Auto-fetch is disabled. Use the /api/fetch endpoint to fetch data manually."
    );
  }
});
