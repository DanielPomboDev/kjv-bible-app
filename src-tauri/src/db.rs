use rusqlite::{params, Connection};
use serde::Serialize;

pub use book_lookup::{book_id_by_name, book_name};

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

pub fn open() -> Result<Connection, String> {
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

/// Fetch verses by id — used by "Copy Selected". Returned in canonical
/// book/chapter/verse order, which is simply `ORDER BY id` because the
/// importer assigns ids 1..N in canonical order. Query runs in chunks so
/// even a whole-Bible selection stays under SQLite's parameter limit.
#[tauri::command]
pub fn get_verses_by_ids(ids: Vec<i64>) -> Result<Vec<ChapterVerse>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open()?;
    const CHUNK_SIZE: usize = 900;
    let mut out: Vec<ChapterVerse> = Vec::new();
    for chunk in ids.chunks(CHUNK_SIZE) {
        let placeholders = std::iter::repeat("?")
            .take(chunk.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT v.id, b.name, v.chapter, v.verse, v.text
             FROM verses v
             JOIN books b ON b.id = v.book_id
             WHERE v.id IN ({placeholders})
             ORDER BY v.id"
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("failed to prepare verse lookup: {e}"))?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(chunk.iter()), |row| {
                Ok(ChapterVerse {
                    id: row.get(0)?,
                    book_name: row.get(1)?,
                    chapter: row.get(2)?,
                    verse: row.get(3)?,
                    text: row.get(4)?,
                })
            })
            .map_err(|e| format!("failed to query verses: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("failed to read verses: {e}"))?;
        out.extend(rows);
    }
    // The caller may pass ids in any order; canonical order is by id.
    out.sort_unstable_by_key(|v| v.id);
    Ok(out)
}

/// Book-name lookups shared by db.rs and search.rs.
mod book_lookup {
    use rusqlite::Connection;

    /// Resolve a user-typed book name ("1 Corinthians") to its id, matched
    /// case-insensitively against the canonical name. Any SQL LIKE wildcards
    /// in the user text are escaped, so only `%`/`_` as literals match.
    pub fn book_id_by_name(conn: &Connection, name: &str) -> Result<Option<i64>, String> {
        let pattern = format!("{}%", escape_like(name));
        let mut stmt = conn
            .prepare("SELECT id FROM books WHERE name LIKE ?1 ESCAPE '\\' ORDER BY book_order")
            .map_err(|e| format!("failed to prepare book lookup: {e}"))?;
        let mut rows = stmt
            .query(rusqlite::params![pattern])
            .map_err(|e| format!("failed to look up book {name:?}: {e}"))?;
        match rows.next() {
            Ok(Some(row)) => {
                let id = row.get(0).map_err(|e| format!("bad book row: {e}"))?;
                Ok(Some(id))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(format!("failed to look up book {name:?}: {e}")),
        }
    }

    /// Canonical name for a book id (e.g. 43 → "John").
    pub fn book_name(conn: &Connection, book_id: i64) -> Result<String, String> {
        conn.query_row(
            "SELECT name FROM books WHERE id = ?1",
            rusqlite::params![book_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("unknown book id {book_id}"),
            other => format!("failed to look up book id {book_id}: {other}"),
        })
    }

    /// Escape LIKE wildcards so user text matches itself only.
    fn escape_like(text: &str) -> String {
        text.replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    }
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
    fn get_verses_by_ids_returns_canonical_order() {
        let path = Path::new(DB_RELATIVE_PATH);
        if !path.is_file() {
            eprintln!("skipping: data/bible.db not generated yet");
            return;
        }
        // Two verses from different chapters, requested out of order.
        let john2 = get_chapter(43, 2).expect("John 2");
        let john3 = get_chapter(43, 3).expect("John 3");
        let last_of_j2 = john2.verses.last().expect("John 2 has verses").clone();
        let first_of_j3 = john3.verses.first().expect("John 3 has verses").clone();
        assert!(last_of_j2.id < first_of_j3.id);

        let out = get_verses_by_ids(vec![first_of_j3.id, last_of_j2.id])
            .expect("get_verses_by_ids should succeed");
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].id, last_of_j2.id, "lower id (earlier chapter) first");
        assert_eq!(out[0].book_name, "John");
        assert_eq!(out[0].chapter, 2);
        assert_eq!(out[1].id, first_of_j3.id);
        assert_eq!(out[1].chapter, 3);
        assert_eq!(out[1].text, first_of_j3.text);
    }

    #[test]
    fn get_verses_by_ids_handles_empty_and_unknown() {
        let path = Path::new(DB_RELATIVE_PATH);
        if !path.is_file() {
            eprintln!("skipping: data/bible.db not generated yet");
            return;
        }
        assert!(get_verses_by_ids(Vec::new())
            .expect("empty input")
            .is_empty());
        let out = get_verses_by_ids(vec![999_999_999])
            .expect("unknown ids are skipped, not an error");
        assert!(out.is_empty());    }

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
        // AGENTS.md: after importing, 66 books / 31,102 verses confirms nothing is missing.
        assert_eq!(total_verses, 31_102);
    }
}
