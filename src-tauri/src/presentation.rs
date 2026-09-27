use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// One slide on the stage, verse or custom. Mirrors `SermonDeckItem`
/// in `src/domain/types.ts` — the deck travels to the backend untouched.
/// Externally tagged on `"type"` so the JSON is exactly the frontend
/// shape: `{"type":"verse","id":…,"label":…,"text":…}` or
/// `{"type":"custom","id":…,"title":…,"body":…}`.
///
/// Private presenter `notes` (when present) travel along untouched but
/// are never rendered by the stage — the audience window shows only the
/// slide content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Slide {
    /// A Bible verse slide: `id` is the canonical verse id
    /// (`verses.id`) and `label` the ready-made reference ("John 3:16").
    #[serde(rename = "verse")]
    Verse {
        id: i64,
        label: String,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        notes: Option<String>,
    },
    /// A custom sermon slide (Custom slide rules): string `id`
    /// in its own namespace (never collides with verse ids), optional
    /// `title`, required `body`.
    #[serde(rename = "custom")]
    Custom {
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        body: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        notes: Option<String>,
    },
}

/// One sermon outline section for planning (mirrors `OutlineSection` in
/// `src/domain/types.ts`: `{id, heading, body}`). Snapshotted at present
/// time with the deck so the presenter window can show it without
/// depending on the main window's JavaScript. Never rendered by the
/// audience stage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutlineSection {
    pub id: String,
    pub heading: String,
    pub body: String,
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
    /// deliberately ignores the sermon deck — project notes rule #2. Verse
    /// and custom slides mix freely here; navigation is index-based, so
    /// both step through identically.
    pub deck: Vec<Slide>,
    /// 0-based index into `deck`.
    pub index: usize,
    /// Selected slide background preset id (see
    /// `src/presentation/backgroundPresets.ts`). Travels with the stage
    /// state for the same reason the slides do: the stage must render the
    /// moment it loads without depending on the main window's JavaScript.
    pub background: String,
    /// The app's light/dark theme at present time (`store/settings.ts`).
    /// The presenter window applies it so its chrome matches the main
    /// app; the audience stage ignores it (stage tokens only — project notes,
    /// Sermon rule #3). Normalized to "light"/"dark" on the way in.
    pub theme: String,
    /// The open sermon's outline sections at present time — reference
    /// material for the presenter window only. The audience stage
    /// receives it in the same payload but never renders it.
    pub outline: Vec<OutlineSection>,
    /// True between present and exit: gates `sync_presenting_deck` so
    /// deck edits made while not presenting change nothing.
    pub presenting: bool,
}

impl Default for PresentationInner {
    fn default() -> Self {
        Self {
            deck: Vec::new(),
            index: 0,
            background: DEFAULT_BACKGROUND.to_string(),
            theme: "light".to_string(),
            outline: Vec::new(),
            presenting: false,
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
        theme: s.theme.clone(),
        outline: s.outline.clone(),
    }
}

/// What the stage shows: the slides, which one is current, and which
/// background preset to render (resolved to colors by the stage frontend).
/// The theme and outline ride along for the presenter window; the
/// audience window ignores both (it renders slide content only — never
/// notes or outline — in stage tokens only).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageState {
    pub deck: Vec<Slide>,
    pub index: usize,
    pub background: String,
    pub theme: String,
    pub outline: Vec<OutlineSection>,
}

/// The app theme as the presenter may apply it: anything but "dark" is
/// light, so a corrupt or future value can never break the presenter.
fn normalize_theme(theme: Option<String>) -> String {
    match theme.as_deref() {
        Some("dark") => "dark".to_string(),
        _ => "light".to_string(),
    }
}

