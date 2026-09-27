# DESIGN-SYSTEM.md

Every color, spacing, and font size a component uses should come from here.
If a value isn't listed, add it here first, then use it.

## Layout

Two panes: a collapsible book/chapter list on the left, the reading pane on
the right. The TopBar is a full-width bar fixed at the top of the reading
pane (it does not scroll away); the chapter text scrolls under it in a
centered column (max width ~42rem) for comfortable reading. Search opens as
an overlay (not a separate page): a dimmed scrim over the whole window with
a centered panel — input on top, results in a scrollable list below.
Clicking a result opens that chapter in the reader. Keyboard: Ctrl/Cmd+K
opens search, Escape closes it, ↑/↓ moves the selection, Enter opens the
selected result. A copy toolbar floats above the bottom center of the
window only when one or more verses are selected, and disappears when
nothing is selected.

## Presentation window ("the stage")

The sermon/presentation window is a separate borderless fullscreen window
whose only job is to be read from the back row of a room on a projector.
It deliberately does NOT reuse the app's light/dark theme: the app theme
is tuned for reading at arm's length (warm paper tones, small type),
while a projected slide needs maximum contrast and enormous type. The
stage tokens below are defined once on `:root`, theme-independent, so the
same slide is shown no matter what theme the main window uses.

```css
:root {
  /* Pure black: in a dark room the screen's edges disappear and the
     verse floats; maximum contrast for text on top. */
  --stage-bg: #000000;
  /* Off-white (96%): maximum readable contrast, softer than pure #FFF
     under projector blowout. */
  --stage-text: #F5F2EC;   /* verse text */
  --stage-dim: #9A927F;    /* reference, counter — must stay legible
                              from distance but read as secondary */
  /* Scripture serif for the verse itself; UI sans for the reference,
     matching the reader's split. Sizes are viewport-relative so a slide
     fills any projector resolution the same way. */
  --stage-font-reading: "Source Serif 4", Georgia, serif;
  --stage-font-ui: -apple-system, "Segoe UI", sans-serif;
  --stage-text-size: clamp(2.5rem, 7.5vmin, 9rem);
  --stage-ref-size: clamp(1.125rem, 2.75vmin, 2.5rem);
  /* Slide padding is a scale step (48px) plus a viewport share so very
     large screens keep comfortable margins. */
  --stage-padding: calc(var(--space-12) + 4vmin);
}
```

Layout: one verse per slide — verse text centered both axes, `line-height`
1.35 (tighter than the reader's 1.7 — a slide is scanned, not read),
reference smaller in `--stage-dim`, centered near the bottom. Keyboard:
→/Space = next slide, ← = previous slide, Esc = exit.

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

  --accent-soft: #F3E7D3;       /* 12% accent over surface: icon/active tints */
  --accent-contrast: #FFFFFF;   /* text on --accent fills */
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

  --accent-soft: #3B2E1C;       /* 12% accent over surface: icon/active tints */
  --accent-contrast: #241A0C;   /* text on --accent fills */
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
- Chapter heading size (`--text-heading-size`): 1.5rem, used for the
  "John 3" heading in the reading pane only.
- Small sizes: verse numbers and secondary labels 0.75rem; keyboard
  chips (`Ctrl+K`, `Esc`) 0.6875rem.
- Verse numbers: smaller (0.75rem), `--text-secondary` color
- Section labels (testament headers): 0.75rem, weight 600, uppercase,
  0.05em letter-spacing, `--text-secondary` color

## Spacing scale

`4px, 8px, 12px, 16px, 24px, 32px, 48px` — pick from this list, don't invent
new numbers.

## Radii scale

`4px` (small controls), `8px` (buttons, inputs, cards), `12px` (large
surfaces: search panel, popovers, floating toolbar).

## Shadows

Used for elevation on floating surfaces (search panel, popovers, copy
toolbar, toast). Never used on static, in-flow surfaces.

```css
--shadow-1: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08);
--shadow-2: 0 2px 6px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.14);
--shadow-3: 0 4px 12px rgb(0 0 0 / 0.12), 0 16px 40px rgb(0 0 0 / 0.2);
--shadow-toolbar: 0 4px 16px rgb(0 0 0 / 0.18), 0 12px 32px rgb(0 0 0 / 0.22);
```

- `--shadow-1`: the fixed TopBar hairline shadow.
- `--shadow-2`: popovers, the copy toolbar, the toast.
- `--shadow-3`: the search overlay panel (highest layer).

## Motion

```
--motion-fast: 120ms;
--motion-base: 180ms;
--ease-out: cubic-bezier(0.2, 0.7, 0.3, 1);
```

Hover/focus/color transitions use `--motion-fast`; entrances (overlay
panel, toolbar, toast) use `--motion-base` with `--ease-out`. Honor
`prefers-reduced-motion` (animations degrade to instant).

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
- Hover states: interactive rows and buttons get the `--hover` tint or an
  `--accent` border/text shift, transitioning on `--motion-fast`.

## Core componentsAppShell, TopBar (search + settings), BookList, ChapterGrid, Verse,
CopyToolbar, SearchOverlay, SearchResults, SettingsPanel, Toast (for
"Copied 3 verses" feedback).
