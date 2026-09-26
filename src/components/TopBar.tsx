import { useNavigation } from "../store/navigation";
import { useSearch } from "../store/search";

/**
 * Top bar: the current chapter read-out, the search field that opens the
 * overlay (also reachable via Ctrl/Cmd+K), and the light/dark theme toggle.
 * Everything is reachable by keyboard.
 */
export function TopBar() {
  const bookName = useNavigation((s) => s.bookName);
  const chapter = useNavigation((s) => s.chapter);
  const openSearch = useSearch((s) => s.openSearch);

  return (
    <header className="top-bar">
      <button
        type="button"
        className="top-bar-location"
        aria-label={`Currently showing ${bookName} ${chapter}`}
      >
        {bookName} {chapter}
      </button>
      <button
        type="button"
        className="top-bar-search"
        onClick={openSearch}
        aria-haspopup="dialog"
      >
        <span className="top-bar-search-placeholder">Search…</span>
        <kbd className="top-bar-search-kbd">Ctrl+K</kbd>
      </button>
      <button
        type="button"
        className="top-bar-theme"
        aria-label="Toggle dark mode"
        onClick={() => {
          const root = document.documentElement;
          root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
        }}
      >
        ◐
      </button>
    </header>
  );
}
