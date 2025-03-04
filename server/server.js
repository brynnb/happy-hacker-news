import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import dotenv from "dotenv";
import {
  categorizeStory as geminiCategorizeStory,
  testGeminiApi,
} from "./geminiApi.js";

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

// Database setup
let db;

const setupDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const dbPath = path.join(__dirname, "hn.db");
    const isNewDatabase = !fs.existsSync(dbPath);

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
          position INTEGER,
          categories TEXT
        )
      `,
        (err) => {
          if (err) {
            console.error("Error creating stories table:", err);
            reject(err);
            return;
          }

          // Check if categories column exists in stories table
          db.all("PRAGMA table_info(stories)", (err, rows) => {
            if (err) {
              console.error("Error checking stories table schema:", err);
            } else {
              // Check if categories column exists
              const hasCategories =
                rows && rows.some((row) => row.name === "categories");

              if (!hasCategories) {
                console.log("Adding categories column to stories table");
                db.run(
                  "ALTER TABLE stories ADD COLUMN categories TEXT",
                  (err) => {
                    if (err) {
                      console.error("Error adding categories column:", err);
                    } else {
                      console.log("Added categories column to stories table");
                    }
                  }
                );
              }
            }
          });

          // Create prompts table
          db.run(
            `
            CREATE TABLE IF NOT EXISTS prompts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              prompt_text TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              is_active INTEGER DEFAULT 1
            )
          `,
            (err) => {
              if (err) {
                console.error("Error creating prompts table:", err);
                reject(err);
                return;
              }

              // Create topics table
              db.run(
                `
                CREATE TABLE IF NOT EXISTS topics (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL UNIQUE,
                  description TEXT,
                  created_at INTEGER NOT NULL
                )
              `,
                (err) => {
                  if (err) {
                    console.error("Error creating topics table:", err);
                    reject(err);
                    return;
                  }

                  // Create keywords table
                  db.run(
                    `
                    CREATE TABLE IF NOT EXISTS keywords (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      topic_id INTEGER NOT NULL,
                      keyword TEXT NOT NULL,
                      created_at INTEGER NOT NULL,
                      FOREIGN KEY (topic_id) REFERENCES topics (id),
                      UNIQUE (topic_id, keyword)
                    )
                  `,
                    (err) => {
                      if (err) {
                        console.error("Error creating keywords table:", err);
                        reject(err);
                        return;
                      }

                      // Check if we need to insert default data
                      checkAndInsertDefaultData(isNewDatabase)
                        .then(() => {
                          resolve(db);
                        })
                        .catch((err) => {
                          console.error("Error inserting default data:", err);
                          resolve(db);
                        });
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
};

const checkAndInsertDefaultData = async (isNewDatabase) => {
  // Only check if tables are empty if it's not a new database
  if (!isNewDatabase) {
    const [promptCount, topicCount] = await Promise.all([
      getTableCount("prompts"),
      getTableCount("topics"),
    ]);

    // If both tables have data, no need to insert defaults
    if (promptCount > 0 && topicCount > 0) {
      return;
    }
  }

  // Insert default data
  return insertDefaultPromptAndTopics();
};

const getTableCount = (tableName) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
      if (err) {
        console.error(`Error counting rows in ${tableName}:`, err);
        resolve(0);
        return;
      }
      resolve(row.count);
    });
  });
};

const insertDefaultPromptAndTopics = () => {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();

    // Insert default prompt
    db.run(
      `INSERT INTO prompts (name, prompt_text, created_at) VALUES (?, ?, ?)`,
      [
        "Default Categorization Prompt",
        `Analyze the following Hacker News post title and determine which categories it belongs to from the provided list. 
