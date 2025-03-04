import axios from "axios";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Flag to track if quota has been exhausted
let quotaExhausted = false;

/**
 * Makes a request to the Gemini API
 * @param {string} prompt - The prompt to send to Gemini
 * @param {string} model - The model to use (defaults to gemini-2.0-flash)
 * @returns {Promise<Object>} - The API response
 */
export const callGeminiApi = async (
  prompt,
  model = "gemini-2.0-flash-lite"
) => {
  // If quota is already exhausted, don't make the API call
  if (quotaExhausted) {
    throw new Error("Gemini API quota exhausted. Skipping API call.");
  }

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
    // Check if this is a quota exhaustion error
    if (
      error.response?.data?.error?.code === 429 &&
      error.response?.data?.error?.status === "RESOURCE_EXHAUSTED"
    ) {
      console.error("Gemini API quota exhausted. Will stop making API calls.");
      quotaExhausted = true;
    }

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
  if (!process.env.GEMINI_API_KEY || quotaExhausted) {
    return null;
  }

  try {
    if (!promptText || !topics || topics.length === 0) {
      console.log("No prompt or topics found for categorization");
      return null;
    }

    const topicsList = topics.join(", ");
    const prompt = `${promptText}\n\nCategories: ${topicsList}\n\nTitle: "${storyTitle}"\n\nRespond ONLY with a valid JSON array of categories without any markdown formatting, code blocks, or backticks. For example: ["Technology", "AI"]`;

    const response = await callGeminiApi(prompt);

    // Extract the response text
    const responseText =
      response.candidates[0]?.content?.parts[0]?.text || "[]";

    // Clean the response text to handle potential formatting issues
    let cleanedResponse = responseText.trim();

    // Handle markdown code blocks (```json [...] ```)
    if (cleanedResponse.startsWith("```")) {
      const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/;
      const match = cleanedResponse.match(codeBlockRegex);
      if (match && match[1]) {
        cleanedResponse = match[1].trim();
      }
    }
    // Handle single backtick code blocks (`[...]`)
    else if (cleanedResponse.startsWith("`") && cleanedResponse.endsWith("`")) {
      cleanedResponse = cleanedResponse
        .substring(1, cleanedResponse.length - 1)
        .trim();
    }

    // Try to parse the cleaned response as JSON
    try {
      const categories = JSON.parse(cleanedResponse);
      if (Array.isArray(categories)) {
        return categories.length > 0 ? categories : null;
      } else {
        console.log("Gemini response is not an array:", cleanedResponse);
        return null;
      }
    } catch (parseError) {
      console.error("Error parsing Gemini response as JSON:", parseError);
      console.log("Raw response:", responseText);
      return null;
    }
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

/**
 * Check if the Gemini API quota is exhausted
 * @returns {boolean} - Whether the quota is exhausted
 */
export const isQuotaExhausted = () => {
  return quotaExhausted;
};

/**
 * Reset the quota exhausted flag (for testing purposes)
 */
export const resetQuotaExhausted = () => {
  quotaExhausted = false;
};
