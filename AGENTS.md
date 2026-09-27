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
  domain/       shared types (Book, Verse, SlideItem, Sermon, Outline, etc.)
  services/     functions that call the Rust backend
  store/        Zustand stores (selection, search, settings, sermonLibrary,
                activeSermon, presentationBackground)
  components/   UI components
  sermon/       SermonLibrary (list/create/open/delete), OutlineEditor
  presentation/ PresentationWindow (audience-facing, existing), PresenterWindow
                (new — presenter-only, notes), SlideView, CustomSlideView,
                BackgroundPicker, CustomSlideEditor, MonitorPicker
  styles/       tokens.css + component styles
src-tauri/      Rust backend
  src/
    db.rs       database access
    search.rs   search logic
    clipboard.rs
data/           Bible source data + the generated database
```

## Sermon / presentation mode rules

1. The sermon deck (queued verses for presenting) is separate from verse
   *selection* (used for clipboard copy) — don't reuse the same store for
   both, they serve different purposes and can hold different verses at
   once.
2. "Present Now" from the right-click menu opens the fullscreen
   presentation window immediately with just that one verse, regardless of
   what's in the sermon deck.
3. The presentation window's background comes from whichever preset is
   currently selected (see "Slide background rules" below) — it does not
   use the app's normal light/dark theme, and it is not a single fixed
   look; the user can change it.
4. Keyboard controls in presentation mode: →/Space = next slide, ← =
   previous slide, Esc = exit back to the normal app window. These must
   work with no mouse involved.
5. The sermon deck should persist across app restarts (so a sermon prepared
   the night before is still there), the same way settings do.

## Slide background rules

1. There are exactly 10 built-in background presets. Default on first run
   is **Classic Black** (solid black, light text) — never default to
   anything else.
2. The other 9 presets should span a few different moods so there's a real
   choice: a couple of plain solid/gradient colors, a couple of "church"-
   feeling looks (e.g. stained glass, wood pulpit), a "scripture"/parchment
   look, and a couple of atmospheric ones (night sky, sunset, nature). Exact
   colors/gradients are up to whoever implements this — no external images
   or downloads, since the app must stay offline; use CSS gradients/patterns
   only.
3. Each preset defines its own background AND matching text/reference
   colors — a light parchment preset needs dark text, not the default light
   text, or it becomes unreadable. Don't apply one fixed text color across
   all presets.
4. The selected preset is a `presentationBackgroundStore`, persisted like
   settings — it should still be selected next time the app opens.
5. Background selection happens through a picker (grid of small preview
   swatches, one per preset) reachable from the sermon deck panel or
   presentation window — not by editing a file or config.

## Custom slide rules

1. The sermon deck holds a single ordered list of **slide items**, where
   each item is either a Bible verse slide (existing) or a custom slide
   (new) — model this as a discriminated union (e.g. `{ type: 'verse', ...
   }` vs `{ type: 'custom', ... }`) so the deck can freely mix both types
   in any order, instead of keeping two separate lists.
2. A custom slide is just a title (optional) and body text (required) —
   no rich text formatting, no images, no slide layouts to choose from in
   v1. Keep it simple: this is for sermon points/headings, not a full
   PowerPoint replacement.
3. Custom slides use the same 10 background presets as verse slides —
   don't build a separate background system for them.
4. Custom slides support the same fullscreen keyboard navigation
   (→/Space/←/Esc) as verse slides — from the presenter's side, both slide
   types behave identically to move through.
5. Editing an existing custom slide updates it in place in the deck; it
   does not create a new entry.

## Sermon library rules

1. Introduce a **Sermon** as the top-level saved unit: a title, a date, its
   outline (see below), its deck (the ordered list of slide items — verses
   and custom slides), and its chosen background preset. Everything that
   used to be one global sermon deck becomes a property of "the currently
   open sermon" instead.
2. Add a Sermon Library screen: list saved sermons (title + date), create a
   new one, open an existing one, rename, delete (with confirmation before
   delete — this is destructive). Persist sermons the same way settings
   already persist, one record per sermon.
3. Only one sermon is "open"/active in the UI at a time. Opening a
   different sermon swaps out the active outline, deck, and background —
   it does not merge them.
4. When this feature is first added, migrate whatever is currently in the
   single global deck/background into one sermon (e.g. titled "Untitled
   Sermon") so existing work isn't lost.

## Outline rules

1. An outline belongs to a sermon and is a simple ordered list of sections
   (e.g. Introduction, Point 1, Point 2, Conclusion), each with a heading
   and plain body text — no rich formatting, no images, same philosophy as
   custom slides.
2. The outline is for planning/reference only — it is not itself presented
   and is separate from the deck of slides. Don't conflate the two.
3. Sections can be added, reordered, removed, and edited like the custom
   slide list already works.

## Presenter notes & dual-window rules

1. Each slide item (verse or custom) gets an optional **notes** field —
   private text for the presenter only, editable from the deck panel.
2. Presenting uses two separate windows, never one:
   - **Presentation window** (existing) — fullscreen, audience-facing,
     shows only the slide's actual content (verse or custom slide + chosen
     background). It must NEVER render notes, under any circumstance.
   - **Presenter window** (new) — stays on the screen the app is already
     running on. Shows the current slide, a preview of the next slide, the
     current slide's notes, and access to the sermon's outline.
3. Before presenting, the user picks which connected monitor the
   Presentation window should open fullscreen on (enumerate available
   monitors via Tauri's monitor APIs). The Presenter window stays on
   whichever screen the picker was opened from.
4. If only one monitor is detected, show a clear warning that notes will be
   visible to the audience since there's no second screen to separate
   them — don't silently proceed as if it's safe.
5. This separation only works if the OS displays are set to **Extend**,
   not **Duplicate/Mirror** — mirrored displays render identical pixels on
   both screens and no application can override that. Show a one-time
   reminder (e.g. the first time presenter view is opened) telling the user
   to set their display mode to Extend before presenting.
6. Keyboard navigation (→/Space/←/Esc) drives both windows in sync —
   advancing in the Presenter window advances the Presentation window too,
   and vice versa.

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
`John 3:16 — For God so loved the world...`

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
