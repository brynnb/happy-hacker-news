import { getDb } from "./schema.js";

export interface Prompt {
  id: number;
  name: string;
  prompt_text: string;
  created_at: number;
  is_active: number;
}

export interface Topic {
  id: number;
  name: string;
  description: string;
  created_at: number;
}

// Get the active prompt from the database
export const getActivePrompt = (): Promise<Prompt | null> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM prompts WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
      (err, row) => {
        if (err) {
          console.error("Error getting active prompt:", err);
          resolve(null);
          return;
        }
        resolve(row as Prompt | null);
      }
    );
  });
};

// Get all topics from the database
export const getAllTopics = (): Promise<Topic[]> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM topics ORDER BY name", (err, rows) => {
      if (err) {
        console.error("Error getting topics:", err);
        resolve([]);
        return;
      }
      resolve(rows as Topic[]);
    });
  });
};
