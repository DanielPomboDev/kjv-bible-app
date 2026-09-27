use tauri::Manager;

mod clipboard;
mod db;
mod presentation;
mod search;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(presentation::PresentationState::default())
        .setup(|app| {
            // Pre-warm the presentation stage hidden; Present only ever
            // shows it (building a window on click hangs on Windows).
            presentation::create_stage_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::get_books,
            db::get_chapter,
            db::get_verses_by_ids,
            search::search_bible,
            presentation::presentation_state,
            presentation::present_deck_command,
            presentation::present_now_command,
            presentation::presentation_move,
            presentation::presentation_exit
        ])
        .on_window_event(|window, event| {
            // When the stage closes (Esc), hand focus back to the main
            // window so the user is back in the app, keyboard-first.
            if window.label() == "presentation" {
                if let tauri::WindowEvent::Destroyed = event {
                    if let Some(main) = window.app_handle().get_webview_window("main") {
                        let _ = main.set_focus();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
