import React, { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'miami-tennis-token';

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || 'Não foi possível concluir. Tente novamente.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function errorMessage(error) {
  return error instanceof TypeError
    ? 'Não foi possível conectar. Verifique se o servidor está rodando e tente novamente.'
    : error.message;
}

function today() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatDate(value, options = { day: '2-digit', month: 'short' }) {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`));
}

function TennisBall({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="currentColor" />
      <path d="M7 9c18 7 18 15 0 22M33 9c-18 7-18 15 0 22" stroke="var(--green)" strokeWidth="2" />
    </svg>
  );
}

function Brand() {
  return <div className="brand"><TennisBall className="brand-ball" /><span>miami<span className="brand-light">tennis</span><span className="brand-dot">.</span></span></div>;
}

function Auth({ onAuthenticated, initialMessage }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState(initialMessage || '');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api(mode === 'login' ? '/login' : '/register', {
        method: 'POST', body: JSON.stringify(fields),
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      onAuthenticated(result.client);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Brand />
        <div className="intro-copy">
          <span className="eyebrow">MAIS TÊNIS, MENOS COMPLICAÇÃO</span>
          <h1>Seu próximo jogo<br />começa aqui<span>.</span></h1>
          <p>Escolha a quadra, encontre um horário e faça sua reserva. Simples assim.</p>
        </div>
        <svg className="court-art" viewBox="0 0 480 270" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="476" height="266" rx="8" fill="#25564a" />
          <g stroke="#adc8b0" strokeWidth="2">
            <path d="M44 34h392v202H44zM44 62h392M44 208h392M148 62v146M332 62v146M148 135h184" />
            <path d="M240 16v238" strokeDasharray="5 5" />
          </g>
          <circle cx="349" cy="191" r="15" fill="#d4ed82" />
          <path d="M338 181q25 10 0 21M360 181q-25 10 0 21" stroke="#25564a" strokeWidth="1.5" />
        </svg>
        <div className="intro-footer"><span>DUAS QUADRAS. SEU HORÁRIO.</span><span>08h — 22h</span></div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-container">
          <span className="eyebrow muted">BEM-VINDO AO MIAMI TENNIS</span>
          <h2>{mode === 'login' ? 'Bora jogar?' : 'Crie sua conta.'}</h2>
          <p className="muted">{mode === 'login' ? 'Entre para ver os horários e reservar sua quadra.' : 'Um cadastro rápido para garantir seu lugar na quadra.'}</p>
          <div className="auth-tabs" aria-label="Acesso à conta">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')} disabled={busy}>Entrar</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')} disabled={busy}>Criar conta</button>
          </div>
          <form key={mode} onSubmit={submit}>
            {mode === 'register' && <label>Seu nome<input name="name" placeholder="Como podemos te chamar?" autoComplete="name" minLength={2} maxLength={80} required disabled={busy} /></label>}
            <label>E-mail<input type="email" name="email" placeholder="voce@exemplo.com" autoComplete="email" maxLength={254} required disabled={busy} /></label>
            <label>Senha<input type="password" name="password" placeholder={mode === 'register' ? 'Pelo menos 6 caracteres' : 'Sua senha'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 6 : 1} maxLength={128} required disabled={busy} /></label>
            {error && <p className="notice error" role="alert">{error}</p>}
            <button className="primary auth-submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar na minha conta' : 'Criar conta e começar'}<span aria-hidden="true">↗</span></button>
          </form>
          <p className="auth-note">Sua reserva em poucos cliques. A partida é com você.</p>
        </div>
      </section>
    </main>
  );
}

function ReservationDialog({ selection, court, slot, onClose, onConfirm, busy, error }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="reservation-dialog" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }} aria-labelledby="reservation-title">
      <div className="dialog-heading"><span className="eyebrow muted">QUASE NA QUADRA</span><button className="close-button" aria-label="Fechar" onClick={onClose} disabled={busy}>×</button></div>
      <h2 id="reservation-title">Confirmar reserva?</h2>
      <p className="muted">Confira o horário da sua próxima partida.</p>
      <dl className="reservation-details">
        <div><dt>Quadra</dt><dd>{court.name} · {court.surface}</dd></div>
        <div><dt>Data</dt><dd>{formatDate(selection.date, { weekday: 'long', day: '2-digit', month: 'long' })}</dd></div>
        <div><dt>Horário</dt><dd>{slot.start_time} — {slot.end_time} <span className="muted">(1 hora)</span></dd></div>
      </dl>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary" onClick={onClose} disabled={busy}>Voltar</button><button className="primary" onClick={onConfirm} disabled={busy}>{busy ? 'Reservando…' : 'Confirmar reserva'}</button></div>
    </dialog>
  );
}

function Dashboard({ client, onExpired, onLogout }) {
  const [weekDate, setWeekDate] = useState(today);
  const [courtId, setCourtId] = useState(1);
  const [data, setData] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      api(`/week?date=${weekDate}`, { signal: controller.signal }),
      api('/reservations', { signal: controller.signal }),
    ]).then(([week, mine]) => {
      setData(week);
      setReservations(mine.reservations);
    }).catch((error) => {
      if (error.name === 'AbortError') return;
      if (error.status === 401) onExpired();
      else setError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [weekDate, refresh, onExpired]);

  // Atualiza também quando o cliente volta à janela após algum tempo.
  useEffect(() => {
    const update = () => setRefresh((value) => value + 1);
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);

  async function reserve() {
    if (booking) return;
    setBooking(true);
    setBookingError('');
    try {
      await api('/reservations', { method: 'POST', body: JSON.stringify(selection) });
      setSelection(null);
      setSuccess('Reserva confirmada! Nos vemos na quadra.');
      setRefresh((value) => value + 1);
    } catch (error) {
      if (error.status === 401) onExpired();
      else {
        setBookingError(errorMessage(error));
        if (error.status === 409 || error.status === 400) setRefresh((value) => value + 1);
      }
    } finally {
      setBooking(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await api('/logout', { method: 'POST' });
      onLogout();
    } catch (error) {
      if (error.status === 401) onLogout();
      else setError(errorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  }

  function navigate(amount) {
    setSuccess('');
    setWeekDate(amount === 0 ? today() : addDays(weekDate, amount));
  }

  const court = data?.courts.find((court) => court.id === courtId);
  const cells = data?.availability.filter((cell) => cell.courtId === courtId) || [];
  const cellMap = new Map(cells.map((cell) => [`${cell.date}/${cell.slotId}`, cell]));
  const availableCount = cells.filter((cell) => cell.status === 'available').length;
  const reservedCount = cells.filter((cell) => cell.status === 'reserved').length;

  return (
    <div className="app-shell">
      <header className="app-header"><div className="header-inner"><Brand /><span className="header-label">RESERVA DE QUADRAS</span><div className="account"><span>{client.name}</span><button className="logout" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Saindo…' : 'Sair'}<span aria-hidden="true">↗</span></button></div></div></header>
      <main className="dashboard">
        <section className="welcome">
          <div><span className="eyebrow muted">BEM-VINDO, {client.name.split(' ')[0].toUpperCase()}</span><h1>Escolha seu próximo horário<span>.</span></h1><p className="muted">Uma quadra, uma hora e uma boa partida. Reserve pela agenda abaixo.</p></div>
          <div className="welcome-ball"><TennisBall /></div>
        </section>
        {success && <div className="notice success" role="status"><span>{success}</span><button aria-label="Fechar mensagem" onClick={() => setSuccess('')}>×</button></div>}
        {error && <div className="notice error" role="alert"><span>{error}</span><button className="text-button" onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button></div>}
        <section className="stats" aria-label="Resumo da agenda">
          <div><span>Horários disponíveis</span><strong>{loading || error ? '—' : availableCount}<span className="stat-dot available-dot" /></strong><small>na quadra e semana selecionadas</small></div>
          <div><span>Horários reservados</span><strong>{loading || error ? '—' : reservedCount}<span className="stat-dot reserved-dot" /></strong><small>na quadra e semana selecionadas</small></div>
          <div><span>Minhas próximas reservas</span><strong>{loading || error ? '—' : reservations.length}<span className="stat-dot mine-dot" /></strong><small>seus próximos jogos</small></div>
        </section>
        <section className="agenda-panel" aria-labelledby="agenda-title">
          <div className="agenda-top"><div><h2 id="agenda-title">Agenda da semana</h2><p className="muted">Clique em um horário disponível para reservar.</p></div><div className="week-controls"><button className="today-button" onClick={() => navigate(0)}>Hoje</button><button className="arrow-button" aria-label="Semana anterior" onClick={() => navigate(-7)}>←</button><span className="week-range">{loading ? 'Carregando…' : data ? `${formatDate(data.days[0])} — ${formatDate(data.days[6], { day: '2-digit', month: 'short', year: 'numeric' })}` : 'Agenda'}</span><button className="arrow-button" aria-label="Próxima semana" onClick={() => navigate(7)}>→</button></div></div>
          <div className="agenda-toolbar"><div className="court-tabs" aria-label="Selecionar quadra">{(data?.courts || [{ id: 1, name: 'Quadra 1', surface: 'Saibro' }, { id: 2, name: 'Quadra 2', surface: 'Piso rápido' }]).map((item) => <button key={item.id} aria-pressed={courtId === item.id} className={courtId === item.id ? 'active' : ''} onClick={() => setCourtId(item.id)}>{item.name}<span>{item.surface}</span></button>)}</div><div className="legend"><span><i className="available-dot" />Disponível</span><span><i className="reserved-dot" />Reservado</span><span><i className="mine-dot" />Sua reserva</span></div></div>
          {loading ? <div className="agenda-placeholder" role="status">Carregando horários…</div> : error ? <div className="agenda-placeholder">A agenda não pôde ser carregada. Tente novamente.</div> : data && <div className="table-scroll"><table className="week-table"><caption className="sr-only">Horários de {court?.name} de {formatDate(data.days[0])} a {formatDate(data.days[6])}. Horário de Brasília.</caption><thead><tr><th scope="col" className="time-heading">HORÁRIO</th>{data.days.map((day) => <th scope="col" key={day} className={day === data.today ? 'today-column' : ''}><span className="weekday">{formatDate(day, { weekday: 'short' }).replace('.', '')}</span><span className="day-number">{formatDate(day, { day: '2-digit', month: '2-digit' })}</span>{day === data.today && <span className="today-tag">HOJE</span>}</th>)}</tr></thead><tbody>{data.slots.map((slot) => <tr key={slot.id}><th scope="row" className="time-cell"><span>{slot.start_time}</span><small>{slot.end_time}</small></th>{data.days.map((day) => {
            const cell = cellMap.get(`${day}/${slot.id}`);
            const label = cell.status === 'available' ? 'Disponível' : cell.mine ? 'Sua reserva' : cell.status === 'reserved' ? 'Reservado' : 'Encerrado';
            return <td key={day}>{cell.status === 'available' ? <button className="slot available" aria-label={`Reservar ${court.name}, ${formatDate(day, { day: '2-digit', month: 'long' })}, ${slot.start_time} às ${slot.end_time}`} onClick={() => { setSuccess(''); setBookingError(''); setSelection({ courtId, slotId: slot.id, date: day }); }}><span className="slot-dot" />{label}<span className="slot-plus" aria-hidden="true">+</span></button> : <span className={`slot ${cell.mine ? 'mine' : cell.status}`}><span className="slot-dot" />{label}</span>}</td>;
          })}</tr>)}</tbody></table></div>}
          <div className="agenda-bottom"><span>Reservas de 1 hora · Todos os dias, das 08h às 22h</span><span>Horário de Brasília</span></div>
        </section>
        <section className="my-reservations" aria-labelledby="my-title"><div className="section-heading"><h2 id="my-title">Minhas próximas reservas</h2><span className="muted">Tudo pronto para jogar.</span></div>{loading ? <p className="empty-message">Carregando suas reservas…</p> : error ? <p className="empty-message">Suas reservas aparecerão aqui quando a conexão voltar.</p> : reservations.length === 0 ? <p className="empty-message">Você ainda não tem reservas. Escolha um horário na agenda para começar.</p> : <ul className="reservation-list">{reservations.map((reservation) => <li key={reservation.id}><div className="reservation-date"><strong>{formatDate(reservation.date, { day: '2-digit' })}</strong><span>{formatDate(reservation.date, { month: 'short' })}</span></div><div className="reservation-info"><strong>{reservation.court}</strong><span className="muted">{formatDate(reservation.date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · {reservation.start} — {reservation.end}</span></div><span className="confirmed-badge">Confirmada</span></li>)}</ul>}</section>
        <footer className="app-footer"><span>Miami Tennis</span><span>Menos cliques. Mais jogo.</span></footer>
      </main>
      {selection && <ReservationDialog selection={selection} court={data.courts.find((court) => court.id === selection.courtId)} slot={data.slots.find((slot) => slot.id === selection.slotId)} onClose={() => setSelection(null)} onConfirm={reserve} busy={booking} error={bookingError} />}
    </div>
  );
}

export default function App() {
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [message, setMessage] = useState('');
  const onLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setClient(null);
    setMessage('');
  }, []);
  const onExpired = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setClient(null);
    setMessage('Sua sessão expirou. Entre novamente.');
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    const controller = new AbortController();
    api('/me', { signal: controller.signal }).then(({ client }) => setClient(client)).catch((error) => {
      if (error.name === 'AbortError') return;
      if (error.status === 401) localStorage.removeItem(TOKEN_KEY);
      else setMessage(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) return <div className="loading-page"><Brand /><p>Preparando sua quadra…</p></div>;
  return client ? <Dashboard client={client} onExpired={onExpired} onLogout={onLogout} /> : <Auth onAuthenticated={setClient} initialMessage={message} />;
}
