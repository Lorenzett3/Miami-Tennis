import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from './db.js';
import { createApp } from './app.js';

async function fixture(t, path = ':memory:') {
  const db = openDatabase(path);
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api`;
  let closed = false;
  async function close() {
    if (closed) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    closed = true;
  }
  t.after(close);
  async function request(path, { method = 'GET', body, token } = {}) {
    const response = await fetch(url + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }
  const register = (email = 'ana@example.com') => request('/register', {
    method: 'POST', body: { name: 'Ana Silva', email, password: 'tenis123' },
  });
  return { db, request, register, close };
}

function futureDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString().slice(0, 10);
}

test('cadastro orgânico, validação, senha protegida e login', async (t) => {
  const { db, request, register } = await fixture(t);
  for (const body of [
    { name: 'A', email: 'ana@example.com', password: 'tenis123' },
    { name: 'Ana', email: 'invalido', password: 'tenis123' },
    { name: 'Ana', email: 'ana@example.com', password: '123' },
    null,
  ]) assert.equal((await request('/register', { method: 'POST', body })).status, 400);
  const account = await register(' ANA@EXAMPLE.COM ');
  assert.equal(account.status, 201);
  assert.equal(account.data.client.email, 'ana@example.com');
  assert.equal(account.data.client.name, 'Ana Silva');
  assert.ok(account.data.token);
  assert.equal(account.data.client.password_hash, undefined);
  const stored = db.prepare('SELECT * FROM clients').get();
  assert.notEqual(stored.password_hash, 'tenis123');
  assert.match(stored.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal((await register()).status, 409);
  for (const [email, password] of [['ana@example.com', 'errada'], ['ninguem@example.com', 'tenis123']]) {
    assert.equal((await request('/login', { method: 'POST', body: { email, password } })).status, 401);
  }
  const login = await request('/login', { method: 'POST', body: { email: 'ANA@example.com', password: 'tenis123' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.client.id, account.data.client.id);
  assert.notEqual(login.data.token, account.data.token);
});

test('autorização Bearer, expiração e logout invalidam sessões', async (t) => {
  const { db, request, register } = await fixture(t);
  for (const path of ['/week', '/me', '/reservations']) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, { token: 'invalido' })).status, 401);
  }
  assert.equal((await request('/reservations', { method: 'POST', body: {} })).status, 401);
  const { data: { token } } = await register();
  assert.equal((await request('/me', { token })).status, 200);
  assert.equal((await request('/logout', { method: 'POST', token })).status, 204);
  assert.equal((await request('/me', { token })).status, 401);
  const login = await request('/login', { method: 'POST', body: { email: 'ana@example.com', password: 'tenis123' } });
  db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
  assert.equal((await request('/me', { token: login.data.token })).status, 401);
});

test('dashboard semanal, quadras/horários no banco e validação de datas', async (t) => {
  const { request, register } = await fixture(t);
  const { data: { token } } = await register();
  const week = await request('/week?date=2026-10-01', { token });
  assert.equal(week.status, 200);
  assert.deepEqual(week.data.days, ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(week.data.courts.length, 2);
  assert.equal(week.data.slots.length, 14);
  assert.equal(week.data.slots[0].start_time, '08:00');
  assert.equal(week.data.slots.at(-1).end_time, '22:00');
  assert.equal(week.data.availability.length, 2 * 7 * 14);
  for (const date of ['2026-02-30', 'abc', '2026-1-1']) {
    assert.equal((await request(`/week?date=${date}`, { token })).status, 400);
  }
  const past = await request('/week?date=2000-01-01', { token });
  assert.ok(past.data.availability.every((slot) => slot.status === 'past'));
  const next = await request(`/week?date=${futureDate()}`, { token });
  assert.ok(next.data.availability.every((slot) => slot.status === 'available'));
});

test('reserva valida período/quadra, distingue clientes e impede conflito simultâneo', async (t) => {
  const { request, register } = await fixture(t);
  const { data: ana } = await register();
  const { data: bia } = await register('bia@example.com');
  const body = { courtId: 1, slotId: 1, date: futureDate() };
  for (const [invalidBody, expected] of [
    [{ ...body, courtId: 999 }, 404],
    [{ ...body, courtId: '1' }, 404],
    [{ ...body, slotId: 999 }, 400],
    [{ ...body, slotId: '1' }, 400],
    [{ ...body, date: '2026-02-30' }, 400],
    [{ ...body, date: '2000-01-01' }, 400],
    [null, 400],
  ]) assert.equal((await request('/reservations', { method: 'POST', token: ana.token, body: invalidBody })).status, expected);
  const results = await Promise.all([ana, bia].map((client) => request('/reservations', {
    method: 'POST', token: client.token, body: { ...body, clientId: bia.client.id },
  })));
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const winner = results[0].status === 201 ? ana : bia;
  const loser = winner === ana ? bia : ana;
  assert.equal((await request('/reservations', { method: 'POST', token: winner.token, body })).status, 409);
  for (const [client, mine] of [[winner, true], [loser, false]]) {
    const week = await request(`/week?date=${body.date}`, { token: client.token });
    const cell = week.data.availability.find((cell) => cell.courtId === body.courtId && cell.date === body.date && cell.slotId === body.slotId);
    assert.equal(cell.status, 'reserved');
    assert.equal(cell.mine, mine);
    assert.equal(cell.client_id, undefined);
    const reservations = await request('/reservations', { token: client.token });
    assert.equal(reservations.data.reservations.length, mine ? 1 : 0);
    if (mine) {
      assert.equal(reservations.data.reservations[0].start, '08:00');
      assert.equal(reservations.data.reservations[0].end, '09:00');
    }
  }
  assert.equal((await request('/reservations', { method: 'POST', token: loser.token, body: { ...body, courtId: 2 } })).status, 201);
  assert.equal((await request('/reservations', { method: 'POST', token: winner.token, body: { ...body, slotId: 2 } })).status, 201);
});

test('clientes, sessões e reservas persistem após reabrir o banco', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'miami-tennis-test-'));
  t.after(() => {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep));
    assert.ok(target.split(sep).at(-1).startsWith('miami-tennis-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  const path = join(directory, 'test.db');
  const first = await fixture(t, path);
  const { data: { token } } = await first.register();
  assert.equal((await first.request('/reservations', {
    method: 'POST', token, body: { courtId: 1, slotId: 1, date: futureDate() },
  })).status, 201);
  await first.close();
  const second = await fixture(t, path);
  assert.equal((await second.request('/me', { token })).status, 200);
  assert.equal((await second.request('/reservations', { token })).data.reservations.length, 1);
  assert.equal(second.db.prepare('SELECT COUNT(*) AS count FROM courts').get().count, 2);
  assert.equal(second.db.prepare('SELECT COUNT(*) AS count FROM time_slots').get().count, 14);
  await second.close();
});
