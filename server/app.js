import express from 'express';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const clock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function localNow() {
  const parts = Object.fromEntries(clock.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function validDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function weekDates(value) {
  const monday = new Date(`${value}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

function isPast(date, start, now) {
  return date < now.date || (date === now.date && start <= now.time);
}

async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const key = await deriveKey(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function session(client) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, client_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash(token), client.id, Date.now() + 7 * 24 * 60 * 60 * 1000);
    return { token, client: { id: client.id, name: client.name, email: client.email } };
  }

  function auth(req, res, next) {
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const client = token && db.prepare(`
      SELECT clients.id, clients.name, clients.email
      FROM sessions JOIN clients ON clients.id = sessions.client_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash(token), Date.now());
    if (!client) return res.status(401).json({ message: 'Entre na sua conta para continuar.' });
    req.client = client;
    req.token = token;
    next();
  }

  app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ message: 'Informe um nome com 2 a 80 caracteres.' });
    }
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ message: 'Informe um e-mail válido.' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({ message: 'A senha deve ter entre 6 e 128 caracteres.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const hash = await passwordHash(password);
    try {
      const result = db.prepare('INSERT INTO clients (name, email, password_hash) VALUES (?, ?, ?)')
        .run(name.trim(), normalizedEmail, hash);
      res.status(201).json(session({ id: Number(result.lastInsertRowid), name: name.trim(), email: normalizedEmail }));
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed: clients.email')) {
        return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
      }
      throw error;
    }
  });

  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 128) {
      return res.status(400).json({ message: 'Informe seu e-mail e sua senha.' });
    }
    const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(email.trim().toLowerCase());
    if (!client || !(await checkPassword(password, client.password_hash))) {
      return res.status(401).json({ message: 'E-mail ou senha incorretos.' });
    }
    res.json(session(client));
  });

  app.get('/api/me', auth, (req, res) => res.json({ client: req.client }));
  app.post('/api/logout', auth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(req.token));
    res.sendStatus(204);
  });

  app.get('/api/week', auth, (req, res) => {
    const now = localNow();
    const date = req.query.date ?? now.date;
    if (!validDate(date)) return res.status(400).json({ message: 'Selecione uma data válida.' });
    const days = weekDates(date);
    const courts = db.prepare('SELECT * FROM courts ORDER BY id').all();
    const slots = db.prepare('SELECT * FROM time_slots ORDER BY start_time').all();
    const reservations = db.prepare(`
      SELECT id, client_id, court_id, slot_id, date FROM reservations WHERE date BETWEEN ? AND ?
    `).all(days[0], days[6]);
    const occupied = new Map(reservations.map((r) => [`${r.court_id}/${r.date}/${r.slot_id}`, r]));
    const availability = courts.flatMap((court) => days.flatMap((day) => slots.map((slot) => {
      const reservation = occupied.get(`${court.id}/${day}/${slot.id}`);
      return {
        courtId: court.id, date: day, slotId: slot.id,
        status: reservation ? 'reserved' : isPast(day, slot.start_time, now) ? 'past' : 'available',
        mine: reservation?.client_id === req.client.id,
      };
    })));
    res.json({ today: now.date, days, courts, slots, availability });
  });

  app.post('/api/reservations', auth, (req, res) => {
    const { courtId, slotId, date } = req.body ?? {};
    if (!validDate(date) || !Number.isSafeInteger(slotId)) {
      return res.status(400).json({ message: 'Período inválido. Selecione uma data e um horário da agenda.' });
    }
    if (!Number.isSafeInteger(courtId)) return res.status(404).json({ message: 'Quadra inexistente.' });
    const court = db.prepare('SELECT id FROM courts WHERE id = ?').get(courtId);
    if (!court) return res.status(404).json({ message: 'Quadra inexistente.' });
    const slot = db.prepare('SELECT * FROM time_slots WHERE id = ?').get(slotId);
    if (!slot || isPast(date, slot.start_time, localNow())) {
      return res.status(400).json({ message: 'Período inválido. Escolha um horário futuro da agenda.' });
    }
    try {
      const result = db.prepare('INSERT INTO reservations (client_id, court_id, slot_id, date) VALUES (?, ?, ?, ?)')
        .run(req.client.id, courtId, slotId, date);
      res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Reserva confirmada!' });
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed: reservations.')) {
        return res.status(409).json({ message: 'Este horário acabou de ser reservado. Escolha outro.' });
      }
      throw error;
    }
  });

  app.get('/api/reservations', auth, (req, res) => {
    const now = localNow();
    const reservations = db.prepare(`
      SELECT reservations.id, reservations.date, courts.name AS court,
        time_slots.start_time AS start, time_slots.end_time AS end
      FROM reservations
      JOIN courts ON courts.id = reservations.court_id
      JOIN time_slots ON time_slots.id = reservations.slot_id
      WHERE client_id = ? AND (date > ? OR (date = ? AND time_slots.end_time > ?))
      ORDER BY date, time_slots.start_time, courts.id
    `).all(req.client.id, now.date, now.date, now.time);
    res.json({ reservations });
  });

  app.use('/api', (_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Dados inválidos.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Dados muito grandes.' });
    console.error(error);
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' });
  });
  return app;
}
