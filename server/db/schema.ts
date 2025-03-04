import sqlite3 from "sqlite3";
import { Database } from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database;

export const setupDatabase = (): Promise<Database> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const dbPath = path.join(__dirname, "../../hn.db");
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
          db.all(
            "PRAGMA table_info(stories)",
            (err, rows: { name: string }[]) => {
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
            }
          );

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
                      import("./seeder.js")
                        .then(({ checkAndInsertDefaultData }) => {
                          checkAndInsertDefaultData(isNewDatabase)
                            .then(() => {
                              resolve(db);
                            })
                            .catch((err) => {
                              console.error(
                                "Error inserting default data:",
                                err
                              );
                              resolve(db);
                            });
                        })
                        .catch((err) => {
                          console.error("Error importing seeder module:", err);
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

export const getDb = (): Database => {
  if (!db) {
    throw new Error("Database not initialized. Call setupDatabase first.");
  }
  return db;
};

export const closeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error("Error closing database:", err);
          reject(err);
          return;
        }
        console.log("Database connection closed");
        resolve();
      });
    } else {
      resolve();
    }
  });
};

export const getTableCount = (tableName: string): Promise<number> => {
  return new Promise((resolve) => {
    db.get(
      `SELECT COUNT(*) as count FROM ${tableName}`,
      (err, row: { count: number }) => {
        if (err) {
          console.error(`Error counting rows in ${tableName}:`, err);
          resolve(0);
          return;
        }
        resolve(row.count);
      }
    );
  });
};
