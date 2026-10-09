import { useNavigation } from "../store/navigation";
import { useSearch } from "../store/search";
import { SermonDeckPanel } from "./SermonDeckPanel";
import { SermonLibrary } from "../sermon/SermonLibrary";
import { SettingsPanel } from "./SettingsPanel";
import { HelpPanel } from "./HelpPanel";
import { PanelLeftIcon, SearchIcon } from "./icons";

/**
 * Top bar: the sidebar toggle, the current chapter read-out, the search
 * field that opens the overlay (also reachable via Ctrl/Cmd+K), and the
 * settings panel — which holds the light/dark theme toggle and reading
 * font size control. Everything is reachable by keyboard.
 */
export function TopBar() {
  const bookName = useNavigation((s) => s.bookName);
  const chapter = useNavigation((s) => s.chapter);
  const sidebarOpen = useNavigation((s) => s.sidebarOpen);
  const toggleSidebar = useNavigation((s) => s.toggleSidebar);
  const activeView = useNavigation((s) => s.activeView);
  const setView = useNavigation((s) => s.setView);
  const openSearch = useSearch((s) => s.openSearch);

  return (
    <header className="top-bar">
      <button
        type="button"
        className="top-bar-sidebar-toggle"
        aria-label={sidebarOpen ? "Hide book list" : "Show book list"}
        aria-expanded={sidebarOpen}
        aria-controls="book-list"
        onClick={toggleSidebar}
      >
        <PanelLeftIcon />
      </button>
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
        <span className="top-bar-search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <span className="top-bar-search-placeholder">Search…</span>
        <kbd className="top-bar-search-kbd">Ctrl+K</kbd>
      </button>
      <div
        className="top-bar-view-tabs"
        role="tablist"
        aria-label="Main views"
      >
        <button
          type="button"
          role="tab"
          id="view-tab-read"
          aria-controls="view-panel-read"
          className="top-bar-view-tab"
          aria-selected={activeView === "read"}
          tabIndex={activeView === "read" ? 0 : -1}
          onClick={() => setView("read")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setView("deck");
              document.getElementById("view-tab-deck")?.focus();
            } else if (e.key === "End") {
              e.preventDefault();
              setView("deck");
              document.getElementById("view-tab-deck")?.focus();
            }
          }}
        >
          Read
        </button>
        <button
          type="button"
          role="tab"
          id="view-tab-deck"
          aria-controls="view-panel-deck"
          className="top-bar-view-tab"
          aria-selected={activeView === "deck"}
          tabIndex={activeView === "deck" ? 0 : -1}
          onClick={() => setView("deck")}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              setView("read");
              document.getElementById("view-tab-read")?.focus();
            } else if (e.key === "Home") {
              e.preventDefault();
              setView("read");
              document.getElementById("view-tab-read")?.focus();
            }
          }}
        >
          Deck
        </button>
      </div>
      <div className="top-bar-actions">
        <SermonLibrary />
        <SermonDeckPanel />
        <HelpPanel />
        <SettingsPanel />
      </div>
    </header>
  );
}
