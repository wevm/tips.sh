CREATE VIRTUAL TABLE IF NOT EXISTS tips_fts USING fts5(
  number,
  title,
  authors,
  abstract,
  content,
  content='tips',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Auto-sync triggers
CREATE TRIGGER IF NOT EXISTS tips_ai AFTER INSERT ON tips BEGIN
  INSERT INTO tips_fts(rowid, number, title, authors, abstract, content)
  VALUES (new.rowid, new.number, new.title, new.authors, new.abstract, new.content);
END;

CREATE TRIGGER IF NOT EXISTS tips_ad AFTER DELETE ON tips BEGIN
  INSERT INTO tips_fts(tips_fts, rowid, number, title, authors, abstract, content)
  VALUES ('delete', old.rowid, old.number, old.title, old.authors, old.abstract, old.content);
END;

CREATE TRIGGER IF NOT EXISTS tips_au AFTER UPDATE ON tips BEGIN
  INSERT INTO tips_fts(tips_fts, rowid, number, title, authors, abstract, content)
  VALUES ('delete', old.rowid, old.number, old.title, old.authors, old.abstract, old.content);
  INSERT INTO tips_fts(rowid, number, title, authors, abstract, content)
  VALUES (new.rowid, new.number, new.title, new.authors, new.abstract, new.content);
END;
