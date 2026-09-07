import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { customAlphabet } from 'nanoid';
import { apiRouter, cleanFigures } from './api.js';
import { getStore } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
// Sin caracteres ambiguos (0/O, 1/I) para que el codigo se pueda dictar por telefono.
const newCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const newId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 h sin actividad -> se descarta

/** Sesiones vivas en memoria, indexadas por código. */
const sessions = new Map();

function createSession() {
  let code = newCode();
  while (sessions.has(code)) code = newCode();
  const session = {
    code,
    createdAt: Date.now(),
    touchedAt: Date.now(),
    figures: new Map(),
    participants: new Map(),
    cameras: new Map(),
    snapshots: [],
    log: [],
  };
  sessions.set(code, session);
  return session;
}

function serialize(session) {
  return {
    code: session.code,
    createdAt: session.createdAt,
    figures: Object.fromEntries(session.figures),
    participants: Object.fromEntries(session.participants),
    cameras: Object.fromEntries(session.cameras),
    snapshots: session.snapshots.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
  };
}

function touch(session) {
  session.touchedAt = Date.now();
}

setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions) {
    if (s.participants.size === 0 && now - s.touchedAt > SESSION_TTL_MS) sessions.delete(code);
  }
}, 1000 * 60 * 10).unref();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
// Una constelación guardada lleva las figuras de cada momento: el límite de
// 100 kB que trae Express por defecto se queda corto en sesiones largas.
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sessions: sessions.size, uptime: process.uptime() });
});

/**
 * Servidores ICE para la videollamada. Con STUN solo alcanza en la mayoría de
 * las redes domésticas, pero detrás de un NAT simétrico (móviles, oficinas) la
 * llamada no conecta: para esos casos hace falta un TURN, que se configura por
 * variables de entorno sin tocar el código.
 */
app.get('/api/ice', (_req, res) => {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map((u) => u.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    });
  }
  res.json({ iceServers });
});

app.get('/api/session/:code', (req, res) => {
  const session = sessions.get(String(req.params.code).toUpperCase());
  if (!session) return res.status(404).json({ ok: false, error: 'Sesión no encontrada' });
  res.json({ ok: true, code: session.code, participants: session.participants.size });
});

// Cuentas y constelaciones guardadas.
app.use('/api', apiRouter());

app.use('/api', (err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'La constelación es demasiado grande para guardarla.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'No se entendió el pedido.' });
  }
  console.error('[constelaciones] error de API:', err);
  res.status(500).json({ ok: false, error: 'Algo falló del lado del servidor.' });
});

// En producción sirve el build del cliente desde el mismo origen.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

function sessionOf(socket) {
  const code = socket.data.code;
  return code ? sessions.get(code) : null;
}

function pushLog(session, entry) {
  session.log.push({ ...entry, at: Date.now() });
  if (session.log.length > 500) session.log.shift();
}