/// One connected display, as listed for the monitor picker
/// (Presenter notes rule #3). Positions are physical pixels
/// in the virtual desktop; the frontend persists its choice by name
/// (falling back to position) and sends it back as `MonitorTarget`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// The frontend's chosen display for the stage: matched by `name` first,
/// then by position (names can be absent on some platforms). `None` — or
/// no match — means "wherever the window already is".
#[derive(Debug, Clone, Deserialize)]
pub struct MonitorTarget {
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
}

fn monitor_infos(app: &tauri::AppHandle) -> Vec<MonitorInfo> {
    let monitors = app.available_monitors().unwrap_or_default();
    let primary_pos = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| *m.position());
    monitors
        .iter()
        .map(|m| {
            let pos = *m.position();
            MonitorInfo {
                name: m.name().map(|n| n.to_string()),
                x: pos.x,
                y: pos.y,
                width: m.size().width,
                height: m.size().height,
                is_primary: Some(pos) == primary_pos,
            }
        })
        .collect()
}

/// Pick the listed monitor matching `target`: by name when it names one
/// still connected, otherwise by position. An absent name never matches
/// another absent name — positions are the fallback there too.
fn select_monitor<'a>(
    monitors: &'a [MonitorInfo],
    target: &MonitorTarget,
) -> Option<&'a MonitorInfo> {
    if let Some(name) = target.name.as_deref() {
        if let Some(m) = monitors.iter().find(|m| m.name.as_deref() == Some(name)) {
            return Some(m);
        }
    }
    monitors
        .iter()
        .find(|m| m.x == target.x && m.y == target.y)
}

/// List every connected display for the monitor picker.
#[tauri::command]
pub fn list_monitors(app: tauri::AppHandle) -> Vec<MonitorInfo> {
    monitor_infos(&app)
}

/// Open the borderless fullscreen stage window showing `deck` from
/// `index`, rendered with the `background` preset, plus the presenter
/// window on the app's own screen. Presenting again while the stage is
/// already open reuses the windows and pushes the new slide — decks get
/// tweaked mid-sermon.
pub fn present_deck(
    app: &tauri::AppHandle,
    deck: Vec<Slide>,
    index: usize,
    background: String,
    monitor: Option<MonitorTarget>,
    outline: Vec<OutlineSection>,
    theme: String,
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
        s.outline = outline;
        s.theme = theme;
        s.presenting = true;
    }
    show_stage(app, monitor.as_ref())?;
    show_presenter(app);
    Ok(())
}

