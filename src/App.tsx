import { useCallback, useEffect, useState } from "react";
import { getChapter } from "./services/bible";
import type { Chapter, ChapterVerse } from "./domain/types";
import { Verse } from "./components/Verse";
import { BookList } from "./components/BookList";
import { TopBar } from "./components/TopBar";
import { SearchOverlay } from "./components/SearchOverlay";
import { CopyToolbar } from "./components/CopyToolbar";
import { VerseContextMenu } from "./components/VerseContextMenu";
import { Toast } from "./components/Toast";
import { useNavigation } from "./store/navigation";
import { useSearch } from "./store/search";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/navigation.css";
import "./styles/verse.css";
import "./styles/search.css";
import "./styles/copy-toolbar.css";
import "./styles/settings.css";
import "./styles/context-menu.css";
import "./styles/sermon-deck.css";
import "./styles/background-picker.css";

function App() {
  const bookId = useNavigation((s) => s.bookId);
  const chapter = useNavigation((s) => s.chapter);
  const sidebarOpen = useNavigation((s) => s.sidebarOpen);
  const openSearch = useSearch((s) => s.openSearch);
  const [loaded, setLoaded] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Right-click menu state: the full ChapterVerse (resolved from the
  // loaded chapter when Verse reports a right-click) + cursor position.
  const [menuVerse, setMenuVerse] = useState<ChapterVerse | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const closeMenu = useCallback(() => setMenuVerse(null), []);

  const openVerseMenu = useCallback(
    (verseId: number, x: number, y: number) => {
      const verse = loaded?.verses.find((v) => v.id === verseId);
      if (!verse) return;
      setMenuPos({ x, y });
      setMenuVerse(verse);
    },
    [loaded],
  );

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
    <div className="app-shell" data-sidebar={sidebarOpen ? "open" : "closed"}>
      <BookList />
      <main className="reading-pane">
        <TopBar />
        <div className="chapter-scroll">
          <div className="chapter-body">
            {error ? (
              `Failed to load: ${error}`
            ) : !loaded ? (
              "Loading…"
            ) : (
              <>
                <h1 className="chapter-heading">
                  {loaded.bookName} {loaded.chapter}
                </h1>
                <div>
                  {loaded.verses.map((v) => (
                    <Verse
                      key={v.id}
                      id={v.id}
                      verse={v.verse}
                      text={v.text}
                      onContextMenu={openVerseMenu}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      <SearchOverlay />
      <CopyToolbar />
      <VerseContextMenu verse={menuVerse} x={menuPos.x} y={menuPos.y} onClose={closeMenu} />
      <Toast />
    </div>
  );
}

export default App;
