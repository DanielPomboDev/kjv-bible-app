import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchBible } from "../services/bible";
import type { SearchResult, SearchHit } from "../domain/types";
import { useNavigation } from "../store/navigation";
import { useSearch } from "../store/search";

/** Debounce before hitting the backend while the user types (ms). */
const DEBOUNCE_MS = 150;

type Status = "idle" | "loading" | "error";

const KIND_LABELS = {
  verse: "Verse",
  chapter: "Chapter",
  text: "Text search",
} as const;

/**
 * The search overlay. Backend cases, tried in order:
 * 1. "John 3:16"  → one verse
 * 2. "John 3"     → the whole chapter
 * 3. anything else → FTS5 word/phrase search ("quotes" = exact phrase)
 *
 * Keyboard: Escape closes, ↑/↓ moves, Enter opens. Letters always go to
 * the input (no vim-style j/k shortcuts — they would swallow typing).
 */
export function SearchOverlay() {
  const open = useSearch((s) => s.open);
  const closeSearch = useSearch((s) => s.closeSearch);
  const selectChapter = useNavigation((s) => s.selectChapter);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const requestSeq = useRef(0);

  // Focus the input whenever the overlay opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced backend query. A monotonically increasing sequence number
  // lets an older request finish after a newer one without clobbering it.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      setResults(null);
      setStatus("idle");
      setError(null);
      return;
    }
    const seq = ++requestSeq.current;
    setStatus("loading");
    const timer = window.setTimeout(() => {
      searchBible(trimmed)
        .then((r) => {
          if (requestSeq.current !== seq) return;
          setResults(r);
          setStatus("idle");
          setError(null);
        })
        .catch((e) => {
          if (requestSeq.current !== seq) return;
          setError(String(e));
          setStatus("error");
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Flattened, keyboard-navigable list: the verse hit, every chapter
  // verse, or every text hit.
  const nav = useMemo(() => {
    if (!results) return [];
    if (results.kind === "verse") return [results.hit];
    if (results.kind === "chapter") return results.hits;
    return results.hits;
  }, [results]);

  // Key identifying the current result set — reset the selection to the
  // top whenever a new set arrives.
  const navKey = useMemo(() => {
    if (!results) return "empty";
    switch (results.kind) {
      case "verse":
        return `verse:${results.hit.id}`;
      case "chapter":
        return `chapter:${results.bookId}:${results.chapter}`;
      case "text":
        return `text:${results.query}:${results.hits.length}`;
    }
  }, [results]);

  useEffect(() => {
    setSelected(0);
  }, [navKey]);

  const openChapter = useCallback(
    (bookId: number, chapter: number, bookName: string) => {
      closeSearch();
      selectChapter(bookId, chapter, bookName);
    },
    [closeSearch, selectChapter],
  );

  // Global keys while the overlay is open: Escape closes; ↑/↓ moves the
  // selection; Enter opens the selected result.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : nav.length - 1;
        setSelected((s) => (nav.length === 0 ? 0 : (s + delta) % nav.length));
        return;
      }
      if (e.key === "Enter" && nav[selected]) {
        e.preventDefault();
        const hit = nav[selected];
        openChapter(hit.bookId, hit.chapter, hit.bookName);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, nav, selected, closeSearch, selectChapter, openChapter]);

  // Keep the selected row in view while arrowing through long lists.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, navKey]);
  if (!open) return null;

  const trimmed = query.trim();
  let body: React.ReactNode;
  if (status === "error") {
    body = <p className="search-status">Search failed: {error}</p>;
  } else if (status === "loading" && !results) {
    body = <p className="search-status">Searching…</p>;
  } else if (trimmed === "") {
    body = (
      <p className="search-hints">
        Try <code>John 3:16</code> · <code>John 3</code> ·{" "}
        <code>whosoever</code> · <code>"for god so loved"</code>
      </p>
    );
  } else if (results === null) {
    body = <p className="search-status">Searching…</p>;
  } else {
    switch (results.kind) {
      case "verse": {
        const h = results.hit;
        body = (
          <ul className="search-results" ref={listRef} aria-label="Search results">
            <HitRow
              hit={h}
              label={KIND_LABELS.verse}
              sub={`${h.bookName} ${h.chapter}:${h.verse}`}
              text={h.text}
              selected={selected === 0}
              onSelect={() => setSelected(0)}
              onOpen={() => openChapter(h.bookId, h.chapter, h.bookName)}
            />
          </ul>
        );
        break;
      }
      case "chapter": {
        body = (
          <>
            <p className="search-status">
              {results.bookName} {results.chapter} — {results.hits.length} verses
            </p>
            <ul className="search-results" ref={listRef} aria-label="Search results">
              {results.hits.map((h, i) => (
                <HitRow
                  key={h.id}
                  hit={h}
                  sub={`${h.bookName} ${h.chapter}:${h.verse}`}
                  text={h.text}
                  selected={selected === i}
                  onSelect={() => setSelected(i)}
                  onOpen={() => openChapter(h.bookId, h.chapter, h.bookName)}
                />
              ))}
            </ul>
          </>
        );
        break;
      }
      case "text": {
        body = results.hits.length === 0 ? (
          <p className="search-status">No matches for “{results.query}”</p>
        ) : (
          <>
            <p className="search-status">
              {KIND_LABELS.text} — {results.hits.length} result
              {results.hits.length === 1 ? "" : "s"}
            </p>
            <ul className="search-results" ref={listRef} aria-label="Search results">
              {results.hits.map((h, i) => (
                <HitRow
                  key={h.id}
                  hit={h}
                  sub={`${h.bookName} ${h.chapter}:${h.verse}`}
                  text={h.text}
                  selected={selected === i}
                  onSelect={() => setSelected(i)}
                  onOpen={() => openChapter(h.bookId, h.chapter, h.bookName)}
                />
              ))}
            </ul>
          </>
        );
        break;
      }
    }
  }

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search the Bible"
    >
      <div className="search-scrim" onClick={closeSearch} aria-hidden="true" />
      <div className="search-panel">
        <div className="search-input-row">
          <span className="search-input-icon" aria-hidden="true">
            🔍
          </span>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder='Search — "John 3:16", a word, or "exact phrase"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search query"
            spellCheck={false}
          />
          <kbd className="search-kbd" aria-hidden="true">
            Esc
          </kbd>
        </div>
        {body}
      </div>
    </div>
  );
}

interface HitRowProps {
  hit: SearchHit;
  /** Group label shown on the first row of a result group, if any. */
  label?: string;
  sub: string;
  text: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

function HitRow({ hit, label, sub, text, selected, onSelect, onOpen }: HitRowProps) {
  return (
    <li
      className="search-hit"
      data-selected={selected || undefined}
      data-hit-id={hit.id}
      onMouseMove={onSelect}
      onClick={onOpen}
    >
      <span className="search-hit-ref">{sub}</span>
      {label && <span className="search-hit-kind">{label}</span>}
      <span className="search-hit-text">{text}</span>
    </li>
  );
}
