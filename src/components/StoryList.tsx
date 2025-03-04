import { useEffect, useState, useRef, useCallback } from "react";
import { Story } from "../types";
import { fetchStories, refreshStories } from "../services/api";
import { StoryItem } from "./StoryItem";

interface StoryListProps {
  filter?: string;
}

export const StoryList = ({ filter = "all" }: StoryListProps) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const getDomainFromUrl = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      return hostname !== "news.ycombinator.com"
        ? hostname.replace("www.", "")
        : "";
    } catch {
      return "";
    }
  };

  const lastStoryElementRef = useCallback(
    (node: HTMLLIElement | null) => {
      if (loading || loadingMore) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMoreStories();
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, hasMore, loadingMore]
  );

  const loadStories = async () => {
    setLoading(true);
    setError(null);
    try {
      // Always fetch enough stories to cover 4 days
      const initialLimit = 200;

      const data = await fetchStories(1, initialLimit);
      console.log(`StoryList received ${data.length} stories`);
      setStories(data);
      setPage(1);
      setHasMore(data.length === initialLimit);
    } catch (err) {
      console.error("Error in loadStories:", err);
      setError("Failed to load stories. Please try refreshing.");
    } finally {
      setLoading(false);
    }
  };

  const loadMoreStories = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const moreStories = await fetchStories(nextPage, 50);

      if (moreStories.length > 0) {
        setStories((prevStories) => [...prevStories, ...moreStories]);
        setPage(nextPage);
        setHasMore(moreStories.length === 50);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Error loading more stories:", err);
      setError("Failed to load more stories. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const success = await refreshStories();
      if (success) {
        await loadStories();
      } else {
        setError("Failed to refresh stories. Please try again.");
      }
    } catch (err) {
      console.error("Error in handleRefresh:", err);
      setError("Failed to refresh stories. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStories();
  }, []);

  // Convert a timestamp to Eastern Time date string (YYYY-MM-DD)
  const getEasternTimeDateStr = (timestamp: number): string => {
    // Create date in local time
    const date = new Date(timestamp);

    // Convert to Eastern Time
    const easternTime = new Date(
      date.toLocaleString("en-US", { timeZone: "America/New_York" })
    );

    // Format as YYYY-MM-DD
    return `${easternTime.getFullYear()}-${String(
      easternTime.getMonth() + 1
    ).padStart(2, "0")}-${String(easternTime.getDate()).padStart(2, "0")}`;
  };

  // Format a timestamp to "Mon, Mar 3" format in Eastern Time
  const formatEasternTimeDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    };
    return date.toLocaleDateString("en-US", options);
  };

  // Group stories by day in Eastern Time based on submission_datetime
  const groupStoriesByDay = (storyList: Story[]) => {
    return storyList.reduce<Record<string, Story[]>>((acc, story) => {
      // Use submission_datetime if available
      if (!story.submission_datetime) {
        return acc;
      }

      // Get Eastern Time date string
      const dateStr = getEasternTimeDateStr(story.submission_datetime);

      if (!acc[dateStr]) {
        acc[dateStr] = [];
      }

      acc[dateStr].push(story);
      return acc;
    }, {});
  };

  // For each day, identify the top N stories by points but preserve original order within each day
  const getTopStoriesByDay = (storyList: Story[], limit: number | string) => {
    const storiesByDay = groupStoriesByDay(storyList);
    const result: Story[] = [];

    // Process each day
    Object.keys(storiesByDay)
      .sort()
      .reverse() // Sort days in reverse chronological order
      .forEach((dateStr) => {
        const dayStories = [...storiesByDay[dateStr]];

        // Sort by points to identify top stories
        const sortedByPoints = [...dayStories].sort(
          (a, b) => b.points - a.points
        );

        // Determine how many stories to take
        let numToTake: number;
        if (typeof limit === "number") {
          numToTake = limit;
        } else if (limit === "half") {
          numToTake = Math.ceil(dayStories.length / 2);
        } else {
          numToTake = dayStories.length;
        }

        // Get the top N stories by points
        const topStoryIds = sortedByPoints.slice(0, numToTake).map((s) => s.id);

        // Filter the original day stories to only include top stories, preserving original order
        const topStoriesInOriginalOrder = dayStories.filter((story) =>
          topStoryIds.includes(story.id)
        );

        result.push(...topStoriesInOriginalOrder);
      });

    return result;
  };

  // Format today's date as YYYYMMDD for the ID
  const today = new Date();
  const dateId = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(today.getDate()).padStart(2, "0")}`;

  // Filter stories based on the active filter
  let filteredStories: Story[] = [];

  if (filter === "all") {
    // Sort all stories by submission_datetime (newest first)
    filteredStories = [...stories]
      .filter((story) => story.submission_datetime)
      .sort((a, b) => {
        return (b.submission_datetime || 0) - (a.submission_datetime || 0);
      });
  } else if (filter === "10") {
    filteredStories = getTopStoriesByDay(stories, 10);
  } else if (filter === "20") {
    filteredStories = getTopStoriesByDay(stories, 20);
  } else if (filter === "half") {
    filteredStories = getTopStoriesByDay(stories, "half");
  } else if (filter === "homepage") {
    // For homepage filter, sort by position to match the HN homepage order
    filteredStories = [...stories];
    if (
      filteredStories.length > 0 &&
      filteredStories[0].position !== undefined
    ) {
      filteredStories.sort((a, b) => {
        return (a.position || 0) - (b.position || 0);
      });
    }
  }

  if (loading && stories.length === 0) {
    return <div className="loading">Loading stories...</div>;
  }

  // Group filtered stories by day for rendering with date separators
  const renderStoriesWithDateSeparators = () => {
    if (filteredStories.length === 0) return null;

    let currentDate = "";
    const result = [];

    // Get today's date in Eastern Time
    const today = new Date();
    const todayEastern = new Date(
      today.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    const todayDateStr = `${todayEastern.getFullYear()}-${String(
      todayEastern.getMonth() + 1
    ).padStart(2, "0")}-${String(todayEastern.getDate()).padStart(2, "0")}`;

    for (let i = 0; i < filteredStories.length; i++) {
      const story = filteredStories[i];

      if (!story.submission_datetime) continue;

      const storyDate = getEasternTimeDateStr(story.submission_datetime);

      // Add date separator if this is a new day and not today
      if (storyDate !== currentDate) {
        currentDate = storyDate;

        // Only add the date header if it's not today
        if (storyDate !== todayDateStr) {
          const formattedDate = formatEasternTimeDate(
            story.submission_datetime
          );

          result.push(
            <li key={`date-${storyDate}`} className="date-separator">
              <div className="date-header">{formattedDate}</div>
            </li>
          );
        }
      }

      // Add the story item
      const isLastElement = i === filteredStories.length - 1;
      result.push(
        <StoryItem
          key={story.id}
          story={story}
          domain={story.url ? getDomainFromUrl(story.url) : ""}
          ref={isLastElement ? lastStoryElementRef : null}
        />
      );
    }

    return result;
  };

  return (
    <>
      {stories.length === 0 && (
        <div className="no-stories">
          <p>{error || "No stories found. Please try refreshing."}</p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: "5px 10px",
              backgroundColor: "#ff6600",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh Stories"}
          </button>
        </div>
      )}

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: "5px 10px",
              backgroundColor: "#ff6600",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            {refreshing ? "Refreshing..." : "Try Again"}
          </button>
        </div>
      )}

      <ul className="entries unstyled" id={dateId}>
        {renderStoriesWithDateSeparators()}
        {stories.length > 0 && filteredStories.length === 0 && (
          <li className="entry row">No stories match the current filter</li>
        )}
      </ul>

      {loadingMore && <div className="loading">Loading more stories...</div>}
      {!hasMore && stories.length > 0 && (
        <div className="no-more-stories">No more stories to load</div>
      )}
    </>
  );
};
