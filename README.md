# KJV Bible App

Offline desktop King James Version Bible app — Tauri 2 (Rust) + React + TypeScript. No login, no internet, no cloud.

## Features (v1.0.0)

- **Reading** — all 66 books / 31,102 verses from a local SQLite database; last-read position is remembered across restarts.
- **Search** — words, phrases (FTS5), and references like `John 3:16`; `Ctrl+K` anywhere.
- **Selection & clipboard** — click, `Ctrl+Click`, `Shift+Click` ranges; copy cleanly formatted plain text.
- **Sermon deck** — queue verses (one at a time or bulk "Add to Deck") plus custom slides; reorder, duplicate, presenter notes.
- **Sermon library** — multiple sermons, each with its own outline, deck, and background; JSON export/import backup per sermon.
- **Presenting** — fullscreen audience window + presenter window with notes, 10 background presets, monitor picker; `→`/`Space` next, `←` previous, `Esc` exit.
- **Polish** — light/dark theme, reading font sizes, chapter prev/next (`←`/`→`), shortcuts help dialog.

## Run it

```sh
npm install
npx tauri dev        # dev window (frontend + Rust backend)
```

## Build the installer

```sh
npx tauri build      # -> src-tauri/target/release/bundle/nsis/KJV Bible_1.0.0_x64-setup.exe
```

The build embeds `data/bible.db` as a resource, so the installed app works fully offline.

## Backup

Sermon Library → **Export** saves a sermon as `.kjv-sermon.json`; **Import…** restores it (a colliding id gets a fresh one, nothing is overwritten).

## Conventions

See `project notes` and `the style guide` before contributing. Highlights:

- Never change or invent Bible text.
- One feature per change; use the design tokens; keyboard must work too.
- Clipboard copy is always plain text, verses separated by a blank line.