io.on('connection', (socket) => {
  socket.data.code = null;

  const joinRoom = (session, { name, role }) => {
    socket.data.code = session.code;
    const participant = {
      id: socket.id,
      name: name?.trim() || (role === 'constelador' ? 'Constelador' : 'Consultante'),
      role,
      joinedAt: Date.now(),
      following: null,
    };
    session.participants.set(socket.id, participant);
    socket.join(session.code);
    touch(session);
    socket.to(session.code).emit('participant:joined', participant);
    return participant;
  };

  socket.on('session:create', ({ name } = {}, ack) => {
    const session = createSession();
    const me = joinRoom(session, { name, role: 'constelador' });
    pushLog(session, { type: 'create', by: me.name });
    ack?.({ ok: true, selfId: socket.id, me, state: serialize(session) });
  });

  socket.on('session:join', ({ code, name } = {}, ack) => {
    const session = sessions.get(String(code || '').trim().toUpperCase());
    if (!session) {
      return ack?.({ ok: false, error: 'Ese código no corresponde a ninguna sesión activa.' });
    }
    const me = joinRoom(session, { name, role: 'consultante' });
    pushLog(session, { type: 'join', by: me.name });
    ack?.({ ok: true, selfId: socket.id, me, state: serialize(session) });
  });

  socket.on('session:state', (_p, ack) => {
    const session = sessionOf(socket);
    ack?.(session ? { ok: true, state: serialize(session) } : { ok: false });
  });

  socket.on('figure:add', (figure, ack) => {
    const session = sessionOf(socket);
    if (!session) return ack?.({ ok: false });
    const id = figure.id || newId();
    const stored = {
      id,
      roleKey: figure.roleKey,
      label: figure.label ?? '',
      note: figure.note ?? '',
      x: Number(figure.x) || 0,
      z: Number(figure.z) || 0,
      rotY: Number(figure.rotY) || 0,
      scale: Number(figure.scale) || 1,
      color: figure.color ?? '#e0a458',
      createdBy: socket.id,
      createdAt: Date.now(),
    };
    session.figures.set(id, stored);
    touch(session);
    io.to(session.code).emit('figure:added', stored);
    pushLog(session, { type: 'add', by: socket.id, roleKey: stored.roleKey });
    ack?.({ ok: true, figure: stored });
  });

  // Movimiento/rotación: last-write-wins, se reemite a los demás sin eco al emisor.
  socket.on('figure:update', ({ id, patch } = {}) => {
    const session = sessionOf(socket);
    if (!session) return;
    const current = session.figures.get(id);
    if (!current) return;
    const next = { ...current, ...patch, id: current.id, updatedBy: socket.id, updatedAt: Date.now() };
    session.figures.set(id, next);
    touch(session);
    socket.to(session.code).emit('figure:updated', { id, patch: { ...patch, updatedBy: socket.id } });
  });

  socket.on('figure:remove', ({ id } = {}) => {
    const session = sessionOf(socket);
    if (!session || !session.figures.has(id)) return;
    session.figures.delete(id);
    touch(session);
    io.to(session.code).emit('figure:removed', { id });
    pushLog(session, { type: 'remove', by: socket.id, id });
  });

  socket.on('session:clear', () => {
    const session = sessionOf(socket);
    if (!session) return;
    session.figures.clear();
    touch(session);
    io.to(session.code).emit('session:cleared');
    pushLog(session, { type: 'clear', by: socket.id });
  });

  // Cámara de cada participante: permite "ver la perspectiva del otro".
  socket.on('camera:update', (cam) => {
    const session = sessionOf(socket);
    if (!session) return;
    session.cameras.set(socket.id, cam);
    socket.to(session.code).emit('camera:updated', { id: socket.id, cam });
  });

  socket.on('participant:following', ({ following } = {}) => {
    const session = sessionOf(socket);
    if (!session) return;
    const p = session.participants.get(socket.id);
    if (!p) return;
    p.following = following ?? null;
    io.to(session.code).emit('participant:updated', p);
  });

  // Instantáneas de la constelación (antes / después de un movimiento).
  socket.on('snapshot:save', ({ name } = {}, ack) => {
    const session = sessionOf(socket);
    if (!session) return ack?.({ ok: false });
    const snap = {
      id: newId(),
      name: name?.trim() || `Momento ${session.snapshots.length + 1}`,
      createdAt: Date.now(),
      figures: Array.from(session.figures.values()).map((f) => ({ ...f })),
    };
    session.snapshots.push(snap);
    if (session.snapshots.length > 30) session.snapshots.shift();
    touch(session);
    io.to(session.code).emit(
      'snapshot:list',
      session.snapshots.map(({ id, name: n, createdAt }) => ({ id, name: n, createdAt })),
    );
    ack?.({ ok: true, id: snap.id });
  });

  socket.on('snapshot:restore', ({ id } = {}) => {
    const session = sessionOf(socket);
    if (!session) return;
    const snap = session.snapshots.find((s) => s.id === id);
    if (!snap) return;
    session.figures = new Map(snap.figures.map((f) => [f.id, { ...f }]));
    touch(session);
    io.to(session.code).emit('session:replaced', { figures: Object.fromEntries(session.figures) });
  });

  // Estado completo (con las figuras de cada momento) para guardarlo en una cuenta.
  socket.on('session:export', (_p, ack) => {
    const session = sessionOf(socket);
    if (!session) return ack?.({ ok: false });
    ack?.({
      ok: true,
      code: session.code,
      figures: Array.from(session.figures.values()).map((f) => ({ ...f })),
      snapshots: session.snapshots.map((s) => ({ ...s, figures: s.figures.map((f) => ({ ...f })) })),
    });
  });

  // Traer una constelación guardada a la sala: la ven los dos al instante.
  socket.on('session:load', ({ figures, snapshots } = {}, ack) => {
    const session = sessionOf(socket);
    if (!session) return ack?.({ ok: false });
    const clean = cleanFigures(figures).map((f) => ({ ...f, id: f.id || newId(), createdBy: socket.id, createdAt: Date.now() }));
    session.figures = new Map(clean.map((f) => [f.id, f]));
    if (Array.isArray(snapshots)) {
      session.snapshots = snapshots.slice(-30).map((s) => ({
        id: s.id || newId(),
        name: String(s.name ?? 'Momento').slice(0, 60),
        createdAt: Number(s.createdAt) || Date.now(),
        figures: cleanFigures(s.figures),
      }));
    }
    touch(session);
    io.to(session.code).emit('session:replaced', { figures: Object.fromEntries(session.figures) });
    io.to(session.code).emit(
      'snapshot:list',
      session.snapshots.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
    );
    pushLog(session, { type: 'load', by: socket.id });
    ack?.({ ok: true });
  });

  // Señalización WebRTC para la videollamada 1 a 1.
  socket.on('rtc:signal', ({ to, data } = {}) => {
    if (!to) return;
    io.to(to).emit('rtc:signal', { from: socket.id, data });
  });

  socket.on('rtc:ready', () => {
    const session = sessionOf(socket);
    if (!session) return;
    socket.to(session.code).emit('rtc:ready', { from: socket.id });
  });

  socket.on('chat:send', ({ text } = {}) => {
    const session = sessionOf(socket);
    if (!session || !text?.trim()) return;
    const p = session.participants.get(socket.id);
    io.to(session.code).emit('chat:message', {
      id: newId(),
      from: socket.id,
      name: p?.name ?? '—',
      text: String(text).slice(0, 800),
      at: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    const session = sessionOf(socket);
    if (!session) return;
    session.participants.delete(socket.id);
    session.cameras.delete(socket.id);
    touch(session);
    socket.to(session.code).emit('participant:left', { id: socket.id });
  });
});

// Deja lista la base (o el archivo) antes de aceptar visitas, así un problema de
// configuración se ve en el arranque y no en el primer registro.
getStore()
  .catch((err) => console.error('[constelaciones] no se pudo abrir el almacén de cuentas:', err))
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`[constelaciones] servidor escuchando en http://localhost:${PORT}`);
    });
  });
