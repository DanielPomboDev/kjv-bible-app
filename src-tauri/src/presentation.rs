use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// One queued verse as presented on the stage. Mirrors
/// `SermonDeckEntry` in `src/domain/types.ts` — its `label` is a
/// ready-made slide reference ("John 3:16").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slide {
    pub id: i64,
    pub label: String,
    pub text: String,
}

/// Preset id the stage falls back to when the frontend sends none.
/// Classic Black — mirrors `DEFAULT_BACKGROUND_PRESET_ID` in
/// `src/presentation/backgroundPresets.ts`. The stage frontend also falls
/// back to it for any unknown id, so the two sides can never disagree on
/// what a first-time user sees.
pub const DEFAULT_BACKGROUND: &str = "classic-black";

/// The mutable part of the stage state, guarded by the mutex in
/// [`PresentationState`].
pub struct PresentationInner {
    /// Slides in presentation order. A single "Present Now" verse is a
    /// one-slide deck, so ← is naturally inert by bounds (→ past the
    /// single slide closes the stage — see the frontend key handler); it
    /// deliberately ignores the sermon deck — AGENTS.md rule #2.
    pub deck: Vec<Slide>,
    /// 0-based index into `deck`.
    pub index: usize,
    /// Selected slide background preset id (see
    /// `src/presentation/backgroundPresets.ts`). Travels with the stage
    /// state for the same reason the slides do: the stage must render the
    /// moment it loads without depending on the main window's JavaScript.
    pub background: String,
}

impl Default for PresentationInner {
    fn default() -> Self {
        Self {
            deck: Vec::new(),
            index: 0,
            background: DEFAULT_BACKGROUND.to_string(),
        }
    }
}

/// Rust-side state shared between the two windows: the slides to show
/// and which one is current. Kept here, not in a WebView, because the
/// stage must be able to pull its slide the moment it loads — and re-pull
/// after a reload — without depending on the main window's JavaScript
/// having ever run. Both windows may touch it, hence the mutex.
#[derive(Default)]
pub struct PresentationState(Mutex<PresentationInner>);

fn lock(state: &PresentationState) -> MutexGuard<'_, PresentationInner> {
    state.0.lock().expect("presentation state poisoned")
}

/// `State<T>` derefs to `T`; auto-deref doesn't kick in through a helper
/// argument, so borrow through the deref explicitly.
fn state_lock<'a>(
    state: &'a tauri::State<'_, PresentationState>,
) -> MutexGuard<'a, PresentationInner> {
    lock(state.inner())
}

fn stage_state_of(s: &PresentationInner) -> StageState {
    StageState {
        deck: s.deck.clone(),
        index: s.index,
        background: s.background.clone(),
    }
}

/// What the stage shows: the slides, which one is current, and which
/// background preset to render (resolved to colors by the stage frontend).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageState {
    pub deck: Vec<Slide>,
    pub index: usize,
    pub background: String,
}

/// Open the borderless fullscreen stage window showing `deck` from
/// `index`, rendered with the `background` preset. Presenting again while
/// the stage is already open reuses the window and pushes the new slide —
/// decks get tweaked mid-sermon.
pub fn present_deck(
    app: &tauri::AppHandle,
    deck: Vec<Slide>,
    index: usize,
    background: String,
) -> Result<(), String> {
    if deck.is_empty() {
        return Err("Cannot present an empty sermon deck.".into());
    }
    let clamped = index.min(deck.len() - 1);
    {
        let state = app.state::<PresentationState>();
        let mut s = state_lock(&state);
        s.deck = deck;
        s.index = clamped;
        s.background = background;
    }
    show_stage(app)
}

