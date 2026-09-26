use rusqlite::{params, Connection};
use serde::Serialize;

/// Location of the generated database, relative to the src-tauri crate.
/// The bundler does not include `data/`, so in a packaged build this file
/// does not exist and `open()` fails with a clear error instead of
/// panicking with a path not found.
const DB_RELATIVE_PATH: &str = "../data/bible.db";

/// A verse with its book name, as returned to the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterVerse {
    pub id: i64,
    pub book_name: String,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub book_id: i64,
    pub book_name: String,
    pub chapter: i32,
    pub verses: Vec<ChapterVerse>,
}

fn open() -> Result<Connection, String> {
    let path = std::env::current_dir()
        .map_err(|e| format!("cannot determine working directory: {e}"))?
        .join(DB_RELATIVE_PATH);
    if !path.is_file() {
        return Err(format!(
            "database not found at {}. Run `python data/import_kjv.py` to create it.",
            path.display()
        ));
    }
    // Read-only: the app never writes to the database.
    Connection::open_with_flags(
        &path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("failed to open database: {e}"))
}

/// Fetch all verses of one chapter, in verse order.
#[tauri::command]
pub fn get_chapter(book_id: i32, chapter: i32) -> Result<Chapter, String> {
    let conn = open()?;

    let (book_name, last_chapter): (String, i32) = conn
        .query_row(
            "SELECT name, (SELECT MAX(chapter) FROM verses WHERE book_id = books.id)
             FROM books WHERE id = ?1",
            params![book_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("unknown book id {book_id}"),
            other => format!("failed to look up book {book_id}: {other}"),
        })?;

    if chapter < 1 || chapter > last_chapter {
        return Err(format!(
            "{book_name} has {last_chapter} chapters; requested chapter {chapter}"
        ));
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, chapter, verse, text
             FROM verses
             WHERE book_id = ?1 AND chapter = ?2
             ORDER BY verse",
        )
        .map_err(|e| format!("failed to prepare query: {e}"))?;

    let verses = stmt
        .query_map(params![book_id, chapter], |row| {
            Ok(ChapterVerse {
                id: row.get(0)?,
                book_name: book_name.clone(),
                chapter: row.get(1)?,
                verse: row.get(2)?,
                text: row.get(3)?,
            })
        })
        .map_err(|e| format!("failed to query verses: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to read verses: {e}"))?;

    Ok(Chapter {
        book_id: book_id as i64,
        book_name,
        chapter,
        verses,
    })
}

// The dev server runs src-tauri as its working directory, so tests can read
// the real generated database when it exists.
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn john_3_has_36_verses_with_correct_text() {
        let path = Path::new(DB_RELATIVE_PATH);
        if !path.is_file() {
            eprintln!("skipping: data/bible.db not generated yet");
            return;
        }
        let ch = get_chapter(43, 3).expect("get_chapter should succeed");
        assert_eq!(ch.book_name, "John");
        assert_eq!(ch.verses.len(), 36);
        let v16 = &ch.verses[15];
        assert_eq!(v16.verse, 16);
        assert_eq!(
            v16.text,
            "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."
        );
        // Verses must be in order 1..36.
        assert!(ch.verses.iter().enumerate().all(|(i, v)| v.verse as usize == i + 1));
    }

    #[test]
    fn invalid_chapter_is_a_clean_error() {
        let path = Path::new(DB_RELATIVE_PATH);
        if !path.is_file() {
            eprintln!("skipping: data/bible.db not generated yet");
            return;
        }
        let err = get_chapter(43, 99).expect_err("John has only 21 chapters");
        assert!(err.contains("has 21 chapters"), "unexpected error: {err}");
    }
}
