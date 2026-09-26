import type { Book } from "../domain/types";
import { useNavigation } from "../store/navigation";

/**
 * Numbered grid of chapters for one book, shown beneath its name in the
 * BookList. The chapter currently open in the reading pane is highlighted.
 */
export function ChapterGrid({ book }: { book: Book }) {
  const bookId = useNavigation((s) => s.bookId);
  const chapter = useNavigation((s) => s.chapter);
  const selectChapter = useNavigation((s) => s.selectChapter);

  return (
    <div className="chapter-grid" role="group" aria-label={`${book.name} chapters`}>
      {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className="chapter-button"
          aria-current={bookId === book.id && chapter === n ? "true" : undefined}
          onClick={() => selectChapter(book.id, n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
