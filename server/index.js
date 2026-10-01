import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createApp } from './app.js';

const db = openDatabase(fileURLToPath(new URL('../data/miami-tennis.db', import.meta.url)));
const app = createApp(db);
const dist = fileURLToPath(new URL('../dist', import.meta.url));

if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(`${dist}/index.html`));
}

const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Miami Tennis: http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