/// Point the stage at a single one-off verse ("Present Now"): the stage
/// shows exactly that verse and nothing else — the sermon deck is never
/// consulted or modified (Sermon rule #2). Modeled as a
/// one-slide deck: ← is inert by bounds, and → past the single slide
/// closes the stage (the frontend exits when showing the last slide).
pub fn present_single(
    app: &tauri::AppHandle,
    slide: Slide,
    background: String,
    monitor: Option<MonitorTarget>,
    outline: Vec<OutlineSection>,
    theme: String,
) -> Result<(), String> {
    {
        let state = app.state::<PresentationState>();
        let mut s = state_lock(&state);
        s.deck = vec![slide];
        s.index = 0;
        s.background = background;
        s.outline = outline;
        s.theme = theme;
        s.presenting = true;
    }
    show_stage(app, monitor.as_ref())?;
    show_presenter(app);
    Ok(())
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

/// Size of the presenter window: a normal windowed control panel —
/// never fullscreen, never always-on-top. It lives on the speaker's
/// screen while the stage owns the picked display; on a shared screen
/// all three windows are ordinary windows, so Alt+Tab cycles them
/// PowerPoint-style.
const PRESENTER_W: i32 = 1020;
const PRESENTER_H: i32 = 740;

/// Pre-create the presenter window hidden at startup, for the same
/// reason the stage is pre-warmed (see `create_stage_window`): the
/// click path must never build a window.
pub fn create_presenter_window(app: &tauri::AppHandle) {
    if app.get_webview_window("presenter").is_some() {
        return;
    }
    eprintln!("[presentation] pre-creating hidden presenter window...");
    match build_presenter(app) {
        Ok(_) => eprintln!("[presentation] hidden presenter window ready"),
        Err(e) => eprintln!("[presentation] pre-create failed (will retry on present): {e}"),
    }
}

fn build_presenter(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, tauri::Error> {
    WebviewWindowBuilder::new(app, "presenter", WebviewUrl::App("index.html".into()))
        .title("KJV Bible — Presenter")
        .inner_size(PRESENTER_W as f64, PRESENTER_H as f64)
        .visible(false)
        .build()
}

/// Where the presenter window goes (Presenter notes rule #3):
/// centered on the monitor holding the main window — i.e. the screen the
/// picker was opened from — never the picked presentation display.
fn presenter_placement(app: &tauri::AppHandle) -> tauri::Position {
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(Some(m)) = main.current_monitor() {
            let pos = *m.position();
            let size = m.size();
            let x = pos.x + ((size.width as i32 - PRESENTER_W) / 2).max(0);
            let y = pos.y + ((size.height as i32 - PRESENTER_H) / 2).max(0);
            return tauri::Position::Physical(tauri::PhysicalPosition::new(x, y));
        }
    }
    tauri::Position::Physical(tauri::PhysicalPosition::new(80, 80))
}

/// Open the presenter window on the app's own screen. The pre-warmed
/// window is repositioned every present (the main window may have moved
/// to another screen since); the fallback rebuild only runs if the
/// pre-warm failed. The presenter takes focus — the stage needs none,
/// its keys mirror the presenter's through the backend-owned index.
/// An ordinary window throughout: nothing here is topmost, so Alt+Tab
/// between main, presenter, and stage always works.
pub fn show_presenter(app: &tauri::AppHandle) {
    let position = presenter_placement(app);
    let window = match app.get_webview_window("presenter") {
        Some(window) => window,
        None => {
            eprintln!("[presentation] creating presenter window...");
            match build_presenter(app) {
                Ok(window) => window,
                Err(e) => {
                    eprintln!("[presentation] presenter build failed: {e}");
                    return;
                }
            }
        }
    };
    log_op("presenter set_position", window.set_position(position));
    log_op("presenter show", window.show());
    log_op("presenter unminimize", window.unminimize());
    log_op("presenter set_focus", window.set_focus());
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
fn show_stage(app: &tauri::AppHandle, monitor: Option<&MonitorTarget>) -> Result<(), String> {
    match app.get_webview_window("presentation") {
        Some(window) => {
            if let Some(target) = monitor {
                place_on_monitor(app, &window, target);
            }
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
            if let Some(target) = monitor {
                place_on_monitor(app, &window, target);
            }
            eprintln!("[presentation] stage window built, raising...");
            raise_stage(&window);
            eprintln!("[presentation] stage raised ok");
            Ok(())
        }
    }
}

/// Move the stage window onto the picked monitor (Presenter
/// notes rule #3) before it goes fullscreen — fullscreen lands on
/// whichever monitor holds the window, so positioning first is the whole
/// trick. A no-op when the target isn't connected anymore or the window
/// is already there (avoids a flicker + a needless fullscreen cycle on
/// repeat presents to the same monitor).
fn place_on_monitor(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    target: &MonitorTarget,
) {
    let infos = monitor_infos(app);
    let chosen = match select_monitor(&infos, target) {
        Some(info) => info,
        None => {
            eprintln!("[presentation] picked monitor gone, staying put");
            return;
        }
    };
    if let Ok(Some(current)) = window.current_monitor() {
        let pos = *current.position();
        if pos.x == chosen.x && pos.y == chosen.y {
            return;
        }
    }
    eprintln!(
        "[presentation] moving stage to monitor at {},{}",
        chosen.x, chosen.y
    );
    // A positioned move only takes while windowed — drop out of
    // fullscreen first; raise_stage re-fullscreens afterwards.
    log_op("leave fullscreen for move", window.set_fullscreen(false));
    log_op(
        "set_position",
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            chosen.x, chosen.y,
        ))),
    );
}

