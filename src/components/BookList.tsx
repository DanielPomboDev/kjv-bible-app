import { useEffect, useState } from "react";
import { getBooks } from "../services/bible";
import type { Book } from "../domain/types";
import { ChapterGrid } from "./ChapterGrid";
import { useNavigation } from "../store/navigation";

const TESTAMENTS = [
  { id: "OT", label: "Old Testament" },
  { id: "NT", label: "New Testament" },
] as const;

/**
 * Left pane: all 66 books grouped under collapsible Old / New Testament
 * sections. Clicking a book expands its chapter grid beneath it.
 */
export function BookList() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<"OT" | "NT", boolean>>({
    OT: false,
    NT: false,
  });
  const openBookId = useNavigation((s) => s.openBookId);
  const openBook = useNavigation((s) => s.openBook);

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

  if (error) {
    return <aside className="book-list">Failed to load books: {error}</aside>;
  }
  if (!books) {
    return <aside className="book-list">Loading…</aside>;
  }

  return (
    <aside className="book-list" aria-label="Books and chapters">
      {TESTAMENTS.map(({ id, label }) => {
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
                {isCollapsed ? "▸" : "▾"}
              </span>
              {label}
            </button>
            {!isCollapsed && (
              <ul className="book-items">
                {sectionBooks.map((book) => (
                  <li key={book.id}>
                    <button
                      type="button"
                      className="book-name"
                      aria-expanded={openBookId === book.id}
                      onClick={() => openBook(book.id)}
                    >
                      {book.name}
                    </button>
                    {openBookId === book.id && (
                      <div className="chapter-grid-section">
                        <ChapterGrid book={book} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </aside>
  );
}
