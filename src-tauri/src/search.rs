//! Search: one command, three cases, tried in this order:
//!   1. book + chapter + verse reference  ("John 3:16")
//!   2. book + chapter reference          ("John 3")
//!   3. full-text word/phrase search (FTS5; quotes = exact phrase)
//!
//! Reference parsing is done in Rust with no regex dependency; the book
//! name must match a canonical name from the `books` table, so an unknown
//! book or a query like "love 3:16" falls through to case 3 cleanly.
//! If a reference names a chapter that does not exist (e.g. "John 99"),
//! the query falls through to case 3 as well, and a reference with a
//! verse that does not exist ("John 3:99") returns the whole chapter.

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db::{book_id_by_name, book_name, open};

/// One search hit: enough to display the verse in a list and to open it
/// in the reading pane.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: i64,
    pub book_id: i64,
    pub book_name: String,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

/// Maximum number of hits returned for a text search.
const TEXT_LIMIT: i64 = 100;

/// If the query starts with a canonical book name, return
/// (book_name, Some(rest)) or (book_name, None). Longest match first so
/// "1 Samuel 2" resolves to 1 Samuel, not nothing. Case-insensitive.
fn split_leading_book(query: &str) -> Option<(String, Option<&str>)> {
    let query = query.trim_start();
    // All 66 canonical names, with their numeric prefixes. Sorted by
    // length at runtime below so the longest match wins.
    const BOOKS: &[&str] = &[
        "1 Corinthians", "2 Corinthians", "1 Thessalonians", "2 Thessalonians",
        "1 Timothy", "2 Timothy", "1 Peter", "2 Peter", "1 John", "2 John",
        "3 John", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
        "1 Chronicles", "2 Chronicles", "Song of Solomon", "Genesis",
        "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges",
        "Ruth", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
        "Ecclesiastes", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel",
        "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
        "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
        "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "Galatians",
        "Ephesians", "Philippians", "Colossians", "Titus", "Philemon",
        "Hebrews", "James", "Jude", "Revelation",
    ];
    let lower = query.to_lowercase();
    let mut names: Vec<&&str> = BOOKS.iter().collect();
    names.sort_by_key(|b| std::cmp::Reverse(b.len()));
    for name in names {
        let name_lower = name.to_lowercase();
        if lower.starts_with(&name_lower) {
            let after = &query[name.len()..];
            // The match must end at a word boundary (or before a
            // chapter:verse colon), not inside a word — e.g. "Marks 2"
            // is not the book Mark + chapter 2.
            if after.is_empty()
                || after.starts_with(char::is_whitespace)
                || after.starts_with(':')
            {
                return Some((name.to_string(), Some(after.trim_start())));
            }
        }
    }
    None
}

/// Split off the first whitespace-delimited token.
fn split_first_token(s: &str) -> (&str, Option<&str>) {
    match s.split_once(char::is_whitespace) {
        Some((a, b)) => (a, Some(b)),
        None => (s, None),
    }
}

fn is_positive_int(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()) && s != "0"
}

/// Parse a chapter/verse token: "3" → (3, None), "3:16" → (3, Some(16)).
/// Anything else (empty, zero, "3:", "3:x", overflowing) is not a
/// reference and the caller falls through to a text search.
fn parse_reference(token: &str) -> Option<(i32, Option<i32>)> {
    let (chapter_str, verse_str) = match token.split_once(':') {
        Some((c, v)) => (c, Some(v)),
        None => (token, None),
    };
    if !is_positive_int(chapter_str) {
        return None;
    }
    let chapter = chapter_str.parse().ok()?;
    match verse_str {
        None => Some((chapter, None)),
        Some(v) if is_positive_int(v) => Some((chapter, Some(v.parse().ok()?))),
        Some(_) => None,
    }
}

/// Case 1: "John 3:16" → the single verse.
fn search_reference_verse(
    conn: &Connection,
    book: &str,
    chapter: i32,
    verse: i32,
) -> Result<Option<SearchHit>, String> {
    let Some(book_id) = book_id_by_name(conn, book)? else {
        return Ok(None);
    };
    let name = book_name(conn, book_id)?;
    let hit = conn
        .query_row(
            "SELECT id, text FROM verses WHERE book_id = ?1 AND chapter = ?2 AND verse = ?3",
            params![book_id, chapter, verse],
            |row| {
                Ok(SearchHit {
                    id: row.get(0)?,
                    book_id,
                    book_name: name.clone(),
                    chapter,
                    verse,
                    text: row.get(1)?,
                })
            },
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(format!(
                "failed to look up {book} {chapter}:{verse}: {other}"
            )),
        })?;
    Ok(hit)
}

