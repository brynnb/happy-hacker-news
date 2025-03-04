import { getDb, getTableCount } from "./schema.js";

export const checkAndInsertDefaultData = async (
  isNewDatabase: boolean
): Promise<void> => {
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

export const insertDefaultPromptAndTopics = (): Promise<void> => {
  const db = getDb();
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

                const keywords =
                  keywordsMap[topic.name as keyof typeof keywordsMap] || [];
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
