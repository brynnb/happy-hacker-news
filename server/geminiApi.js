import axios from "axios";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Makes a request to the Gemini API
 * @param {string} prompt - The prompt to send to Gemini
 * @param {string} model - The model to use (defaults to gemini-2.0-flash)
 * @returns {Promise<Object>} - The API response
 */
export const callGeminiApi = async (prompt, model = "gemini-2.0-flash") => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }

  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Error calling Gemini API:",
      error.response?.data || error.message
    );
    throw error;
  }
};

/**
 * Categorizes a story title using the Gemini API
 * @param {string} storyTitle - The title of the story to categorize
 * @param {string} promptText - The prompt text to use
 * @param {Array<string>} topics - List of available topics
 * @returns {Promise<Array<string>|null>} - Array of categories or null if categorization failed
 */
export const categorizeStory = async (storyTitle, promptText, topics) => {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  try {
    if (!promptText || !topics || topics.length === 0) {
      console.log("No prompt or topics found for categorization");
      return null;
    }

    const topicsList = topics.join(", ");
    const prompt = `${promptText}\n\nCategories: ${topicsList}\n\nTitle: "${storyTitle}"`;

    const response = await callGeminiApi(prompt);

    // Extract the response text
    const responseText =
      response.candidates[0]?.content?.parts[0]?.text || "[]";

    // Try to parse the response as JSON
    try {
      const categories = JSON.parse(responseText);
      if (Array.isArray(categories)) {
        return categories.length > 0 ? categories : null;
      }
    } catch (parseError) {
      console.error("Error parsing Gemini response as JSON:", parseError);
    }

    return null;
  } catch (error) {
    console.error(
      "Error categorizing story:",
      error.response?.data || error.message
    );
    return null;
  }
};

/**
 * Test the Gemini API connection
 * @returns {Promise<Object>} - The API response
 */
export const testGeminiApi = async () => {
  return callGeminiApi("Explain how AI works");
};