/// Point the stage at a single one-off verse ("Present Now"): the stage
/// shows exactly that verse and nothing else — the sermon deck is never
/// consulted or modified (AGENTS.md, Sermon rule #2). Modeled as a
/// one-slide deck: ← is inert by bounds, and → past the single slide
/// closes the stage (the frontend exits when showing the last slide).
pub fn present_single(
    app: &tauri::AppHandle,
    slide: Slide,
    background: String,
) -> Result<(), String> {
    {
        let state = app.state::<PresentationState>();
        let mut s = state_lock(&state);
        s.deck = vec![slide];
        s.index = 0;
        s.background = background;
    }
    show_stage(app)
}

/// Pre-create the stage window hidden at startup. Creating it lazily on
/// first Present hangs on some Windows machines (second-WebView creation
/// wedges and never returns), so the click path must never build a
/// window — Present only shows and raises this pre-warmed one, which is
/// also instant. A build failure here is non-fatal: Present falls back
/// to building on demand.
pub fn create_stage_window(app: &tauri::AppHandle) {
    if app.get_webview_window("presentation").is_some() {
        return;
    }
    eprintln!("[presentation] pre-creating hidden stage window...");
    match WebviewWindowBuilder::new(app, "presentation", WebviewUrl::App("index.html".into()))
        .title("KJV Bible — Presentation")
        .decorations(false)
        .shadow(false)
        .visible(false)
        .build()
    {
        Ok(_) => eprintln!("[presentation] hidden stage window ready"),
        Err(e) => eprintln!("[presentation] pre-create failed (will retry on present): {e}"),
    }
}

/// Create (or refocus) the stage window. Borderless and fullscreen with
/// the window shadow off so no hairline leaks around a black slide. The
/// frontend branches on the `presentation` window label and renders the
/// stage UI instead of the app shell.
///
/// The window is normally the pre-created hidden one from
/// [`create_stage_window`]; the `None` branch only rebuilds if that is
/// missing, reusing the same raise sequence afterwards.
///
/// Raising is done at runtime in a fixed order — show, unminimize, focus
/// while still windowed (foreground requests stick better there), then
/// fullscreen last. Builder-time fullscreen leaves the window behind the
/// main window with its title bar visible on Windows, and a bare
/// `set_focus` issued during creation is silently lost.
fn show_stage(app: &tauri::AppHandle) -> Result<(), String> {
    match app.get_webview_window("presentation") {
        Some(window) => {
            // Push first: the hidden stage paints the new slide before it
            // is shown, so raising reveals already-rendered content.
            eprintln!("[presentation] stage already open, re-raising");
            emit_slide(app);
            raise_stage(&window);
            Ok(())
        }
        None => {
            eprintln!("[presentation] creating stage window...");
            let window = WebviewWindowBuilder::new(app, "presentation", WebviewUrl::App("index.html".into()))
                .title("KJV Bible — Presentation")
                .decorations(false)
                .shadow(false)
                .build()
                .map_err(|e| format!("Failed to create presentation window: {e}"))?;
            eprintln!("[presentation] stage window built, raising...");
            raise_stage(&window);
            eprintln!("[presentation] stage raised ok");
            Ok(())
        }
    }
}

/// Bring the stage above everything: shown, restored, focused, kept
/// above the main window and taskbar while presenting (it is a projector
/// stage), and fullscreen. Esc closes the window, so this never traps
/// the user.
fn raise_stage(window: &tauri::WebviewWindow) {
    log_op("show", window.show());
    log_op("unminimize", window.unminimize());
    log_op("set_focus", window.set_focus());
    log_op("set_always_on_top", window.set_always_on_top(true));
    // The fullscreen transition is the slowest part of presenting, and
    // Esc hides without leaving fullscreen — so only pay for it when
    // something actually left fullscreen.
    if !window.is_fullscreen().unwrap_or(false) {
        log_op("set_fullscreen", window.set_fullscreen(true));
    }
}

/// Window ops are best-effort; log failures to the terminal instead of
/// swallowing them so a broken raise is diagnosable.
fn log_op(op: &str, result: Result<(), tauri::Error>) {
    if let Err(e) = result {
        eprintln!("[presentation] {op} failed: {e}");
    }
}

