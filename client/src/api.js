import { useStore } from './store.js';

const TOKEN_KEY = 'cf.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

/**
 * Llamadas a la API de cuentas. Todas devuelven el JSON del servidor; si algo
 * falla llega `{ ok: false, error }` con un mensaje ya escrito para mostrar.
 */
async function call(path, { method = 'GET', body } = {}) {
  const token = getToken();
  try {
    const res = await fetch('/api' + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) logout();
    if (!res.ok) return { ok: false, error: data.error ?? 'No se pudo completar la operación.' };
    return data;
  } catch {
    return { ok: false, error: 'No hay conexión con el servidor.' };
  }
}

function adopt(res) {
  if (res?.ok && res.token) {
    setToken(res.token);
    useStore.setState({ user: res.user });
  }
  return res;
}

export const register = (email, password, name) => call('/auth/registro', { method: 'POST', body: { email, password, name } }).then(adopt);
export const login = (email, password) => call('/auth/ingreso', { method: 'POST', body: { email, password } }).then(adopt);

export function logout() {
  setToken(null);
  useStore.setState({ user: null, myConstellations: [] });
}

/** Al abrir la app: si hay un token guardado, se recupera la cuenta. */
export async function restoreSession() {
  if (!getToken()) return null;
  const res = await call('/auth/yo');
  if (res?.ok) useStore.setState({ user: res.user });
  return res?.ok ? res.user : null;
}

export const updateAccount = (patch) =>
  call('/auth/yo', { method: 'PATCH', body: patch }).then((r) => {
    if (r?.ok) useStore.setState({ user: r.user });
    return r;
  });

// --- constelaciones guardadas ----------------------------------------------

export async function loadMyConstellations() {
  const res = await call('/constelaciones');
  if (res?.ok) useStore.setState({ myConstellations: res.constelaciones });
  return res;
}

export const saveConstellation = (payload) =>
  call('/constelaciones', { method: 'POST', body: payload }).then((r) => {
    if (r?.ok) loadMyConstellations();
    return r;
  });

export const overwriteConstellation = (id, payload) =>
  call('/constelaciones/' + id, { method: 'PATCH', body: payload }).then((r) => {
    if (r?.ok) loadMyConstellations();
    return r;
  });

export const fetchConstellation = (id) => call('/constelaciones/' + id);

export const deleteConstellation = (id) =>
  call('/constelaciones/' + id, { method: 'DELETE' }).then((r) => {
    if (r?.ok) loadMyConstellations();
    return r;
  });
