# DESIGN-SYSTEM.md

Every color, spacing, and font size a component uses should come from here.
If a value isn't listed, add it here first, then use it.

## Layout

Two panes: a collapsible book/chapter list on the left, the reading pane on
the right. Search opens as an overlay (not a separate page): a dimmed scrim
over the whole window with a centered panel — input on top, results in a
scrollable list below. Clicking a result opens that chapter in the reader.
Keyboard: Ctrl/Cmd+K opens search, Escape closes it, ↑/↓ moves the
selection, Enter opens the selected result. A copy toolbar
slides up from the bottom only when one or more verses are selected, and
disappears when nothing is selected.

## Colors (CSS variables)

```css
:root[data-theme="light"] {
  --background: #FAF7F1;
  --surface: #FFFFFF;
  --text-primary: #2A2521;
  --text-secondary: #5C5347;
  --border: #E3DDD2;
  --accent: #8A5A2B;
  --selection: #F0E2C8;
  --hover: #F7F0E3;             /* faint hover tint */
  --focus-ring: #4A7FBF;
  --scrim: rgb(0 0 0 / 0.45);   /* overlay backdrop */
}

:root[data-theme="dark"] {
  --background: #1B1815;
  --surface: #242019;
  --text-primary: #EDE7DD;
  --text-secondary: #C2BAAA;
  --border: #3A342B;
  --accent: #D9A25C;
  --selection: #4A3B22;
  --hover: #2F281B;             /* faint hover tint */
  --focus-ring: #6EA0E8;
  --scrim: rgb(0 0 0 / 0.6);    /* overlay backdrop */
}
```

## Typography

- UI text: system font (`-apple-system, "Segoe UI", sans-serif`)
- Bible reading text: serif (`"Source Serif 4", Georgia, serif`), line-height 1.7
- Body text size: 1.0625rem, user-adjustable
- Reading text size (`--text-reading-size`): user-adjustable via the
  Settings panel in four steps — 0.9375rem, 1.0625rem (default), 1.25rem,
  1.5rem — applied as an inline override on `:root`; persists across
  restarts. UI chrome always uses the standard body size.
- Verse numbers: smaller (0.75rem), `--text-secondary` color

## Spacing scale

`4px, 8px, 12px, 16px, 24px, 32px, 48px` — pick from this list, don't invent
new numbers.

## Verse selection states

- Default: no background.
- Hover: faint background tint (`--hover`).
- Selected: `background: var(--selection)`, left border in `--accent`.
- Focused (keyboard): 2px outline in `--focus-ring`.

## Interactions

- Click a verse → select it (toggle).
- Double-click a verse → copy it immediately.
- Ctrl/Cmd+click → add/remove from selection.
- Shift+click → select a range.
- Settings (gear in the TopBar): light/dark theme and reading font size;
  both apply immediately and persist across restarts.
- "Copy Selected" / "Clear Selection" buttons appear in the toolbar when
  selection is non-empty.

## Core componentsAppShell, TopBar (search + settings), BookList, ChapterGrid, Verse,
CopyToolbar, SearchOverlay, SearchResults, SettingsPanel, Toast (for
"Copied 3 verses" feedback).
