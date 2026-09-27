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
            // Pre-warm both extra windows hidden; the click path must
            // never build a window (building on click hangs on Windows).
            presentation::create_stage_window(app.handle());
            presentation::create_presenter_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::get_books,
            db::get_chapter,
            db::get_verses_by_ids,
            search::search_bible,
            presentation::presentation_state,
            presentation::list_monitors,
            presentation::present_deck_command,
            presentation::present_now_command,
            presentation::presentation_move,
            presentation::presentation_exit,
            presentation::sync_presenting_deck
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
            // The presenter's × is a full exit, not a solo hide: closing
            // either window closes both, so a fullscreen stage is never
            // left orphaned with its control panel gone. The pair stays
            // alive hidden so the next Present reuses it (same as Esc —
            // see `presentation_exit`).
            if window.label() == "presenter" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let app = window.app_handle();
                    if let Some(stage) = app.get_webview_window("presentation") {
                        let _ = stage.hide();
                    }
                    let _ = window.hide();
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.set_focus();
                    }
                    api.prevent_close();
                }
                // Crash/kill guard: if the presenter dies any other way,
                // don't leave its fullscreen stage behind either.
                if let tauri::WindowEvent::Destroyed = event {
                    let app = window.app_handle();
                    if let Some(stage) = app.get_webview_window("presentation") {
                        let _ = stage.hide();
                    }
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.set_focus();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
