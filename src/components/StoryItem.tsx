import { forwardRef } from "react";
import { Story } from "../types";

interface StoryItemProps {
  story: Story;
  domain?: string;
}

export const StoryItem = forwardRef<HTMLLIElement, StoryItemProps>(
  ({ story, domain = "" }, ref) => {
    const formatTimestamp = (timestamp: number): string => {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffHours < 1) {
        return "less than an hour ago";
      } else if (diffHours === 1) {
        return "1 hour ago";
      } else if (diffHours < 24) {
        return `${diffHours} hours ago`;
      } else {
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays === 1) {
          return "1 day ago";
        } else {
          return `${diffDays} days ago`;
        }
      }
    };

    const getDomainFromUrl = (url: string | null): string => {
      if (!url) return "";
      try {
        const domain = new URL(url).hostname.replace("www.", "");
        return domain;
      } catch (error) {
        return "";
      }
    };

    // Determine if this is a job posting (no comments, no points)
    const isJob = story.comments === 0 && story.points === 0;

    // Determine if this is a homepage story (more than 5 points)
    const isHomepage = story.points > 5;

    // Determine if this is a dead link (could be based on some criteria)
    const isDead = false; // Example condition

    // Get the domain if it exists and is not news.ycombinator.com
    const storyDomain =
      domain || (story.url ? getDomainFromUrl(story.url) : "");
    const shouldShowDomain =
      storyDomain && storyDomain !== "news.ycombinator.com";

    // Format the submission datetime if available
    const submissionTime = story.submission_datetime
      ? formatTimestamp(story.submission_datetime)
      : "";

    return (
      <li className="entry row" id={`${story.id}`} ref={ref}>
        <a
          href={`https://news.ycombinator.com/item?id=${story.id}`}
          className="comments span2"
        >
          {story.comments}
        </a>
        <span className={`points span1 ${isHomepage ? "homepage" : ""}`}>
          {story.points}
        </span>
        <a
          className={`link span15 story ${isJob ? "job" : ""} ${
            isDead ? "dead" : ""
          }`}
          href={story.url || `https://news.ycombinator.com/item?id=${story.id}`}
        >
          {story.title}
          {shouldShowDomain && <span className="source"> ({storyDomain})</span>}
        </a>
      </li>
    );
  }
);
