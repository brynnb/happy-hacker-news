export interface Story {
  id: string;
  title: string;
  url?: string;
  points?: number;
  comments?: number;
  timestamp: number;
  submission_datetime?: number;
  position?: number;
  categories?: string;
}

export interface Prompt {
  id?: number;
  name: string;
  prompt_text: string;
  created_at: number;
  is_active?: number;
}

export interface Topic {
  id?: number;
  name: string;
  description: string;
  created_at?: number;
}

export interface Keyword {
  id?: number;
  topic_id: number;
  keyword: string;
  created_at: number;
}
