# Happy Hacker News

A happier way to browse Hacker News. Very much in-progress. End goal is to use LLM to evaluate content to apply filters to remove or reword content that hits certain keywords or topics. My motivation for this is being very tired of certain topics and people getting mentioned in nearly every submission regardless of how relevant it is. I realize the echo-chamber ramifications of this approach, but at the same time, no value is brought to my life by re-reading the same misinformation for the hundredth time. 

Soon to be deployed on an actual TLD.

## Features

- Fetches latest stories from Hacker News
- Stores story data in a SQLite database
- Displays stories in a clean, modern interface
- Shows title, source domain, points, and comment count
- Allows refreshing stories with a single click

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Node.js, Express
- **Database**: SQLite
- **Data Fetching**: Axios, Cheerio for HTML parsing

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/happy-hacker-news.git
   cd happy-hacker-news
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Start the development server:

   ```
   npm start
   ```

   This will start both the backend server and the frontend development server concurrently.

4. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```
## License

MIT
