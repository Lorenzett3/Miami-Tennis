import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS courts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      surface TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS time_slots (
      id INTEGER PRIMARY KEY,
      start_time TEXT NOT NULL UNIQUE,
      end_time TEXT NOT NULL,
      CHECK (start_time < end_time)
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      court_id INTEGER NOT NULL REFERENCES courts(id),
      slot_id INTEGER NOT NULL REFERENCES time_slots(id),
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (court_id, date, slot_id)
    );
  `);

  const court = db.prepare('INSERT OR IGNORE INTO courts (id, name, surface) VALUES (?, ?, ?)');
  court.run(1, 'Quadra 1', 'Saibro');
  court.run(2, 'Quadra 2', 'Piso rápido');
  const slot = db.prepare('INSERT OR IGNORE INTO time_slots (id, start_time, end_time) VALUES (?, ?, ?)');
  for (let hour = 8; hour < 22; hour++) {
    slot.run(hour - 7, `${String(hour).padStart(2, '0')}:00`, `${String(hour + 1).padStart(2, '0')}:00`);
  }
  return db;
}
