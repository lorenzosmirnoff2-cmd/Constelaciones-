import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Capa de datos con dos implementaciones detrás de la misma interfaz:
 *
 *  - Postgres, si existe DATABASE_URL. Es la que hay que usar en producción:
 *    sobrevive a los reinicios y a los redespliegues.
 *  - Un archivo JSON, si no. Alcanza para desarrollo y para un servidor con
 *    disco propio, pero en un hosting de disco efímero (Render free) se pierde
 *    en cada reinicio.
 *
 * Todos los métodos son asíncronos para que las dos se usen igual.
 */

const newId = () => crypto.randomUUID();

// --- implementación en archivo ---------------------------------------------

function fileStore() {
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', '.data');
  const file = path.join(dir, 'constelaciones.json');
  let db = { meta: {}, users: [], constellations: [] };
  let writing = null;
  let dirty = false;

  // Escrituras serializadas: si llegan varias mientras se está grabando, se
  // colapsan en una sola pasada más al terminar.
  const flush = async () => {
    if (writing) {
      dirty = true;
      return writing;
    }
    writing = (async () => {
      do {
        dirty = false;
        await fsp.writeFile(file, JSON.stringify(db, null, 2), 'utf8');
      } while (dirty);
      writing = null;
    })();
    return writing;
  };

  return {
    kind: 'archivo',

    async init() {
      await fsp.mkdir(dir, { recursive: true });
      if (fs.existsSync(file)) {
        try {
          const raw = JSON.parse(await fsp.readFile(file, 'utf8'));
          db = { meta: {}, users: [], constellations: [], ...raw };
        } catch {
          // Archivo corrupto: lo conservamos aparte en vez de pisarlo.
          await fsp.rename(file, file + '.roto-' + Date.now());
        }
      }
      await flush();
    },

    async getMeta(key) {
      return db.meta[key] ?? null;
    },
    async setMeta(key, value) {
      db.meta[key] = value;
      await flush();
    },

    async findUserByEmail(email) {
      return db.users.find((u) => u.email === email) ?? null;
    },
    async findUserById(id) {
      return db.users.find((u) => u.id === id) ?? null;
    },
    async createUser({ email, name, passwordHash }) {
      const user = { id: newId(), email, name, passwordHash, createdAt: Date.now() };
      db.users.push(user);
      await flush();
      return user;
    },
    async updateUserName(id, name) {
      const u = db.users.find((x) => x.id === id);
      if (u) u.name = name;
      await flush();
      return u ?? null;
    },
    async updateUserPassword(id, passwordHash) {
      const u = db.users.find((x) => x.id === id);
      if (u) u.passwordHash = passwordHash;
      await flush();
      return u ?? null;
    },

    async listConstellations(userId) {
      return db.constellations
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((c) => ({
          id: c.id,
          userId: c.userId,
          name: c.name,
          notes: c.notes ?? '',
          code: c.code ?? '',
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          figuras: (c.figures ?? []).length,
          momentos: (c.snapshots ?? []).length,
        }));
    },
    async getConstellation(id, userId) {
      return db.constellations.find((c) => c.id === id && c.userId === userId) ?? null;
    },
    async createConstellation(row) {
      const saved = { ...row, id: newId(), createdAt: Date.now(), updatedAt: Date.now() };
      db.constellations.push(saved);
      await flush();
      return saved;
    },
    async updateConstellation(id, userId, patch) {
      const c = db.constellations.find((x) => x.id === id && x.userId === userId);
      if (!c) return null;
      Object.assign(c, patch, { updatedAt: Date.now() });
      await flush();
      return c;
    },
    async deleteConstellation(id, userId) {
      const i = db.constellations.findIndex((c) => c.id === id && c.userId === userId);
      if (i === -1) return false;
      db.constellations.splice(i, 1);
      await flush();
      return true;
    },
  };
}

