import express from 'express';
import { getStore } from './storage.js';
import { hashPassword, issueToken, publicUser, requireAuth, verifyPassword } from './auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FIGURES = 200;
const MAX_SNAPSHOTS = 40;
const MAX_CONSTELLATIONS = 300;

/** Sólo se guardan los campos que la sala entiende, y con tipos sanos. */
function cleanFigure(f) {
  if (!f || typeof f !== 'object') return null;
  const num = (v, alt = 0) => (Number.isFinite(Number(v)) ? Number(v) : alt);
  return {
    id: String(f.id ?? '').slice(0, 40),
    roleKey: String(f.roleKey ?? '').slice(0, 40),
    label: String(f.label ?? '').slice(0, 60),
    note: String(f.note ?? '').slice(0, 400),
    x: num(f.x),
    z: num(f.z),
    rotY: num(f.rotY),
    scale: Math.min(3, Math.max(0.3, num(f.scale, 1))),
    color: String(f.color ?? '#e0a458').slice(0, 24),
  };
}

const cleanFigures = (list) => (Array.isArray(list) ? list.map(cleanFigure).filter((f) => f && f.id && f.roleKey).slice(0, MAX_FIGURES) : []);

function cleanSnapshots(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-MAX_SNAPSHOTS).map((s) => ({
    id: String(s?.id ?? '').slice(0, 40),
    name: String(s?.name ?? 'Momento').slice(0, 60),
    createdAt: Number(s?.createdAt) || Date.now(),
    figures: cleanFigures(s?.figures),
  }));
}

// Freno simple a la fuerza bruta: 10 intentos fallidos por correo cada 15 min.
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.since > 1000 * 60 * 15) return false;
  return entry.count >= 10;
}
function noteFailure(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.since > 1000 * 60 * 15) attempts.set(key, { count: 1, since: now });
  else entry.count += 1;
}

/**
 * Rutas de cuentas y de constelaciones guardadas.
 * La sala en vivo sigue funcionando sin cuenta: esto sólo agrega el archivo
 * personal de cada persona.
 */
export function apiRouter() {
  const router = express.Router();
  const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // --- cuentas -------------------------------------------------------------

  router.post(
    '/auth/registro',
    asyncRoute(async (req, res) => {
      const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
      const password = String(req.body?.password ?? '');
      const name = String(req.body?.name ?? '').trim().slice(0, 60);

      if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Ese correo no parece válido.' });
      if (password.length < 8) return res.status(400).json({ ok: false, error: 'La contraseña necesita al menos 8 caracteres.' });
      if (!name) return res.status(400).json({ ok: false, error: 'Falta tu nombre.' });

      const store = await getStore();
      if (await store.findUserByEmail(email)) {
        return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese correo.' });
      }
      const user = await store.createUser({ email, name, passwordHash: await hashPassword(password) });
      res.json({ ok: true, token: await issueToken(user.id), user: publicUser(user) });
    }),
  );

  router.post(
    '/auth/ingreso',
    asyncRoute(async (req, res) => {
      const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
      const password = String(req.body?.password ?? '');

      if (tooManyAttempts(email)) {
        return res.status(429).json({ ok: false, error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
      }

      const store = await getStore();
      const user = await store.findUserByEmail(email);
      // El mismo mensaje para correo inexistente y contraseña incorrecta.
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        noteFailure(email);
        return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos.' });
      }
      attempts.delete(email);
      res.json({ ok: true, token: await issueToken(user.id), user: publicUser(user) });
    }),
  );

  router.get('/auth/yo', requireAuth, (req, res) => res.json({ ok: true, user: publicUser(req.user) }));

  router.patch(
    '/auth/yo',
    requireAuth,
    asyncRoute(async (req, res) => {
      const store = await getStore();
      const name = req.body?.name === undefined ? null : String(req.body.name).trim().slice(0, 60);
      const password = req.body?.password === undefined ? null : String(req.body.password);

      if (name !== null) {
        if (!name) return res.status(400).json({ ok: false, error: 'El nombre no puede quedar vacío.' });
        await store.updateUserName(req.user.id, name);
      }
      if (password !== null) {
        if (password.length < 8) return res.status(400).json({ ok: false, error: 'La contraseña necesita al menos 8 caracteres.' });
        if (!(await verifyPassword(String(req.body?.actual ?? ''), req.user.passwordHash))) {
          return res.status(401).json({ ok: false, error: 'La contraseña actual no coincide.' });
        }
        await store.updateUserPassword(req.user.id, await hashPassword(password));
      }
      res.json({ ok: true, user: publicUser(await store.findUserById(req.user.id)) });
    }),
  );

  // --- constelaciones guardadas -------------------------------------------

  router.get(
    '/constelaciones',
    requireAuth,
    asyncRoute(async (req, res) => {
      const store = await getStore();
      res.json({ ok: true, constelaciones: await store.listConstellations(req.user.id) });
    }),
  );

  router.post(
    '/constelaciones',
    requireAuth,
    asyncRoute(async (req, res) => {
      const store = await getStore();
      const mine = await store.listConstellations(req.user.id);
      if (mine.length >= MAX_CONSTELLATIONS) {
        return res.status(409).json({ ok: false, error: 'Llegaste al máximo de constelaciones guardadas. Borrá alguna para seguir.' });
      }
      const saved = await store.createConstellation({
        userId: req.user.id,
        name: String(req.body?.name ?? '').trim().slice(0, 80) || 'Constelación sin nombre',
        notes: String(req.body?.notes ?? '').slice(0, 4000),
        code: String(req.body?.code ?? '').slice(0, 12),
        figures: cleanFigures(req.body?.figures),
        snapshots: cleanSnapshots(req.body?.snapshots),
      });
      res.json({ ok: true, constelacion: saved });
    }),
  );

  router.get(
    '/constelaciones/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const store = await getStore();
      const found = await store.getConstellation(req.params.id, req.user.id);
      if (!found) return res.status(404).json({ ok: false, error: 'No encontramos esa constelación.' });
      res.json({ ok: true, constelacion: found });
    }),
  );

  router.patch(
    '/constelaciones/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const store = await getStore();
      const patch = {};
      if (req.body?.name !== undefined) patch.name = String(req.body.name).trim().slice(0, 80) || 'Constelación sin nombre';
      if (req.body?.notes !== undefined) patch.notes = String(req.body.notes).slice(0, 4000);
      if (req.body?.code !== undefined) patch.code = String(req.body.code).slice(0, 12);
      if (req.body?.figures !== undefined) patch.figures = cleanFigures(req.body.figures);
      if (req.body?.snapshots !== undefined) patch.snapshots = cleanSnapshots(req.body.snapshots);

      const updated = await store.updateConstellation(req.params.id, req.user.id, patch);
      if (!updated) return res.status(404).json({ ok: false, error: 'No encontramos esa constelación.' });
      res.json({ ok: true, constelacion: updated });
    }),
  );

  router.delete(
    '/constelaciones/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const store = await getStore();
      const done = await store.deleteConstellation(req.params.id, req.user.id);
      if (!done) return res.status(404).json({ ok: false, error: 'No encontramos esa constelación.' });
      res.json({ ok: true });
    }),
  );

  return router;
}

export { cleanFigures };
