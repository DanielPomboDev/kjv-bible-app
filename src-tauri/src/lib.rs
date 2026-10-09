mod clipboard;
mod db;
mod search;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Single-window app: reading, sermon assembly, and data for
    // PowerPoint export. Presenting happens in PowerPoint — there are
    // no stage/presenter windows and no presentation commands.
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            db::get_books,
            db::get_chapter,
            db::get_verses_by_ids,
            search::search_bible,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