Return ONLY a JSON array of category names, with no additional text or explanation.
Example response: ["technology", "ai"]
If no categories apply, return an empty array: []`,
        timestamp,
      ],
      function (err) {
        if (err) {
          console.error("Error inserting default prompt:", err);
          reject(err);
          return;
        }

        console.log("Inserted default prompt");

        // Insert default topics
        const defaultTopics = [
          {
            name: "technology",
            description: "General technology news and updates",
          },
          {
            name: "ai",
            description: "Artificial intelligence and machine learning",
          },
          {
            name: "programming",
            description: "Software development and programming",
          },
          {
            name: "business",
            description: "Business, startups, and entrepreneurship",
          },
          { name: "politics", description: "Political news and discussions" },
          {
            name: "science",
            description: "Scientific discoveries and research",
          },
        ];

        let topicsInserted = 0;

        defaultTopics.forEach((topic) => {
          db.run(
            `INSERT INTO topics (name, description, created_at) VALUES (?, ?, ?)`,
            [topic.name, topic.description, timestamp],
            function (err) {
              if (err) {
                console.error(`Error inserting topic ${topic.name}:`, err);
                // Continue with other topics
              } else {
                console.log(`Inserted topic: ${topic.name}`);

                const topicId = this.lastID;

                // Insert default keywords for each topic
                const keywordsMap = {
                  technology: [
                    "tech",
                    "software",
                    "hardware",
                    "gadget",
                    "device",
                    "innovation",
                  ],
                  ai: [
                    "artificial intelligence",
                    "machine learning",
                    "neural network",
                    "deep learning",
                    "gpt",
                    "llm",
                    "chatgpt",
                    "gemini",
                    "claude",
                  ],
                  programming: [
                    "code",
                    "developer",
                    "javascript",
                    "python",
                    "rust",
                    "golang",
                    "typescript",
                    "framework",
                    "library",
                    "api",
                  ],
                  business: [
                    "startup",
                    "funding",
                    "venture capital",
                    "vc",
                    "acquisition",
                    "ipo",
                    "entrepreneur",
                    "ceo",
                    "revenue",
                    "profit",
                  ],
                  politics: [
                    "government",
                    "election",
                    "policy",
                    "biden",
                    "trump",
                    "congress",
                    "senate",
                    "democrat",
                    "republican",
                    "legislation",
                  ],
                  science: [
                    "research",
                    "study",
                    "discovery",
                    "physics",
                    "biology",
                    "chemistry",
                    "astronomy",
                    "experiment",
                    "scientist",
                    "journal",
                  ],
                };

                const keywords = keywordsMap[topic.name] || [];
                keywords.forEach((keyword) => {
                  db.run(
                    `INSERT INTO keywords (topic_id, keyword, created_at) VALUES (?, ?, ?)`,
                    [topicId, keyword, timestamp],
                    function (err) {
                      if (err) {
                        console.error(
                          `Error inserting keyword ${keyword}:`,
                          err
                        );
                      } else {
                        console.log(
                          `Inserted keyword: ${keyword} for topic: ${topic.name}`
                        );
                      }
                    }
                  );
                });
              }

              topicsInserted++;
              if (topicsInserted === defaultTopics.length) {
                resolve();
              }
            }
          );
        });
      }
    );
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

    // If FETCH_MULTIPLE_PAGES is false, only fetch the first page
    if (!FETCH_MULTIPLE_PAGES) {
      console.log("FETCH_MULTIPLE_PAGES is disabled. Only fetched page 1.");
      return;
    }

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

// Function to categorize a story using Gemini LLM
const categorizeStory = async (storyTitle) => {
  if (!CATEGORIZE_STORIES || !process.env.GEMINI_API_KEY) {
    return null;
  }

  try {
    // Get active prompt and all topics
    const prompt = await getActivePrompt();
    const topics = await getAllTopics();

    if (!prompt || !topics || topics.length === 0) {
      console.log("No prompt or topics found for categorization");
      return null;
    }

    const topicNames = topics.map((t) => t.name);

    // Use the geminiApi module to categorize the story
    const categories = await geminiCategorizeStory(
      storyTitle,
      prompt.prompt_text,
      topicNames
    );

    // Return stringified categories if available
    return categories ? JSON.stringify(categories) : null;
  } catch (error) {
    console.error(
      "Error categorizing story:",
      error.response?.data || error.message
    );
    return null;
  }
};

// Get the active prompt from the database
const getActivePrompt = () => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM prompts WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
      (err, row) => {
        if (err) {
          console.error("Error getting active prompt:", err);
          resolve(null);
          return;
        }
        resolve(row);
      }
    );
  });
};

// Get all topics from the database
const getAllTopics = () => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM topics ORDER BY name", (err, rows) => {
      if (err) {
        console.error("Error getting topics:", err);
        resolve([]);
        return;
      }
      resolve(rows);
    });
  });
};

// Update the storeStories function to include categorization
const storeStories = async (stories) => {
  return new Promise(async (resolve, reject) => {
    if (!stories || stories.length === 0) {
      resolve();
      return;
    }

    // Begin a transaction
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      const stmt = db.prepare(
        `
        INSERT OR REPLACE INTO stories (id, title, url, points, comments, timestamp, submission_datetime, position, categories)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      );

      let completed = 0;
      let errors = 0;

      const processNextStory = async (index) => {
        if (index >= stories.length) {
          finishTransaction();
          return;
        }

        const story = stories[index];

        try {
          // Categorize the story if enabled
          let categories = null;
          if (CATEGORIZE_STORIES) {
            categories = await categorizeStory(story.title);
          }

          stmt.run(
            story.id,
            story.title,
            story.url,
            story.points,
            story.comments,
            story.timestamp,
            story.submission_datetime,
            story.position,
            categories,
            function (err) {
              if (err) {
                console.error(`Error storing story ${story.id}:`, err);
                errors++;
              } else {
                completed++;
              }

              // Process the next story
              processNextStory(index + 1);
            }
          );
        } catch (error) {
          console.error(`Error processing story ${story.id}:`, error);
          errors++;
          processNextStory(index + 1);
        }
      };

      const finishTransaction = () => {
        stmt.finalize();

        db.run("COMMIT", (err) => {
          if (err) {
            console.error("Error committing transaction:", err);
            reject(err);
            return;
          }

          console.log(`Stored ${completed} stories (${errors} errors)`);
          resolve();
        });
      };

      // Start processing stories
      processNextStory(0);
    });
  });
};

