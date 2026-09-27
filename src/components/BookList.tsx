import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { getBooks } from "../services/bible";
import type { Book } from "../domain/types";
import { ChapterGrid } from "./ChapterGrid";
import { ChevronDownIcon, CloseIcon, SearchIcon } from "./icons";
import { useNavigation } from "../store/navigation";

const TESTAMENTS = [
  { id: "OT", label: "Old Testament" },
  { id: "NT", label: "New Testament" },
] as const;

/**
 * Left pane: all 66 books grouped under collapsible Old / New Testament
 * sections, plus a filter box that narrows the list as you type.
 * Clicking a book expands its chapter grid beneath it.
 *
 * Filter behaviour: typing shows a flat list of name matches across both
 * testaments (case-insensitive substring). ↑/↓ moves a highlight,
 * Enter expands the highlighted book's chapters, Escape clears the
 * filter. Every result stays a real button, so Tab works too.
 * Navigating to a chapter anywhere (grid, search, reader) clears the
 * filter so the sidebar returns to the grouped list with the current
 * book expanded.
 */
export function BookList() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<"OT" | "NT", boolean>>({
    OT: true,
    NT: true,
  });
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const openBookId = useNavigation((s) => s.openBookId);
  const openBook = useNavigation((s) => s.openBook);
  const bookId = useNavigation((s) => s.bookId);
  const chapter = useNavigation((s) => s.chapter);
  const restored = useNavigation((s) => s.restored);
  const listRef = useRef<HTMLElement>(null);
  // One-shot: after the book list loads in a restored session, expand
  // the testament section holding the last-read book so its chapter
  // grid is visible. Fresh installs stay fully collapsed.

  useEffect(() => {
    let cancelled = false;
    getBooks()
      .then((b) => {
        if (!cancelled) setBooks(b);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Drop the filter once a chapter is chosen, so the sidebar shows the
  // normal grouped list with the current book expanded and in context.
  useEffect(() => {
    setQuery("");
    setActiveIndex(0);
  }, [bookId, chapter]);

  // Keep the book open in the reading pane visible: after the book or
  // the filter changes, bring its row into view. `nearest` means no
  // jump when it is already on screen (and instant scrolling respects
  // prefers-reduced-motion by default).
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-book-id="${bookId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [bookId, query]);

  const restoreExpanded = useRef(false);
  useEffect(() => {
    if (!books || !restored || restoreExpanded.current) return;
    restoreExpanded.current = true;
    const current = books.find((b) => b.id === bookId);
    if (current) {
      setCollapsed((c) => ({ ...c, [current.testament]: false }));
    }
  }, [books, restored, bookId]);

  if (error) {
    return <aside className="book-list">Failed to load books: {error}</aside>;
  }
  if (!books) {
    return <aside className="book-list">Loading…</aside>;
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? books.filter((b) => b.name.toLowerCase().includes(q))
    : null;

  const onFilterKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    if (!matches || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const match = matches[Math.min(activeIndex, matches.length - 1)];
      if (match) {
        e.preventDefault();
        openBook(match.id);
      }
    }
  };

  return (
    <aside
      id="book-list"
      className="book-list"
      aria-label="Books and chapters"
      ref={listRef}
    >
      <div className="book-filter">
        <span className="book-filter-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          className="book-filter-input"
          type="text"
          placeholder="Filter books…"
          aria-label="Filter books"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onFilterKey}
        />
        {query !== "" && (
          <button
            type="button"
            className="book-filter-clear"
            aria-label="Clear filter"
            onClick={() => setQuery("")}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="book-list-scroll">
        <div className="book-list-content">
        {matches ? (
          matches.length === 0 ? (
            <p className="book-filter-empty">
              No books match “{query.trim()}”.
            </p>
          ) : (
            <ul className="book-items" aria-label="Matching books">
              {matches.map((book, i) => (
                <BookRow
                  key={book.id}
                  book={book}
                  openBookId={openBookId}
                  onOpen={openBook}
                  reading={book.id === bookId}
                  active={i === activeIndex}
                />
              ))}
            </ul>
          )
        ) : (
          TESTAMENTS.map(({ id, label }) => {
            const sectionBooks = books.filter((b) => b.testament === id);
            const isCollapsed = collapsed[id];
            return (
              <section key={id} className="book-section">
                <button
                  type="button"
                  className="testament-header"
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
                >
                  <span className="testament-chevron" aria-hidden="true">
                    <ChevronDownIcon />
                  </span>
                  {label}
                </button>
                {!isCollapsed && (
                  <ul className="book-items">
                    {sectionBooks.map((book) => (
                      <BookRow
                        key={book.id}
                        book={book}
                        openBookId={openBookId}
                        onOpen={openBook}
                        reading={book.id === bookId}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
        </div>
      </div>
    </aside>
  );
}

function BookRow({
  book,
  openBookId,
  onOpen,
  reading,
  active,
}: {
  book: Book;
  openBookId: number | null;
  onOpen: (bookId: number) => void;
  reading: boolean;
  active?: boolean;
}) {
  return (
    <li data-book-id={book.id}>
      <button
        type="button"
        className="book-name"
        aria-expanded={openBookId === book.id}
        data-reading={reading || undefined}
        data-active={active || undefined}
        onClick={() => onOpen(book.id)}
      >
        <span className="book-name-label">{book.name}</span>
        <span className="book-name-count" aria-hidden="true">
          {book.chapterCount}
        </span>
      </button>
      {openBookId === book.id && (
        <div className="chapter-grid-section">
          <ChapterGrid book={book} />
        </div>
      )}
    </li>
  );
}
