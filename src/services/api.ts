import axios from "axios";
import { Story } from "../types";

// Ensure we're using the correct API URL
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const fetchStories = async (page = 1, limit = 30): Promise<Story[]> => {
  try {
    console.log(
      `Fetching stories from: ${API_URL}/stories?page=${page}&limit=${limit}`
    );
    const response = await axios.get<Story[]>(`${API_URL}/stories`, {
      params: { page, limit },
    });
    console.log(`Received ${response.data.length} stories for page ${page}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching stories:", error);
    return [];
  }
};

export const refreshStories = async (): Promise<boolean> => {
  try {
    console.log(`Refreshing stories from: ${API_URL}/fetch`);
    await axios.post(`${API_URL}/fetch`);
    return true;
  } catch (error) {
    console.error("Error refreshing stories:", error);
    return false;
  }
};
