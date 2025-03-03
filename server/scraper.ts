import axios from "axios";
import cheerio from "cheerio";
import { setupDatabase } from "./db/database.js";

interface HackerNewsStory {
  id: string;
  title: string;
  url: string | null;
  points: number;
  comments: number;
  timestamp: number;
  position: number;
  submitted_timestamp: number | null;
}

export async function fetchAndStoreHackerNews(): Promise<void> {
  try {
    const response = await axios.get("https://news.ycombinator.com/");
    const html = response.data;
    const $ = cheerio.load(html);
    const stories: HackerNewsStory[] = [];

    // Parse the stories from the HTML
    $(".athing").each((i, element) => {
      const id = $(element).attr("id") || "";
      const titleElement = $(element).find(".titleline > a").first();
      const title = titleElement.text().trim();
      const url = titleElement.attr("href") || null;
      const position = i + 1; // Add position based on order on the homepage

      // Get the subtext row which contains points, comments, and age
      const subtext = $(element).next(".subline");
      const pointsText = subtext.find(".score").text().trim();
      const points = parseInt(pointsText.replace(" points", "")) || 0;

      // Get comments count
      const commentsLink = subtext.find("a").last();
      const commentsText = commentsLink.text().trim();
      const comments = commentsText.includes("comment")
        ? parseInt(commentsText.replace(/\D/g, "")) || 0
        : 0;

      // Extract submission timestamp from the age element
      let submitted_timestamp: number | null = null;
      const ageElement = subtext.find(".age");
      if (ageElement.length > 0) {
        const titleAttr = ageElement.attr("title");
        if (titleAttr) {
          // The title attribute contains the timestamp in format "2025-03-01T12:32:18 1740832338"
          // The second part is the Unix timestamp
          const parts = titleAttr.split(" ");
          if (parts.length === 2) {
            submitted_timestamp = parseInt(parts[1]);
          }
        }
      }

      stories.push({
        id,
        title,
        url,
        points,
        comments,
        timestamp: Date.now(),
        position,
        submitted_timestamp,
      });
    });

    // Store stories in the database
    const db = await setupDatabase();

    // Use a transaction for better performance
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO stories (id, title, url, points, comments, timestamp, position, submitted_timestamp)
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
          story.position,
          story.submitted_timestamp
        );
      });

      stmt.finalize();
      db.run("COMMIT");
    });

    console.log(
      `Fetched and stored ${stories.length} stories from Hacker News`
    );
  } catch (error) {
    console.error("Error fetching Hacker News:", error);
    throw error;
  }
}
