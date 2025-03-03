export interface Story {
  id: string;
  title: string;
  url: string | null;
  points: number;
  comments: number;
  timestamp: number;
  position?: number;
  submitted_timestamp?: number;
}
