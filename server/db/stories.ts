import { getDb } from "./schema.js";
import { getActivePrompt, getAllTopics } from "./topics.js";

export interface Story {
  id: string;
  title: string;
  url: string | null;
  points: number;
  comments: number;
  timestamp: number;
  submission_datetime: number | null;
  position: number;
  categories: string | null;
}

// Categorize a story based on its title
export const categorizeStory = async (
  storyTitle: string
): Promise<string[] | null> => {
  // Check if categorization is enabled
  if (!process.env.CATEGORIZE_STORIES || !process.env.GEMINI_API_KEY) {
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

    // Import the geminiApi module dynamically to avoid circular dependencies
    // @ts-ignore
    const geminiApi = await import("../geminiApi.js");

    // Use the geminiApi module to categorize the story
    const categories = await geminiApi.categorizeStory(
      storyTitle,
      prompt.prompt_text,
      topicNames
    );

    // Return categories if available
    return categories;
  } catch (error: any) {
    console.error(
      "Error categorizing story:",
      error.response?.data || error.message
    );
    return null;
  }
};

// Store stories in the database
export const storeStories = async (stories: any[]): Promise<void> => {
  const db = getDb();
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

      const processNextStory = async (index: number) => {
        if (index >= stories.length) {
          finishTransaction();
          return;
        }

        const story = stories[index];

        try {
          // Categorize the story if enabled
          let categories: string | null = null;
          if (process.env.CATEGORIZE_STORIES === "true") {
            // Import the geminiApi module dynamically to avoid circular dependencies
            // @ts-ignore
            const geminiApi = await import("../geminiApi.js");

            // Skip categorization if quota is exhausted
            if (!geminiApi.isQuotaExhausted()) {
              const categoryArray = await categorizeStory(story.title);
              categories = categoryArray ? JSON.stringify(categoryArray) : null;
            }
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
            function (err: any) {
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

// Categorize uncategorized stories
export const categorizeUncategorizedStories = async (
  batchSize = 5
): Promise<void> => {
  if (process.env.CATEGORIZE_STORIES !== "true") {
    return;
  }

  try {
    // Import the geminiApi module dynamically to avoid circular dependencies
    // @ts-ignore
    const geminiApi = await import("../geminiApi.js");

    // Check if quota is already exhausted
    if (geminiApi.isQuotaExhausted()) {
      console.log("Gemini API quota is exhausted. Skipping categorization.");
      return;
    }

    console.log(
      `Looking for uncategorized stories to process (batch size: ${batchSize})...`
    );

    const db = getDb();

    // Get uncategorized stories
    const stories = await new Promise<any[]>((resolve, reject) => {
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
        // Check if quota has been exhausted during processing
        if (geminiApi.isQuotaExhausted()) {
          console.log(
            "Gemini API quota exhausted during processing. Stopping categorization."
          );
          break;
        }

        console.log(`Categorizing story: ${story.id} - ${story.title}`);
        const categories = await categorizeStory(story.title);

        if (categories) {
          // Update the story with categories
          await new Promise<void>((resolve, reject) => {
            db.run(
              `UPDATE stories SET categories = ? WHERE id = ?`,
              [JSON.stringify(categories), story.id],
              function (err) {
                if (err) {
                  console.error(
                    `Error updating story ${story.id} with categories:`,
                    err
                  );
                } else {
                  console.log(
                    `Updated story ${
                      story.id
                    } with categories: ${JSON.stringify(categories)}`
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
