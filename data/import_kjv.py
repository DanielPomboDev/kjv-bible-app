#!/usr/bin/env python3
"""Import the KJV source CSVs into data/bible.db.

Source: https://github.com/scrollmapper/bible_databases, branch `2024`
(public domain). Files used (relative to the repo checkout):
  - csv/t_kjv.csv       verses: id, b (book), c (chapter), v (verse), t (text)
  - csv/key_english.csv books:  field, name, testament, field  (columns are
                        unnamed; positionally: number, name, testament, genre)

Output schema: books, verses, verses_fts (FTS5, external-content).

Usage:
  python data/import_kjv.py /path/to/bible_databases
"""

import csv
import sqlite3
import sys
from pathlib import Path

# Per-book canonical KJV verse counts, used only as a sanity check.
EXPECTED_TOTAL = 31102
BOOK_COUNTS = {
    1: 1533, 2: 1213, 3: 859, 4: 1288, 5: 959, 6: 658, 7: 618, 8: 85,
    9: 810, 10: 695, 11: 816, 12: 719, 13: 942, 14: 822, 15: 280, 16: 406,
    17: 167, 18: 1070, 19: 2461, 20: 915, 21: 222, 22: 117, 23: 1292,
    24: 1364, 25: 154, 26: 1273, 27: 357, 28: 197, 29: 73, 30: 146, 31: 21,
    32: 48, 33: 105, 34: 47, 35: 56, 36: 53, 37: 38, 38: 211, 39: 55,
    40: 1071, 41: 678, 42: 1151, 43: 879, 44: 1007, 45: 433, 46: 437,
    47: 257, 48: 149, 49: 155, 50: 104, 51: 95, 52: 89, 53: 47, 54: 113,
    55: 83, 56: 46, 57: 25, 58: 303, 59: 108, 60: 105, 61: 61, 62: 105,
    63: 13, 64: 14, 65: 25, 66: 404,
}
assert sum(BOOK_COUNTS.values()) == EXPECTED_TOTAL

DB_PATH = Path(__file__).resolve().parent / "bible.db"

SCHEMA = """
PRAGMA journal_mode = DELETE;

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  testament TEXT NOT NULL,   -- 'OT' or 'NT'
  book_order INTEGER NOT NULL
);

CREATE TABLE verses (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id),
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE VIRTUAL TABLE verses_fts USING fts5(text, content='verses', content_rowid='id');
"""


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    verses_csv = src / "csv" / "t_kjv.csv"
    books_csv = src / "csv" / "key_english.csv"
    for p in (verses_csv, books_csv):
        if not p.is_file():
            sys.exit(f"Missing input file: {p}")

    # --- Load books -------------------------------------------------------
    with open(books_csv, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    # Header is ["field", "field", ...]; columns are positional.
    book_rows = rows[1:]
    # (number, name, testament, genre)
    books = [
        (int(r[0]), r[1], r[2], int(r[3]))
        for r in book_rows
        if len(r) >= 4 and r[0].strip().isdigit()
    ]

    # --- Load verses ------------------------------------------------------
    with open(verses_csv, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    verse_rows = rows[1:]  # header: id, b, c, v, t

    # The source contains exactly one placeholder row, 3 John 1:15
    # (id 64001015) with text "[]" — 3 John has 14 verses in the KJV, so
    # this row marks a verse that does not exist. It is not scripture and
    # Bible text is never invented or "fixed"; we skip it.
    skipped = []
    verses = []
    for r in verse_rows:
        if len(r) < 5:
            skipped.append(r)
            continue
        book_id, chapter, verse_no, text = int(r[1]), int(r[2]), int(r[3]), r[4]
        if text.strip() in ("", "[]"):
            skipped.append(r)
            continue
        verses.append((book_id, chapter, verse_no, text))

    # --- Sanity checks ----------------------------------------------------
    from collections import Counter

    counts = Counter(v[0] for v in verses)
    bad = {b: (n, BOOK_COUNTS.get(b)) for b, n in counts.items()
           if n != BOOK_COUNTS.get(b)}
    if bad:
        for b, (n, exp) in sorted(bad.items()):
            print(f"  WARNING book {b}: {n} verses (expected {exp})")
    if len(verses) != EXPECTED_TOTAL:
        sys.exit(
            f"Aborting: imported {len(verses)} verses, expected {EXPECTED_TOTAL}. "
            "No database was written."
        )
    unknown_books = {v[0] for v in verses} - {b[0] for b in books}
    if unknown_books:
        sys.exit(f"Aborting: verses reference unknown book ids: {sorted(unknown_books)}")

    # --- Write database ---------------------------------------------------
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        with conn:
            conn.executemany(
                "INSERT INTO books (id, name, testament, book_order) VALUES (?, ?, ?, ?)",
                books,
            )
            # verse ids: 1..N in canonical order, so FTS rowids match verses.id.
            conn.executemany(
                "INSERT INTO verses (id, book_id, chapter, verse, text) VALUES (?, ?, ?, ?, ?)",
                ((i, *v) for i, v in enumerate(verses, start=1)),
            )
            # Populate the external-content FTS5 index.
            conn.execute(
                "INSERT INTO verses_fts(verses_fts) VALUES ('rebuild')"
            )
    finally:
        conn.close()

    # --- Report -----------------------------------------------------------
    n_books = len(books)
    print(f"Wrote {DB_PATH}")
    print(f"  books:   {n_books}")
    print(f"  verses:  {len(verses)}")
    if skipped:
        print(f"  skipped non-verse placeholder rows: {len(skipped)}")
        for r in skipped:
            print(f"    id={r[0]} book={r[1]} chapter={r[2]} verse={r[3]} text={r[4]!r}")
    ok = n_books == 66 and len(verses) == EXPECTED_TOTAL
    print("  counts check:", "OK (66 books, 31102 verses)" if ok else "MISMATCH")


if __name__ == "__main__":
    main()
