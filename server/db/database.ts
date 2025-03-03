import sqlite3 from "sqlite3";
import { Database } from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

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
          timestamp INTEGER NOT NULL,
          position INTEGER,
          submitted_timestamp INTEGER
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
