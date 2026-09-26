# AGENTS.md — Offline KJV Bible App

Read this before touching any code. Keep changes small and scoped to one
feature at a time — never try to build the whole app in one response.

## What this app is

A fully offline desktop Bible app, King James Version only.
Core features: browse books/chapters/verses, search (words, phrases,
references like "John 3:16"), select verses with click, copy verses to
clipboard cleanly formatted. No login, no internet, no cloud.

## Stack

- Tauri 2 (Rust) + React + TypeScript (Vite)
- SQLite with FTS5 for the Bible text + search
- Zustand for state (selection, search, settings)
- Plain CSS with variables (see DESIGN-SYSTEM.md) — no CSS framework needed

## Folder structure

```
src/            React frontend
  domain/       shared types (Book, Verse, etc.)
  services/     functions that call the Rust backend
  store/        Zustand stores
  components/   UI components
  styles/       tokens.css + component styles
src-tauri/      Rust backend
  src/
    db.rs       database access
    search.rs   search logic
    clipboard.rs
data/           Bible source data + the generated database
```

## Rules (the important ones)

1. **Never change or invent Bible text.** If the data looks wrong, ask —
   don't "fix" it.
2. **One feature per task.** Don't touch unrelated files while building a
   feature.
3. **Use the design tokens** in DESIGN-SYSTEM.md — no random colors or
   spacing values in components.
4. **Keyboard must work too**, not just mouse clicks.
5. **Clipboard copy is always plain text**, verses separated by a blank
   line — never one big paragraph.
6. Before writing code, briefly say what you're about to do. After, mention
   how to test it.
7. Don't add a new library unless it's clearly needed for the current
   feature.

## Clipboard format (exact)

One verse:
`16 For God so loved the world...`

Multiple verses: same format, one per line, separated by a blank line,
always in book/chapter/verse order.

## Database shape

```sql
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
```

After importing Bible data, always check: 66 books, 31,102 verses total.
That confirms nothing is missing.
