-- Make thumbs nullable so star-only ratings can be stored
-- SQLite requires full table recreation to change column constraints

PRAGMA foreign_keys = OFF;

CREATE TABLE ratings_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  thumbs     TEXT CHECK(thumbs IN ('up', 'down')),
  stars      INTEGER CHECK(stars >= 1 AND stars <= 5),
  comment    TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ratings_new SELECT * FROM ratings;

DROP TABLE ratings;

ALTER TABLE ratings_new RENAME TO ratings;

PRAGMA foreign_keys = ON;
