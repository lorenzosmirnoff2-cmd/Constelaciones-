import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { getStore } from './storage.js';

const scrypt = promisify(crypto.scrypt);

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

// --- contraseñas ------------------------------------------------------------

/** Devuelve "scrypt$<sal>$<hash>". Nunca se guarda la contraseña en claro. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

export async function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// --- tokens -----------------------------------------------------------------

// La clave de firma se guarda junto a los datos: así las sesiones iniciadas
// siguen valiendo después de un reinicio del servidor. AUTH_SECRET la fija a
// mano si se prefiere.
let secretPromise = null;
function getSecret() {
  secretPromise ??= (async () => {
    if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
    const store = await getStore();
    let secret = await store.getMeta('authSecret');
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      await store.setMeta('authSecret', secret);
    }
    return secret;
  })();
  return secretPromise;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');

async function sign(payloadB64) {
  return crypto.createHmac('sha256', await getSecret()).update(payloadB64).digest('base64url');
}

export async function issueToken(userId) {
  const payload = b64(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  return payload + '.' + (await sign(payload));
}

export async function readToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(await sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// --- middleware -------------------------------------------------------------

/** Usuario público: nunca sale el hash de la contraseña. */
export const publicUser = (u) => (u ? { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt } : null);

export async function userFromRequest(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const data = token && (await readToken(token));
  if (!data) return null;
  const store = await getStore();
  return store.findUserById(data.uid);
}

export async function requireAuth(req, res, next) {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Necesitás iniciar sesión.' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
