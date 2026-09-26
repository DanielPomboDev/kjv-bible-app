import { useEffect, useState } from "react";
import { getChapter } from "./services/bible";
import type { Chapter } from "./domain/types";
import { Verse } from "./components/Verse";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/verse.css";

// Hardcoded for now — navigation comes later.
const BOOK_ID = 43; // John
const CHAPTER = 3;

function App() {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChapter(BOOK_ID, CHAPTER)
      .then((c) => {
        if (!cancelled) setChapter(c);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <main className="reading-pane">Failed to load: {error}</main>;
  }
  if (!chapter) {
    return <main className="reading-pane">Loading…</main>;
  }

  return (
    <main className="reading-pane">
      <h1 className="chapter-heading">
        {chapter.bookName} {chapter.chapter}
      </h1>
      <p>
        {chapter.verses.map((v) => (
          <Verse key={v.id} verse={v.verse} text={v.text} />
        ))}
      </p>
    </main>
  );
}

export default App;