/// Case 2: "John 3" → the whole chapter in verse order.
fn search_reference_chapter(
    conn: &Connection,
    book: &str,
    chapter: i32,
) -> Result<Option<Vec<SearchHit>>, String> {
    let Some(book_id) = book_id_by_name(conn, book)? else {
        return Ok(None);
    };
    let name = book_name(conn, book_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, verse, text FROM verses
             WHERE book_id = ?1 AND chapter = ?2
             ORDER BY verse",
        )
        .map_err(|e| format!("failed to prepare chapter search: {e}"))?;
    let hits = stmt
        .query_map(params![book_id, chapter], |row| {
            Ok(SearchHit {
                id: row.get(0)?,
                book_id,
                book_name: name.clone(),
                chapter,
                verse: row.get(1)?,
                text: row.get(2)?,
            })
        })
        .map_err(|e| format!("failed to query chapter: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to read chapter: {e}"))?;
    if hits.is_empty() {
        return Ok(None);
    }
    Ok(Some(hits))
}

/// Case 3: FTS5 word/phrase search. `match_expr` must already be a valid
/// FTS5 MATCH expression (see `fts_expression`).
fn search_text(conn: &Connection, match_expr: &str) -> Result<Vec<SearchHit>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT v.id, v.book_id, b.name, v.chapter, v.verse, v.text
             FROM verses_fts f
             JOIN verses v ON v.id = f.rowid
             JOIN books b ON b.id = v.book_id
             WHERE verses_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(|e| format!("failed to prepare text search: {e}"))?;
    let hits = stmt
        .query_map(params![match_expr, TEXT_LIMIT], |row| {
            Ok(SearchHit {
                id: row.get(0)?,
                book_id: row.get(1)?,
                book_name: row.get(2)?,
                chapter: row.get(3)?,
                verse: row.get(4)?,
                text: row.get(5)?,
            })
        })
        .map_err(|e| format!("failed to query text: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to read text results: {e}"))?;
    Ok(hits)
}

