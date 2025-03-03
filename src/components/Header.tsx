import { Link } from "react-router-dom";

export const Header = () => {
  return (
    <header className="row">
      <div className="logo span5">
        <h1>
          <Link to="/">Happy Hacker News</Link>
        </h1>
        <h3>
          an unofficial alternative interface for a happier{" "}
          <a href="https://news.ycombinator.com">hacker news</a>
        </h3>
      </div>
      <div className="span9 offset1">
        <ul className="mainnav nav nav-pills pull-right">
          <li>
            <Link className="show-settings" to="/settings">
              settings
            </Link>
          </li>
          <li>
            <Link className="about" to="/about">
              about
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
};