/// Push the current slide to the stage. The stage also pulls once when it
/// loads; this keeps an already-open stage in sync.
fn emit_slide(app: &tauri::AppHandle) {
    let state = app.state::<PresentationState>();
    let payload = {
        let s = lock(&state);
        stage_state_of(&s)
    };
    let _ = app.emit_to("presentation", "presentation://slide", payload);
}

/// The stage's frontend registers its event listener first, then calls
/// this to fetch the current slides directly — a query, not a push, so
/// there is no race where the slide event fires before anything listens.
#[tauri::command]
pub fn presentation_state(app: tauri::AppHandle) -> StageState {
    let state = app.state::<PresentationState>();
    let s = lock(&state);
    stage_state_of(&s)
}

/// Present a queued sermon deck, starting at `index` (0 when omitted),
/// rendered with the `background` preset (Classic Black when omitted).
#[tauri::command]
pub fn present_deck_command(
    app: tauri::AppHandle,
    deck: Vec<Slide>,
    index: Option<usize>,
    background: Option<String>,
) -> Result<(), String> {
    present_deck(
        &app,
        deck,
        index.unwrap_or(0),
        background.unwrap_or_else(|| DEFAULT_BACKGROUND.to_string()),
    )
}

/// Present a single verse right away — the verse context menu's
/// "Present Now" item — rendered with the `background` preset.
#[tauri::command]
pub fn present_now_command(
    app: tauri::AppHandle,
    slide: Slide,
    background: Option<String>,
) -> Result<(), String> {
    eprintln!("[presentation] present_now_command invoked");
    let result = present_single(
        &app,
        slide,
        background.unwrap_or_else(|| DEFAULT_BACKGROUND.to_string()),
    );
    match &result {
        Ok(()) => eprintln!("[presentation] present_now_command ok"),
        Err(e) => eprintln!("[presentation] present_now_command FAILED: {e}"),
    }
    result
}

/// The stage asks to advance (`delta` +1/-1) with →/Space/←. The Rust
/// side owns the index so the count stays authoritative even if the
/// stage's WebView reloaded mid-sermon.
#[tauri::command]
pub fn presentation_move(app: tauri::AppHandle, delta: i32) -> StageState {
    let state = app.state::<PresentationState>();
    {
        let mut s = lock(&state);
        let next = s.index as isize + delta as isize;
        if next >= 0 && (next as usize) < s.deck.len() {
            s.index = next as usize;
        }
    }
    emit_slide(&app);
    let s = lock(&state);
    stage_state_of(&s)
}

/// The stage's Esc: hide the stage and return focus to the main window.
/// Hides instead of closing so the next Present reuses the pre-created
/// window instead of rebuilding one (see [`create_stage_window`]), and
/// stays fullscreen while hidden so re-presenting skips the slow mode
/// transition (see `raise_stage`).
#[tauri::command]
pub fn presentation_exit(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("presentation") {
        log_op("hide", window.hide());
    }
    if let Some(main) = app.get_webview_window("main") {
        log_op("refocus main", main.set_focus());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slide(id: i64, label: &str, text: &str) -> Slide {
        Slide {
            id,
            label: label.into(),
            text: text.into(),
        }
    }

    #[test]
    fn slide_roundtrips_camel_case() {
        let slide = slide(7, "John 3:16", "For God so loved…");
        let json = serde_json::to_string(&slide).expect("serialize");
        assert!(json.contains("\"id\":7"));
        assert!(json.contains("\"label\":\"John 3:16\""));
        let back: Slide = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.id, 7);
        assert_eq!(back.label, "John 3:16");
        assert_eq!(back.text, "For God so loved…");
    }

    #[test]
    fn stage_state_serializes_camel_case() {
        let state = PresentationState::default();
        let payload = {
            let s = lock(&state);
            stage_state_of(&s)
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        assert_eq!(
            json,
            r#"{"deck":[],"index":0,"background":"classic-black"}"#
        );
    }
}