/// Sanitize user text into a safe FTS5 MATCH expression:
/// - bare words → implicit AND ("love joy" → `"love" "joy"`)
/// - anything inside double quotes → kept as an exact phrase
/// - all FTS5 operators/punctuation stripped from user tokens, so no
///   syntax errors can reach SQLite. An unterminated trailing quote
///   phrase is still searched as a phrase.
fn fts_expression(query: &str) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    let mut chars = query.chars().peekable();
    loop {
        while matches!(chars.peek(), Some(c) if c.is_whitespace()) {
            chars.next();
        }
        match chars.peek() {
            None => break,
            Some('"') => {
                chars.next(); // opening quote
                let mut phrase = String::new();
                let mut closed = false;
                for c in chars.by_ref() {
                    if c == '"' {
                        closed = true;
                        break;
                    }
                    phrase.push(c);
                }
                let phrase = phrase
                    .split_whitespace()
                    .map(tokenize_word)
                    .filter(|t| !t.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");
                if !phrase.is_empty() {
                    parts.push(format!("\"{phrase}\""));
                }
                if !closed {
                    break; // nothing left after an unterminated quote
                }
            }
            Some(_) => {
                // Bare word: read until whitespace or an opening quote.
                let mut word = String::new();
                while let Some(&c) = chars.peek() {
                    if c.is_whitespace() || c == '"' {
                        break;
                    }
                    word.push(c);
                    chars.next();
                }
                let token = tokenize_word(&word);
                if !token.is_empty() {
                    parts.push(format!("\"{token}\""));
                }
            }
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

/// Lowercase, strip everything that is not a letter/digit/apostrophe.
/// FTS5's default tokenizer splits on non-alphanumerics, so `god's`
/// becomes tokens `god` + `s` — same as the indexed text.
fn tokenize_word(word: &str) -> String {
    word.chars()
        .filter(|c| c.is_alphanumeric() || *c == '\'')
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// Public command called from the frontend.
#[tauri::command]
pub fn search_bible(query: String) -> Result<SearchResponse, String> {
    let conn = open()?;
    search(&conn, &query)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SearchResponse {
    /// A single verse reference like "John 3:16".
    Verse { hit: SearchHit },
    /// A chapter reference like "John 3" — every verse of the chapter.
    Chapter {
        book_id: i64,
        book_name: String,
        chapter: i32,
        hits: Vec<SearchHit>,
    },
    /// Full-text results, best match first.
    Text { query: String, hits: Vec<SearchHit> },
}

fn search(conn: &Connection, raw_query: &str) -> Result<SearchResponse, String> {
    let query = raw_query.trim();
    if query.is_empty() {
        return Ok(SearchResponse::Text {
            query: String::new(),
            hits: Vec::new(),
        });
    }

    // Cases 1 and 2: a canonical book name followed by a single
    // chapter ([:verse]) token.
    if let Some((book, Some(rest))) = split_leading_book(query) {
        let (token, tail) = split_first_token(rest);
        if tail.is_none() {
            if let Some((chapter, verse)) = parse_reference(token) {
                if let Some(v) = verse {
                    if let Some(hit) = search_reference_verse(conn, &book, chapter, v)? {
                        return Ok(SearchResponse::Verse { hit });
                    }
                }
                if let Some(hits) = search_reference_chapter(conn, &book, chapter)? {
                    return Ok(SearchResponse::Chapter {
                        book_id: hits[0].book_id,
                        book_name: hits[0].book_name.clone(),
                        chapter,
                        hits,
                    });
                }
                // The book exists but the chapter/verse does not —
                // fall through to a text search rather than returning
                // nothing at all.
            }
        }
    }

    // Case 3: full-text search.
    let Some(expr) = fts_expression(query) else {
        return Ok(SearchResponse::Text {
            query: query.to_string(),
            hits: Vec::new(),
        });
    };
    let hits = search_text(conn, &expr)?;
    Ok(SearchResponse::Text {
        query: query.to_string(),
        hits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn test_conn() -> Option<Connection> {
        let path = Path::new("../data/bible.db");
        if !path.is_file() {
            eprintln!("skipping: data/bible.db not generated yet");
            return None;
        }
        Some(open().expect("open test database"))
    }

    /// The three search cases, in the order they are tried. Serialize
    /// is only needed so failed asserts can print the actual case.
    #[derive(Debug, PartialEq, Eq, serde::Serialize)]
    enum Case {
        BookChapterVerse,
        BookChapter,
        FullText,
    }

    /// Classify a query by shape only — e.g. "John 99:1" classifies as
    /// a reference even though it falls through to a text search at
    /// runtime because that chapter does not exist.
    fn classify(query: &str) -> Case {
        let Some((_, Some(rest))) = split_leading_book(query) else {
            return Case::FullText;
        };
        // Only a single token after the book name is a reference; anything
        // else ("John 3 extra words") is a text search.
        let (token, tail) = split_first_token(rest);
        if tail.is_some() {
            return Case::FullText;
        }
        match parse_reference(token) {
            Some((_, Some(_))) => Case::BookChapterVerse,
            Some((_, None)) => Case::BookChapter,
            None => Case::FullText,
        }
    }

    #[test]
    fn parse_reference_tokens() {
        assert_eq!(parse_reference("3"), Some((3, None)));
        assert_eq!(parse_reference("3:16"), Some((3, Some(16))));
        assert_eq!(parse_reference("3:"), None);
        assert_eq!(parse_reference("3:x"), None);
        assert_eq!(parse_reference("0"), None);
        assert_eq!(parse_reference(""), None);
        assert_eq!(parse_reference("999999999999"), None);
    }

    #[test]
    fn john_3_16_returns_that_verse() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "John 3:16").expect("search should succeed");
        match resp {
            SearchResponse::Verse { hit } => {
                // 43 = John, 1,189 chapters × up to 176 verses → verse
                // row ids are well below 100_000.
                assert!((1..100_000).contains(&hit.id), "hit must carry its real verse id");
                assert_eq!(hit.book_name, "John");
                assert_eq!(hit.chapter, 3);
                assert_eq!(hit.verse, 16);
                assert!(hit.text.starts_with("For God so loved the world"));
            }
            other => panic!("expected Verse, got {other:?}"),
        }
    }

    #[test]
    fn john_3_returns_whole_chapter_in_order() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "john 3").expect("search should succeed");
        match resp {
            SearchResponse::Chapter { book_name, chapter, hits, .. } => {
                assert_eq!(book_name, "John");
                assert_eq!(chapter, 3);
                assert_eq!(hits.len(), 36, "John 3 has 36 verses");
                assert!(hits.iter().enumerate().all(|(i, h)| h.verse as usize == i + 1));
            }
            other => panic!("expected Chapter, got {other:?}"),
        }
    }

    #[test]
    fn two_part_book_names_resolve() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "1 Samuel 2:5").expect("search should succeed");
        match resp {
            SearchResponse::Verse { hit } => {
                assert_eq!(hit.book_name, "1 Samuel");
                assert_eq!(hit.chapter, 2);
                assert_eq!(hit.verse, 5);
            }
            other => panic!("expected Verse, got {other:?}"),
        }
    }

    #[test]
    fn verse_out_of_range_returns_the_chapter() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "John 3:99").expect("search should succeed");
        match resp {
            SearchResponse::Chapter { chapter, hits, .. } => {
                assert_eq!(chapter, 3);
                assert_eq!(hits.len(), 36);
            }
            other => panic!("expected Chapter, got {other:?}"),
        }
    }

    #[test]
    fn missing_chapter_falls_back_to_text() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "John 99").expect("search should succeed");
        assert!(matches!(resp, SearchResponse::Text { .. }), "got {resp:?}");
    }

    #[test]
    fn reference_with_trailing_words_is_text_search() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "John 3:16 for god").expect("search should succeed");
        assert!(matches!(resp, SearchResponse::Text { .. }), "got {resp:?}");
    }

    #[test]
    fn phrase_search_finds_exact_phrase() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "\"for god so loved\"").expect("search should succeed");
        match resp {
            SearchResponse::Text { hits, .. } => {
                assert!(!hits.is_empty());
                assert!(hits[0].text.contains("For God so loved"));
            }
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn multi_word_search_requires_all_words() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "whosoever believeth").expect("search should succeed");
        match resp {
            SearchResponse::Text { hits, .. } => {
                assert!(!hits.is_empty());
                let first = hits[0].text.to_lowercase();
                assert!(first.contains("whosoever") && first.contains("believeth"));
            }
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn word_search_finds_common_word() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "whosoever").expect("search should succeed");
        match resp {
            SearchResponse::Text { hits, .. } => {
                assert!(!hits.is_empty(), "whosoever appears many times");
                assert!(hits.len() <= TEXT_LIMIT as usize);
            }
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn fts_syntax_characters_are_sanitized() {
        let Some(conn) = test_conn() else { return };
        // These would be FTS5 syntax errors if passed through raw.
        let resp = search(&conn, "love \" OR NOT (").expect("search should succeed");
        match resp {
            SearchResponse::Text { .. } => {}
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn unterminated_quote_is_still_searchable() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "\"for god so loved").expect("search should succeed");
        match resp {
            SearchResponse::Text { hits, .. } => assert!(!hits.is_empty()),
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn unknown_book_falls_through_to_text() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "notabook 3:16").expect("search should succeed");
        match resp {
            SearchResponse::Text { hits, .. } => {
                // "notabook" is not in any verse, so empty results are fine.
                let _ = hits;
            }
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn genesis_1_1_returns_first_verse() {
        let Some(conn) = test_conn() else { return };
        let resp = search(&conn, "Genesis 1:1").expect("search should succeed");
        match resp {
            SearchResponse::Verse { hit } => {
                assert_eq!(hit.book_name, "Genesis");
                assert!(hit.text.starts_with("In the beginning"));
            }
            other => panic!("expected Verse, got {other:?}"),
        }
    }

    #[test]
    fn classify_cases() {
        assert_eq!(classify("John 3:16"), Case::BookChapterVerse);
        assert_eq!(classify("john 3"), Case::BookChapter);
        assert_eq!(classify("John 99:1"), Case::BookChapterVerse);
        assert_eq!(classify("1 Samuel 2:5"), Case::BookChapterVerse);
        assert_eq!(classify("1 Samuel 2"), Case::BookChapter);
        assert_eq!(classify("Song of Solomon 3"), Case::BookChapter);
        assert_eq!(classify("Genesis 1:1"), Case::BookChapterVerse);
        assert_eq!(classify("love"), Case::FullText);
        assert_eq!(classify("love joy"), Case::FullText);
        assert_eq!(classify("\"for god so loved\""), Case::FullText);
        assert_eq!(classify("John"), Case::FullText);
        assert_eq!(classify("John 3 extra"), Case::FullText);
        assert_eq!(classify("love 3:16"), Case::FullText);
        assert_eq!(classify("John 3:"), Case::FullText);
        assert_eq!(classify("John 0"), Case::FullText);
    }
}
