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

/// A book with its chapter count, as returned to the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: i64,
    pub name: String,
    pub testament: String, // "OT" or "NT"
    pub chapter_count: i32,
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

/// All 66 books in canonical order, each with its number of chapters.
#[tauri::command]
pub fn get_books() -> Result<Vec<Book>, String> {
    let conn = open()?;

    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.name, b.testament,
                    COALESCE((SELECT MAX(chapter) FROM verses WHERE book_id = b.id), 0)
             FROM books b
             ORDER BY b.book_order",
        )
        .map_err(|e| format!("failed to prepare query: {e}"))?;

    let books = stmt
        .query_map([], |row| {
            Ok(Book {
                id: row.get(0)?,
                name: row.get(1)?,
                testament: row.get(2)?,
                chapter_count: row.get(3)?,
            })
        })
        .map_err(|e| format!("failed to query books: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to read books: {e}"))?;

    Ok(books)
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

    #[test]
    fn books_list_is_complete_with_chapter_counts() {
        let path = Path::new(DB_RELATIVE_PATH);
        if !path.is_file() {
            eprintln!("skipping: data/bible.db not generated yet");
            return;
        }
        let books = get_books().expect("get_books should succeed");
        // The full KJV canon: nothing missing, nothing extra.
        assert_eq!(books.len(), 66, "expected 66 books");
        let total_chapters: i32 = books.iter().map(|b| b.chapter_count).sum();
        assert_eq!(total_chapters, 1189, "expected 1189 chapters in total");
        let ot_count = books.iter().filter(|b| b.testament == "OT").count();
        assert_eq!(ot_count, 39, "expected 39 OT books");
        assert_eq!(books[0].name, "Genesis");
        assert_eq!(books[0].chapter_count, 50);
        assert_eq!(books[65].name, "Revelation");
        assert_eq!(books[65].chapter_count, 22);
        // Every book must have at least one chapter.
        assert!(books.iter().all(|b| b.chapter_count > 0));
    }

    #[test]
    fn every_chapter_of_every_book_loads() {
        let path = Path::new(DB_RELATIVE_PATH);
        if !path.is_file() {
            eprintln!("skipping: data/bible.db not generated yet");
            return;
        }
        let books = get_books().expect("get_books should succeed");
        let mut total_chapters = 0;
        let mut total_verses = 0;
        for book in &books {
            for chapter in 1..=book.chapter_count {
                let ch = get_chapter(book.id as i32, chapter)
                    .unwrap_or_else(|e| panic!("{} {}: {e}", book.name, chapter));
                assert_eq!(ch.book_name, book.name);
                assert_eq!(ch.chapter, chapter);
                assert!(!ch.verses.is_empty(), "{} {} has no verses", book.name, chapter);
                total_chapters += 1;
                total_verses += ch.verses.len();
            }
        }
        assert_eq!(total_chapters, 1189);
        // project notes: after importing, 66 books / 31,102 verses confirms nothing is missing.
        assert_eq!(total_verses, 31_102);
    }
}