/// Bring the stage up: shown, restored, focused, then borderless
/// windowed fullscreen — never exclusive fullscreen (which would
/// minimize itself when focus moves away), and deliberately never
/// always-on-top: Alt+Tab to the main app or the presenter must work
/// PowerPoint-style mid-sermon, which a topmost stage would block on a
/// shared screen. Esc hides the pair, so this never traps the user.
fn raise_stage(window: &tauri::WebviewWindow) {
    log_op("show", window.show());
    log_op("unminimize", window.unminimize());
    log_op("set_focus", window.set_focus());
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

/// Push the current slide to the stage AND the presenter. Both windows
/// register the same listener first, then pull — pushes keep already-open
/// windows in sync either way. The backend owns the index, so →/Space/←
/// in either window drives both (Presenter notes rule #6).
fn emit_slide(app: &tauri::AppHandle) {
    let state = app.state::<PresentationState>();
    let payload = {
        let s = lock(&state);
        stage_state_of(&s)
    };
    let _ = app.emit_to("presentation", "presentation://slide", &payload);
    let _ = app.emit_to("presenter", "presentation://slide", &payload);
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
/// rendered with the `background` preset (Classic Black when omitted),
/// fullscreen on `monitor` (wherever the stage already is when omitted).
/// `theme` ("dark" or anything else = light) styles the presenter
/// window's chrome to match the main app.
#[tauri::command]
pub fn present_deck_command(
    app: tauri::AppHandle,
    deck: Vec<Slide>,
    index: Option<usize>,
    background: Option<String>,
    monitor: Option<MonitorTarget>,
    outline: Option<Vec<OutlineSection>>,
    theme: Option<String>,
) -> Result<(), String> {
    present_deck(
        &app,
        deck,
        index.unwrap_or(0),
        background.unwrap_or_else(|| DEFAULT_BACKGROUND.to_string()),
        monitor,
        outline.unwrap_or_default(),
        normalize_theme(theme),
    )
}

/// Present a single verse right away — the verse context menu's
/// "Present Now" item — rendered with the `background` preset,
/// fullscreen on `monitor` (wherever the stage already is when omitted).
/// `theme` ("dark" or anything else = light) styles the presenter
/// window's chrome to match the main app.
#[tauri::command]
pub fn present_now_command(
    app: tauri::AppHandle,
    slide: Slide,
    background: Option<String>,
    monitor: Option<MonitorTarget>,
    outline: Option<Vec<OutlineSection>>,
    theme: Option<String>,
) -> Result<(), String> {
    eprintln!("[presentation] present_now_command invoked");
    let result = present_single(
        &app,
        slide,
        background.unwrap_or_else(|| DEFAULT_BACKGROUND.to_string()),
        monitor,
        outline.unwrap_or_default(),
        normalize_theme(theme),
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

/// Replace the live deck + outline mid-presentation (see
/// `sync_presenting_deck`): the current index is kept, clamped into the
/// new deck — an emptied deck parks at 0 and both windows show their
/// waiting state until slides come back. Background/theme are
/// present-time snapshots and stay untouched here on purpose.
fn apply_sync(s: &mut PresentationInner, deck: Vec<Slide>, outline: Vec<OutlineSection>) {
    s.deck = deck;
    s.outline = outline;
    s.index = if s.deck.is_empty() {
        0
    } else {
        s.index.min(s.deck.len() - 1)
    };
}

/// Push open-sermon edits to a running presentation without restarting
/// it: the main window calls this after every deck/outline mutation, and
/// it no-ops unless a presentation is active — so edits made while not
/// presenting cost one cheap round-trip and change nothing. Never shows,
/// raises, or focuses any window (mid-sermon edits must not steal
/// focus); it just updates state and pushes to both windows.
#[tauri::command]
pub fn sync_presenting_deck(
    app: tauri::AppHandle,
    deck: Vec<Slide>,
    outline: Vec<OutlineSection>,
) -> Result<(), String> {
    {
        let state = app.state::<PresentationState>();
        let mut s = state_lock(&state);
        if !s.presenting {
            return Ok(());
        }
        apply_sync(&mut s, deck, outline);
    }
    emit_slide(&app);
    Ok(())
}

/// Esc in either window: hide the stage AND the presenter, and return
/// focus to the main window. Both hide instead of closing so the next
/// Present reuses the pre-created windows instead of rebuilding them
/// (see `create_stage_window`), and the stage stays fullscreen while
/// hidden so re-presenting skips the slow mode transition.
#[tauri::command]
pub fn presentation_exit(app: tauri::AppHandle) {
    {
        let state = app.state::<PresentationState>();
        state_lock(&state).presenting = false;
    }
    if let Some(window) = app.get_webview_window("presentation") {
        log_op("hide", window.hide());
    }
    if let Some(presenter) = app.get_webview_window("presenter") {
        log_op("hide presenter", presenter.hide());
    }
    if let Some(main) = app.get_webview_window("main") {
        log_op("refocus main", main.set_focus());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn verse_slide(id: i64, label: &str, text: &str) -> Slide {
        Slide::Verse {
            id,
            label: label.into(),
            text: text.into(),
            notes: None,
        }
    }

    fn custom_slide(id: &str, title: Option<&str>, body: &str) -> Slide {
        Slide::Custom {
            id: id.into(),
            title: title.map(str::to_string),
            body: body.into(),
            notes: None,
        }
    }

    #[test]
    fn verse_slide_roundtrips_with_type_tag() {
        let slide = verse_slide(7, "John 3:16", "For God so loved…");
        let json = serde_json::to_string(&slide).expect("serialize");
        assert_eq!(
            json,
            r#"{"type":"verse","id":7,"label":"John 3:16","text":"For God so loved…"}"#
        );
        let back: Slide = serde_json::from_str(&json).expect("deserialize");
        assert!(matches!(back, Slide::Verse { id: 7, .. }));
    }

    #[test]
    fn custom_slide_roundtrips_with_type_tag() {
        let slide = custom_slide("custom-abc", Some("Grace"), "Amazing grace…");
        let json = serde_json::to_string(&slide).expect("serialize");
        assert_eq!(
            json,
            r#"{"type":"custom","id":"custom-abc","title":"Grace","body":"Amazing grace…"}"#
        );
        let back: Slide = serde_json::from_str(&json).expect("deserialize");
        assert!(matches!(back, Slide::Custom { .. }));
    }

    #[test]
    fn custom_slide_without_title_omits_title() {
        let slide = custom_slide("custom-abc", None, "Amazing grace…");
        let json = serde_json::to_string(&slide).expect("serialize");
        assert_eq!(
            json,
            r#"{"type":"custom","id":"custom-abc","body":"Amazing grace…"}"#
        );
        let back: Slide = serde_json::from_str(&json).expect("deserialize");
        match back {
            Slide::Custom { title, .. } => assert_eq!(title, None),
            Slide::Verse { .. } => panic!("expected custom slide"),
        }
    }

    #[test]
    fn slide_notes_travel_untouched_but_omit_when_absent() {
        // Notes ship with the deck payload yet never affect the
        // note-less JSON the stage asserted before this feature.
        let noted = Slide::Verse {
            id: 7,
            label: "John 3:16".into(),
            text: "For God so loved…".into(),
            notes: Some("Emphasize love".into()),
        };
        let json = serde_json::to_string(&noted).expect("serialize");
        assert_eq!(
            json,
            r#"{"type":"verse","id":7,"label":"John 3:16","text":"For God so loved…","notes":"Emphasize love"}"#
        );
        let back: Slide = serde_json::from_str(&json).expect("deserialize");
        match back {
            Slide::Verse { notes, .. } => assert_eq!(notes.as_deref(), Some("Emphasize love")),
            Slide::Custom { .. } => panic!("expected verse slide"),
        }
        // Payloads without notes still load (default None).
        let plain: Slide = serde_json::from_str(
            r#"{"type":"custom","id":"custom-abc","body":"Amazing grace…"}"#,
        )
        .expect("deserialize");
        match plain {
            Slide::Custom { notes, .. } => assert_eq!(notes, None),
            Slide::Verse { .. } => panic!("expected custom slide"),
        }
    }
    #[test]
    fn select_monitor_prefers_name_then_falls_back_to_position() {
        let monitors = vec![
            MonitorInfo {
                name: Some("Primary".into()),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                is_primary: true,
            },
            MonitorInfo {
                name: Some("Projector".into()),
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
                is_primary: false,
            },
        ];
        // By name, even when the position is stale (projector moved).
        let by_name = select_monitor(
            &monitors,
            &MonitorTarget {
                name: Some("Projector".into()),
                x: 0,
                y: 0,
            },
        )
        .expect("name match");
        assert_eq!(by_name.x, 1920);
        // Unknown name, known position: the projector by its new name.
        let by_pos = select_monitor(
            &monitors,
            &MonitorTarget {
                name: Some("Renamed".into()),
                x: 1920,
                y: 0,
            },
        )
        .expect("position fallback");
        assert_eq!(by_pos.name.as_deref(), Some("Projector"));
        // Nameless target matches by position only.
        let nameless = select_monitor(
            &monitors,
            &MonitorTarget {
                name: None,
                x: 0,
                y: 0,
            },
        )
        .expect("nameless position match");
        assert_eq!(nameless.name.as_deref(), Some("Primary"));
    }

    #[test]
    fn select_monitor_returns_none_without_match() {
        let monitors = vec![MonitorInfo {
            name: Some("Primary".into()),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_primary: true,
        }];
        // The picked monitor was unplugged: unknown name and position.
        assert!(
            select_monitor(
                &monitors,
                &MonitorTarget {
                    name: Some("Unplugged".into()),
                    x: 5000,
                    y: 0,
                },
            )
            .is_none()
        );
        // An absent name never matches another absent name.
        let nameless = vec![MonitorInfo {
            name: None,
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            is_primary: true,
        }];
        assert!(
            select_monitor(&nameless, &MonitorTarget { name: None, x: 9, y: 9 }).is_none()
        );
    }

    #[test]
    fn apply_sync_replaces_deck_and_clamps_index() {
        let outline_a = vec![OutlineSection {
            id: "outline-a".into(),
            heading: "Intro".into(),
            body: "".into(),
        }];
        let mut s = PresentationInner {
            deck: vec![
                verse_slide(1, "Genesis 1:1", "In the beginning…"),
                verse_slide(2, "Genesis 1:2", "And the earth…"),
                verse_slide(3, "Genesis 1:3", "And God said…"),
            ],
            index: 1,
            background: "classic-black".into(),
            theme: "dark".into(),
            outline: vec![],
            presenting: true,
        };
        // Growing the deck keeps the index; snapshots stay untouched.
        apply_sync(
            &mut s,
            vec![
                verse_slide(1, "Genesis 1:1", "In the beginning…"),
                verse_slide(2, "Genesis 1:2", "And the earth…"),
                verse_slide(3, "Genesis 1:3", "And God said…"),
                verse_slide(4, "Genesis 1:4", "And God saw…"),
            ],
            outline_a.clone(),
        );
        assert_eq!(s.index, 1);
        assert_eq!(s.deck.len(), 4);
        assert_eq!(s.outline, outline_a);
        assert_eq!(s.background, "classic-black");
        assert_eq!(s.theme, "dark");
        // Shrinking past the index clamps to the new last slide.
        apply_sync(&mut s, vec![verse_slide(9, "John 1:1", "In the beginning…")], vec![]);
        assert_eq!(s.index, 0);
        assert_eq!(s.deck.len(), 1);
        // An emptied deck parks at 0; both windows show waiting state.
        apply_sync(&mut s, vec![], vec![]);
        assert_eq!(s.index, 0);
        assert!(s.deck.is_empty());
    }

    #[test]
    fn normalize_theme_accepts_only_dark() {
        assert_eq!(normalize_theme(Some("dark".into())), "dark");
        assert_eq!(normalize_theme(Some("light".into())), "light");
        assert_eq!(normalize_theme(Some("midnight".into())), "light");
        assert_eq!(normalize_theme(None), "light");
    }

    #[test]
    fn outline_travels_with_stage_state() {
        let state = PresentationState::default();
        {
            let mut s = lock(&state);
            s.outline = vec![OutlineSection {
                id: "outline-a".into(),
                heading: "Point 1".into(),
                body: "Grace".into(),
            }];
        }
        let payload = {
            let s = lock(&state);
            stage_state_of(&s)
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.contains(
            r#""outline":[{"id":"outline-a","heading":"Point 1","body":"Grace"}]"#
        ));
        // The frontend shape deserializes back untouched.
        let back: Vec<OutlineSection> = serde_json::from_str(
            r#"[{"id":"outline-a","heading":"Point 1","body":"Grace"}]"#,
        )
        .expect("deserialize");
        assert_eq!(back[0].heading, "Point 1");
    }

    #[test]
    fn deck_deserializes_frontend_payload_in_order() {
        // Exactly what the frontend sends when presenting a mixed deck:
        // verse, untitled custom, titled custom, verse. Order and kinds
        // must survive the boundary, since the stage steps by index.
        let json = r#"[{"type":"verse","id":101,"label":"John 3:16","text":"For God…"},{"type":"custom","id":"custom-a1","body":"Point one"},{"type":"custom","id":"custom-b2","title":"Grace","body":"Amazing…"},{"type":"verse","id":205,"label":"Romans 8:28","text":"And we know…"}]"#;
        let deck: Vec<Slide> = serde_json::from_str(json).expect("deserialize");
        assert_eq!(deck.len(), 4);
        assert!(matches!(deck[0], Slide::Verse { id: 101, .. }));
        match &deck[1] {
            Slide::Custom { id, title, body, .. } => {
                assert_eq!(id, "custom-a1");
                assert_eq!(title, &None);
                assert_eq!(body, "Point one");
            }
            Slide::Verse { .. } => panic!("expected custom slide at 1"),
        }
        match &deck[2] {
            Slide::Custom { id, title, body, .. } => {
                assert_eq!(id, "custom-b2");
                assert_eq!(title, &Some("Grace".to_string()));
                assert_eq!(body, "Amazing…");
            }
            Slide::Verse { .. } => panic!("expected custom slide at 2"),
        }
        assert!(matches!(deck[3], Slide::Verse { id: 205, .. }));
    }

    #[test]
    fn mixed_deck_state_serializes_in_order() {
        let state = PresentationState::default();
        {
            let mut s = lock(&state);
            s.deck = vec![
                verse_slide(7, "John 3:16", "For God so loved…"),
                custom_slide("custom-abc", None, "Amazing grace…"),
            ];
            s.index = 1;
        }
        let payload = {
            let s = lock(&state);
            stage_state_of(&s)
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        assert_eq!(
            json,
            r#"{"deck":[{"type":"verse","id":7,"label":"John 3:16","text":"For God so loved…"},{"type":"custom","id":"custom-abc","body":"Amazing grace…"}],"index":1,"background":"classic-black","theme":"light","outline":[]}"#
        );
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
            r#"{"deck":[],"index":0,"background":"classic-black","theme":"light","outline":[]}"#
        );
    }
}
