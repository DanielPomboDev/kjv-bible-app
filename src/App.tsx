import { useEffect, useState } from "react";
import { getChapter } from "./services/bible";
import type { Chapter } from "./domain/types";
import { Verse } from "./components/Verse";
import { BookList } from "./components/BookList";
import { useNavigation } from "./store/navigation";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/verse.css";
import "./styles/navigation.css";

function App() {
  const bookId = useNavigation((s) => s.bookId);
  const chapter = useNavigation((s) => s.chapter);
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

  return (
    <div className="app-shell">
      <BookList />
      <main className="reading-pane">
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
                <Verse key={v.id} verse={v.verse} text={v.text} />
              ))}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
