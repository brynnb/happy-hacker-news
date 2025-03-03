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
    } catch (error) {
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
      // For top filters, we need to fetch more stories to ensure we have enough from each day
      const initialLimit = ["10", "20", "half"].includes(filter) ? 100 : 30;

      const data = await fetchStories(1, initialLimit, filter);
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
      const moreStories = await fetchStories(nextPage, 30, filter);

      if (moreStories.length > 0) {
        setStories((prevStories) => [...prevStories, ...moreStories]);
        setPage(nextPage);
        setHasMore(moreStories.length === 30);
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

  useEffect(() => {
    // Reset when filter changes
    loadStories();
  }, [filter]);

  if (loading && stories.length === 0) {
    return <div className="loading">Loading stories...</div>;
  }

  // Format today's date as YYYYMMDD for the ID
  const today = new Date();
  const dateId = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(today.getDate()).padStart(2, "0")}`;

  // Convert a timestamp to Eastern Time date string (YYYY-MM-DD)
  const getEasternTimeDateStr = (timestamp: number): string => {
    // Create date in local time
    const date = new Date(timestamp * 1000); // Convert from Unix timestamp (seconds) to JS timestamp (milliseconds)

    // Convert to Eastern Time
    const easternTime = new Date(
      date.toLocaleString("en-US", { timeZone: "America/New_York" })
    );

    // Format as YYYY-MM-DD
    return `${easternTime.getFullYear()}-${String(
      easternTime.getMonth() + 1
    ).padStart(2, "0")}-${String(easternTime.getDate()).padStart(2, "0")}`;
  };

  // Group stories by day in Eastern Time based on submission timestamp
  const storiesByDay = stories.reduce<Record<string, Story[]>>((acc, story) => {
    // Use submitted_timestamp if available, otherwise fall back to timestamp
    const storyTimestamp = story.submitted_timestamp || story.timestamp;

    // Get Eastern Time date string
    const dateStr = getEasternTimeDateStr(
      // If using the regular timestamp (which is in milliseconds), convert to seconds
      story.submitted_timestamp
        ? storyTimestamp
        : Math.floor(storyTimestamp / 1000)
    );

    if (!acc[dateStr]) {
      acc[dateStr] = [];
    }

    acc[dateStr].push(story);
    return acc;
  }, {});

  // For each day, identify the top N stories by points but preserve original order
  const getTopStoriesByDay = (limit: number | string) => {
    const result: Story[] = [];

    // Process each day
    Object.keys(storiesByDay).forEach((dateStr) => {
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

    // Sort all stories by timestamp (newest first)
    return result.sort((a, b) => {
      // Use submitted_timestamp if available, otherwise fall back to timestamp
      const aTimestamp = a.submitted_timestamp || a.timestamp;
      const bTimestamp = b.submitted_timestamp || b.timestamp;
      return bTimestamp - aTimestamp;
    });
  };

  // Filter stories based on the active filter
  let filteredStories: Story[] = [];

  if (filter === "all") {
    // Sort all stories by timestamp (newest first)
    filteredStories = [...stories].sort((a, b) => {
      // Use submitted_timestamp if available, otherwise fall back to timestamp
      const aTimestamp = a.submitted_timestamp || a.timestamp;
      const bTimestamp = b.submitted_timestamp || b.timestamp;
      return bTimestamp - aTimestamp;
    });
  } else if (filter === "10") {
    filteredStories = getTopStoriesByDay(10);
  } else if (filter === "20") {
    filteredStories = getTopStoriesByDay(20);
  } else if (filter === "half") {
    filteredStories = getTopStoriesByDay("half");
  } else if (filter === "homepage") {
    // For homepage filter, the server already filtered the stories
    filteredStories = [...stories];

    // Sort by position to match the HN homepage order
    if (
      filteredStories.length > 0 &&
      filteredStories[0].position !== undefined
    ) {
      filteredStories.sort((a, b) => {
        return (a.position || 0) - (b.position || 0);
      });
    }
  }

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
      <ul className="entries unstyled" id={dateId}>
        {filteredStories.length > 0 &&
          filteredStories.map((story, index) => {
            if (filteredStories.length === index + 1) {
              return (
                <li
                  ref={lastStoryElementRef}
                  className="entry row"
                  id={`${story.id}`}
                  key={story.id}
                >
                  <a
                    href={`https://news.ycombinator.com/item?id=${story.id}`}
                    className="comments span2"
                  >
                    {story.comments}
                  </a>
                  <span
                    className={`points span1 ${
                      story.position ? "homepage" : ""
                    }`}
                  >
                    {story.points}
                  </span>
                  <a
                    className={`link span15 story ${
                      story.comments === 0 && story.points === 0 ? "job" : ""
                    }`}
                    href={
                      story.url ||
                      `https://news.ycombinator.com/item?id=${story.id}`
                    }
                  >
                    {story.title}
                    {story.url && (
                      <span className="source">
                        {" "}
                        ({getDomainFromUrl(story.url)})
                      </span>
                    )}
                  </a>
                </li>
              );
            } else {
              return <StoryItem key={story.id} story={story} />;
            }
          })}
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
