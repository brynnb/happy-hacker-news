import { useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { StoryList } from "./components/StoryList";
import { About } from "./components/About";
import { Settings } from "./components/Settings";
import { refreshStories } from "./services/api";
import "./App.css";

function App() {
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const location = useLocation();

  useEffect(() => {
    const baseTitle = "Happy Hacker News";

    switch (location.pathname) {
      case "/about":
        document.title = `${baseTitle} - About`;
        break;
      case "/settings":
        document.title = `${baseTitle} - Settings`;
        break;
      default:
        document.title = baseTitle;
    }
  }, [location.pathname]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshStories();
    setRefreshing(false);
  };

  const handleFilterClick = (filter: string) => {
    setActiveFilter(filter);
    // In a real app, you would filter the stories here
  };

  return (
    <div id="page" className="container">
      <Header />
      <Routes>
        <Route
          path="/"
          element={
            <>
              <div className="entries io row">
                <div className="link span15 offset3">
                  <span>&nbsp;</span>
                </div>
              </div>
              <div className="menu row">
                <div
                  className="row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  <span className="comments span2">comments</span>
                  <span className="points span1">points</span>
                  <div
                    className="span15"
                    style={{ display: "flex", justifyContent: "flex-end" }}
                  >
                    <a
                      href="#"
                      className="filters visible-phone"
                      onClick={(e) => e.preventDefault()}
                    >
                      Filter: <span>{activeFilter}</span>
                    </a>
                    <ul className="filters nav nav-pills hidden-phone">
                      <li className={activeFilter === "10" ? "active" : ""}>
                        <a
                          href="#"
                          className="filtertop by10"
                          data-num="10"
                          onClick={(e) => {
                            e.preventDefault();
                            handleFilterClick("10");
                          }}
                        >
                          top 10
                        </a>
                      </li>
                      <li className={activeFilter === "20" ? "active" : ""}>
                        <a
                          href="#"
                          className="filtertop by20"
                          data-num="20"
                          onClick={(e) => {
                            e.preventDefault();
                            handleFilterClick("20");
                          }}
                        >
                          top 20
                        </a>
                      </li>
                      <li className={activeFilter === "half" ? "active" : ""}>
                        <a
                          href="#"
                          className="filtertop byhalf"
                          data-num="half"
                          onClick={(e) => {
                            e.preventDefault();
                            handleFilterClick("half");
                          }}
                        >
                          top 50%
                        </a>
                      </li>
                      <li
                        className={activeFilter === "homepage" ? "active" : ""}
                      >
                        <a
                          href="#"
                          className="filtertop byhomepage"
                          data-num="homepage"
                          onClick={(e) => {
                            e.preventDefault();
                            handleFilterClick("homepage");
                          }}
                        >
                          homepage
                        </a>
                      </li>
                      <li className={activeFilter === "all" ? "active" : ""}>
                        <a
                          href="#"
                          className="filtertop byall"
                          data-num="all"
                          onClick={(e) => {
                            e.preventDefault();
                            handleFilterClick("all");
                          }}
                        >
                          all
                        </a>
                      </li>
                      <li>
                        <a
                          href="#"
                          className="refresh"
                          onClick={(e) => {
                            e.preventDefault();
                            handleRefresh();
                          }}
                          style={{ color: refreshing ? "#999" : "#0088cc" }}
                        >
                          {refreshing ? "refreshing..." : "refresh"}
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="settings" style={{ display: "none" }}></div>
              <div id="entries">
                <StoryList filter={activeFilter} />
              </div>
            </>
          }
        />
        <Route path="/about" element={<About />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}

export default App;
