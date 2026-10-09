import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getBooks, getChapter } from "./services/bible";
import type { Book, Chapter, ChapterVerse } from "./domain/types";
import { Verse } from "./components/Verse";
import { BookList } from "./components/BookList";
import { TopBar } from "./components/TopBar";
import { SearchOverlay } from "./components/SearchOverlay";
import { CopyToolbar } from "./components/CopyToolbar";
import { VerseContextMenu } from "./components/VerseContextMenu";
import { MonitorPicker } from "./presentation/MonitorPicker";
import { Toast } from "./components/Toast";
import { DeckStudio } from "./components/DeckStudio";
import { useNavigation } from "./store/navigation";
import { useSearch } from "./store/search";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/navigation.css";
import "./styles/verse.css";
import "./styles/search.css";
import "./styles/copy-toolbar.css";
import "./styles/help.css";
import "./styles/settings.css";
import "./styles/context-menu.css";
import "./styles/sermon-deck.css";
import "./styles/deck-studio.css";
import "./styles/sermon-library.css";
import "./styles/outline.css";
import "./styles/background-picker.css";
import "./styles/monitor-picker.css";

function App() {
  const bookId = useNavigation((s) => s.bookId);
  const chapter = useNavigation((s) => s.chapter);
  const selectChapter = useNavigation((s) => s.selectChapter);
  const sidebarOpen = useNavigation((s) => s.sidebarOpen);
  const activeView = useNavigation((s) => s.activeView);
  const openSearch = useSearch((s) => s.openSearch);
  const [loaded, setLoaded] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[] | null>(null);

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

  // Book catalogue for chapter stepping (chapter counts + neighbours).
  useEffect(() => {
    let cancelled = false;
    getBooks()
      .then((b) => {
        if (!cancelled) setBooks([...b].sort((x, y) => x.id - y.id));
      })
      .catch(() => {
        // Step buttons stay hidden; the chapter itself already reports
        // load errors above.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  interface StepTarget {
    bookId: number;
    bookName: string;
    chapter: number;
  }

  // Previous/next chapter, rolling over book boundaries (Genesis 1 has
  // no previous, Revelation 22 no next). Null while books load.
  const stepTarget = (delta: 1 | -1): StepTarget | null => {
    if (!books) return null;
    const index = books.findIndex((b) => b.id === bookId);
    if (index === -1) return null;
    const current = books[index];
    const safe = Math.min(Math.max(chapter, 1), current.chapterCount);
    if (delta === 1) {
      if (safe < current.chapterCount) {
        return { bookId: current.id, bookName: current.name, chapter: safe + 1 };
      }
      const following = books[index + 1];
      return following
        ? { bookId: following.id, bookName: following.name, chapter: 1 }
        : null;
    }
    if (safe > 1) {
      return { bookId: current.id, bookName: current.name, chapter: safe - 1 };
    }
    const preceding = books[index - 1];
    return preceding
      ? {
          bookId: preceding.id,
          bookName: preceding.name,
          chapter: preceding.chapterCount,
        }
      : null;
  };

  const prev = stepTarget(-1);
  const next = stepTarget(1);

  const step = (delta: 1 | -1) => {
    const target = stepTarget(delta);
    if (target) selectChapter(target.bookId, target.chapter, target.bookName);
  };

  // ←/→ step chapters (same as the buttons below). Skipped inside text
  // fields, in Deck Studio (where arrows drive the filmstrip), and with
  // Ctrl/Cmd/Alt held, so typing and OS shortcuts win.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useNavigation.getState().activeView === "deck") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `step` is rebuilt from these every render, so listing them keeps
    // the handler current.
  }, [books, bookId, chapter, selectChapter]);

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

  // F11 toggles fullscreen; Esc exits fullscreen (the app no longer
  // launches fullscreen — it launches maximized with normal window
  // decorations, so the taskbar and minimize/maximize/close buttons stay
  // visible. Esc is the escape hatch if the user does enter fullscreen).
  // Failure means we're running outside Tauri (plain browser dev), so a
  // failed toggle is a silent no-op.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        const win = getCurrentWindow();
        win
          .isFullscreen()
          .then((full) => win.setFullscreen(!full))
          .catch(() => {});
        return;
      }
      if (e.key === "Escape") {
        // Don't steal Esc from overlays/menus — they close themselves on
        // the same keypress. Just also leave fullscreen so a fullscreen
        // window can never trap the user without visible controls.
        const win = getCurrentWindow();
        win
          .isFullscreen()
          .then((full) => {
            if (full) return win.setFullscreen(false);
          })
          .catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="app-shell"
      data-sidebar={
        activeView === "read" && sidebarOpen ? "open" : "closed"
      }
    >
      {activeView === "read" && <BookList />}
      <main className="reading-pane">
        <TopBar />
        {activeView === "deck" ? (
          <DeckStudio />
        ) : (
        <div
          className="chapter-scroll"
          id="view-panel-read"
          role="tabpanel"
          aria-labelledby="view-tab-read"
        >
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
                      bookName={loaded.bookName}
                      chapter={loaded.chapter}
                      onContextMenu={openVerseMenu}
                    />
                  ))}
                </div>
                <nav className="chapter-nav" aria-label="Chapter navigation">
                  <button
                    type="button"
                    className="chapter-nav-button"
                    disabled={!prev}
                    aria-label={
                      prev
                        ? `Previous chapter: ${prev.bookName} ${prev.chapter}`
                        : "No previous chapter"
                    }
                    onClick={() => step(-1)}
                  >
                    ← {prev ? `${prev.bookName} ${prev.chapter}` : "Previous"}
                  </button>
                  <button
                    type="button"
                    className="chapter-nav-button"
                    disabled={!next}
                    aria-label={
                      next
                        ? `Next chapter: ${next.bookName} ${next.chapter}`
                        : "No next chapter"
                    }
                    onClick={() => step(1)}
                  >
                    {next ? `${next.bookName} ${next.chapter}` : "Next"} →
                  </button>
                </nav>
              </>
            )}
          </div>
        </div>
        )}
      </main>
      <SearchOverlay />
      <CopyToolbar />
      <VerseContextMenu verse={menuVerse} x={menuPos.x} y={menuPos.y} onClose={closeMenu} />
      <MonitorPicker />
      <Toast />
    </div>
  );
}

export default App;
