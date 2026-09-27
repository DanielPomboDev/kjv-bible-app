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
      <div className="top-bar-actions">
        <SermonLibrary />
        <SermonDeckPanel />
        <HelpPanel />
        <SettingsPanel />
      </div>
    </header>
  );
}
