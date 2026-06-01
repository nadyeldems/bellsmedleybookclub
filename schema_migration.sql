-- Add star rating column to ratings table
ALTER TABLE ratings ADD COLUMN stars INTEGER CHECK(stars >= 1 AND stars <= 5);

-- Read log: stores every time a book is marked as read
CREATE TABLE IF NOT EXISTS read_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  read_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