// --- implementación en Postgres --------------------------------------------

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value text NOT NULL)',
  `CREATE TABLE IF NOT EXISTS users (
     id text PRIMARY KEY,
     email text UNIQUE NOT NULL,
     name text NOT NULL,
     password_hash text NOT NULL,
     created_at bigint NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS constellations (
     id text PRIMARY KEY,
     user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name text NOT NULL,
     notes text NOT NULL DEFAULT '',
     code text NOT NULL DEFAULT '',
     figures jsonb NOT NULL DEFAULT '[]'::jsonb,
     snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
     created_at bigint NOT NULL,
     updated_at bigint NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS constellations_user_idx ON constellations (user_id, updated_at DESC)',
];

async function pgStore(url) {
  const { default: pg } = await import('pg');
  // Los Postgres gestionados (Neon, Supabase, Render) exigen TLS y no siempre
  // publican una cadena de certificados que Node reconozca de fábrica.
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  const toUser = (r) =>
    r ? { id: r.id, email: r.email, name: r.name, passwordHash: r.password_hash, createdAt: Number(r.created_at) } : null;

  const toConstellation = (r) =>
    r
      ? {
          id: r.id,
          userId: r.user_id,
          name: r.name,
          notes: r.notes ?? '',
          code: r.code ?? '',
          figures: r.figures ?? [],
          snapshots: r.snapshots ?? [],
          createdAt: Number(r.created_at),
          updatedAt: Number(r.updated_at),
        }
      : null;

  const store = {
    kind: 'postgres',

    async init() {
      for (const sql of SCHEMA) await pool.query(sql);
    },

    async getMeta(key) {
      const { rows } = await pool.query('SELECT value FROM meta WHERE key = $1', [key]);
      return rows[0]?.value ?? null;
    },
    async setMeta(key, value) {
      await pool.query(
        'INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, value],
      );
    },

    async findUserByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return toUser(rows[0]);
    },
    async findUserById(id) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return toUser(rows[0]);
    },
    async createUser({ email, name, passwordHash }) {
      const user = { id: newId(), email, name, passwordHash, createdAt: Date.now() };
      await pool.query('INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [
        user.id,
        user.email,
        user.name,
        user.passwordHash,
        user.createdAt,
      ]);
      return user;
    },
    async updateUserName(id, name) {
      await pool.query('UPDATE users SET name = $2 WHERE id = $1', [id, name]);
      return store.findUserById(id);
    },
    async updateUserPassword(id, passwordHash) {
      await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
      return store.findUserById(id);
    },

    async listConstellations(userId) {
      const { rows } = await pool.query(
        `SELECT id, user_id, name, notes, code, created_at, updated_at,
                jsonb_array_length(figures) AS figuras,
                jsonb_array_length(snapshots) AS momentos
           FROM constellations WHERE user_id = $1 ORDER BY updated_at DESC`,
        [userId],
      );
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        notes: r.notes ?? '',
        code: r.code ?? '',
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at),
        figuras: Number(r.figuras),
        momentos: Number(r.momentos),
      }));
    },
    async getConstellation(id, userId) {
      const { rows } = await pool.query('SELECT * FROM constellations WHERE id = $1 AND user_id = $2', [id, userId]);
      return toConstellation(rows[0]);
    },
    async createConstellation(row) {
      const now = Date.now();
      const { rows } = await pool.query(
        `INSERT INTO constellations (id, user_id, name, notes, code, figures, snapshots, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $8) RETURNING *`,
        [
          newId(),
          row.userId,
          row.name,
          row.notes ?? '',
          row.code ?? '',
          JSON.stringify(row.figures ?? []),
          JSON.stringify(row.snapshots ?? []),
          now,
        ],
      );
      return toConstellation(rows[0]);
    },
    async updateConstellation(id, userId, patch) {
      const current = await store.getConstellation(id, userId);
      if (!current) return null;
      const next = { ...current, ...patch };
      const { rows } = await pool.query(
        `UPDATE constellations
            SET name = $3, notes = $4, code = $5, figures = $6::jsonb, snapshots = $7::jsonb, updated_at = $8
          WHERE id = $1 AND user_id = $2 RETURNING *`,
        [
          id,
          userId,
          next.name,
          next.notes ?? '',
          next.code ?? '',
          JSON.stringify(next.figures ?? []),
          JSON.stringify(next.snapshots ?? []),
          Date.now(),
        ],
      );
      return toConstellation(rows[0]);
    },
    async deleteConstellation(id, userId) {
      const { rowCount } = await pool.query('DELETE FROM constellations WHERE id = $1 AND user_id = $2', [id, userId]);
      return rowCount > 0;
    },
  };

  return store;
}

let storePromise = null;

/**
 * Abre el almacén una sola vez. Si falla no se cachea el fallo: el próximo
 * pedido vuelve a intentarlo, así una base que tardó en levantar no deja al
 * servidor sin cuentas hasta el siguiente reinicio.
 */
export function getStore() {
  storePromise ??= (async () => {
    const s = process.env.DATABASE_URL ? await pgStore(process.env.DATABASE_URL) : fileStore();
    await s.init();
    console.log('[constelaciones] cuentas guardadas en: ' + s.kind);
    return s;
  })().catch((err) => {
    storePromise = null;
    throw err;
  });
  return storePromise;
}