// Function to categorize uncategorized stories
const categorizeUncategorizedStories = async (batchSize = 5) => {
  if (!CATEGORIZE_STORIES) {
    return;
  }

  try {
    console.log(
      `Looking for uncategorized stories to process (batch size: ${batchSize})...`
    );

    // Get uncategorized stories
    const stories = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, title FROM stories WHERE categories IS NULL ORDER BY timestamp DESC LIMIT ?`,
        [batchSize],
        (err, rows) => {
          if (err) {
            console.error("Error fetching uncategorized stories:", err);
            resolve([]);
            return;
          }
          resolve(rows);
        }
      );
    });

    if (stories.length === 0) {
      console.log("No uncategorized stories found.");
      return;
    }

    console.log(`Found ${stories.length} uncategorized stories to process.`);

    // Process each story with a delay to avoid rate limiting
    for (const story of stories) {
      try {
        console.log(`Categorizing story: ${story.id} - ${story.title}`);
        const categories = await categorizeStory(story.title);

        if (categories) {
          // Update the story with categories
          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE stories SET categories = ? WHERE id = ?`,
              [categories, story.id],
              function (err) {
                if (err) {
                  console.error(
                    `Error updating story ${story.id} with categories:`,
                    err
                  );
                } else {
                  console.log(
                    `Updated story ${story.id} with categories: ${categories}`
                  );
                }
                resolve();
              }
            );
          });
        } else {
          console.log(`No categories found for story ${story.id}`);
        }

        // Add a delay between API calls to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error processing story ${story.id}:`, error);
      }
    }

    console.log(`Completed categorizing batch of ${stories.length} stories.`);
  } catch (error) {
    console.error("Error in categorizeUncategorizedStories:", error);
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

// Test Gemini API endpoint
app.get("/api/test-gemini", async (req, res) => {
  try {
    console.log("Testing Gemini API...");

    const response = await testGeminiApi();

    console.log("Gemini API Response:", JSON.stringify(response, null, 2));

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error(
      "Error testing Gemini API:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to test Gemini API",
      details: error.message,
    });
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
  console.log(`Auto-fetch enabled: ${AUTO_FETCH_ENABLED}`);
  console.log(`Fetch multiple pages: ${FETCH_MULTIPLE_PAGES}`);
  console.log(`Categorize stories: ${CATEGORIZE_STORIES}`);

  // Fetch stories on server start
  fetchMultiplePages().catch(console.error);

  // Set up periodic scraping of the front page every minute if enabled
  if (AUTO_FETCH_ENABLED) {
    setInterval(() => {
      console.log("Running scheduled update of Hacker News front page");
      fetchAndStoreHackerNews(1).catch(console.error);
    }, 60000); // 60000 ms = 1 minute

    // Set up periodic full refresh (all pages) every 30 minutes
    setInterval(() => {
      console.log("Running scheduled full refresh of all Hacker News pages");
      fetchMultiplePages().catch(console.error);
    }, 1800000); // 1800000 ms = 30 minutes
  }

  // Set up periodic categorization of uncategorized stories
  if (CATEGORIZE_STORIES) {
    // Start after a short delay to allow the server to initialize
    setTimeout(() => {
      // Run once at startup
      categorizeUncategorizedStories(5).catch(console.error);

      // Then run every 5 minutes
      setInterval(() => {
        console.log(
          "Running scheduled categorization of uncategorized stories"
        );
        categorizeUncategorizedStories(5).catch(console.error);
      }, 300000); // 300000 ms = 5 minutes
    }, 10000); // 10 second initial delay
  }
});
