-- Make isbn nullable so manually-added books don't need one.
-- SQLite allows multiple NULLs in a UNIQUE column (NULL != NULL).
PRAGMA foreign_keys = OFF;

CREATE TABLE books_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn        TEXT UNIQUE,
  title       TEXT NOT NULL,
  author      TEXT,
  cover_url   TEXT,
  description TEXT,
  publisher   TEXT,
  year        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO books_new SELECT * FROM books;
DROP TABLE books;
ALTER TABLE books_new RENAME TO books;

PRAGMA foreign_keys = ON;
