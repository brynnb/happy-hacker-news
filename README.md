# Happy Hacker News

A better way to browse Hacker News. This application fetches stories from Hacker News, stores them in a local SQLite database, and presents them in a clean, modern interface.

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

## Acknowledgements

- [Hacker News](https://news.ycombinator.com/) for the content
- Inspired by various Hacker News readers and interfaces
