import { useEffect, useState } from "react";
import { getChapter } from "./services/bible";
import type { Chapter } from "./domain/types";
import { Verse } from "./components/Verse";
import { BookList } from "./components/BookList";
import { TopBar } from "./components/TopBar";
import { SearchOverlay } from "./components/SearchOverlay";
import { CopyToolbar } from "./components/CopyToolbar";
import { Toast } from "./components/Toast";
import { useNavigation } from "./store/navigation";
import { useSearch } from "./store/search";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/verse.css";
import "./styles/navigation.css";
import "./styles/search.css";
import "./styles/copy-toolbar.css";
import "./styles/settings.css";

function App() {
  const bookId = useNavigation((s) => s.bookId);
  const chapter = useNavigation((s) => s.chapter);
  const openSearch = useSearch((s) => s.openSearch);
  const [loaded, setLoaded] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChapter(bookId, chapter)
      .then((c) => {
        if (!cancelled) {
          setLoaded(c);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter]);

  // Ctrl/Cmd+K opens the search overlay from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  return (
    <div className="app-shell">
      <BookList />
      <main className="reading-pane">
        <TopBar />
        {error ? (
          `Failed to load: ${error}`
        ) : !loaded ? (
          "Loading…"
        ) : (
          <>
            <h1 className="chapter-heading">
              {loaded.bookName} {loaded.chapter}
            </h1>
            <p>
              {loaded.verses.map((v) => (
                <Verse key={v.id} id={v.id} verse={v.verse} text={v.text} />
              ))}
            </p>
          </>
        )}
      </main>
      <SearchOverlay />
      <CopyToolbar />
      <Toast />
    </div>
  );
}

export default App;
