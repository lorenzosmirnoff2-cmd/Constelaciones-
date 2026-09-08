import { io } from 'socket.io-client';
import { useStore } from './store.js';

// En desarrollo Vite hace de proxy de /socket.io hacia el servidor de sesiones,
// así que el mismo origen sirve para dev y para producción.
export const socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

const st = () => useStore.getState();

socket.on('connect', () => useStore.setState({ connected: true }));
socket.on('disconnect', () => useStore.setState({ connected: false }));

socket.on('participant:joined', (p) =>
  useStore.setState((s) => ({ participants: { ...s.participants, [p.id]: p } })),
);
socket.on('participant:updated', (p) =>
  useStore.setState((s) => ({ participants: { ...s.participants, [p.id]: p } })),
);
socket.on('participant:left', ({ id }) =>
  useStore.setState((s) => {
    const participants = { ...s.participants };
    delete participants[id];
    const cameras = { ...s.cameras };
    delete cameras[id];
    // Si estábamos viendo su perspectiva, volvemos a la vista propia.
    const leavingView = s.viewMode === 'peer' && s.viewTargetId === id;
    return {
      participants,
      cameras,
      viewMode: leavingView ? 'orbit' : s.viewMode,
      viewTargetId: leavingView ? null : s.viewTargetId,
    };
  }),
);

socket.on('figure:added', (figure) =>
  useStore.setState((s) => ({ figures: { ...s.figures, [figure.id]: figure } })),
);
socket.on('figure:updated', ({ id, patch }) =>
  useStore.setState((s) =>
    s.figures[id] ? { figures: { ...s.figures, [id]: { ...s.figures[id], ...patch } } } : s,
  ),
);
socket.on('figure:removed', ({ id }) =>
  useStore.setState((s) => {
    const figures = { ...s.figures };
    delete figures[id];
    return { figures, selectedId: s.selectedId === id ? null : s.selectedId };
  }),
);
socket.on('session:cleared', () => useStore.setState({ figures: {}, selectedId: null }));
socket.on('session:replaced', ({ figures }) => useStore.setState({ figures, selectedId: null }));
socket.on('snapshot:list', (snapshots) => useStore.setState({ snapshots }));

socket.on('camera:updated', ({ id, cam }) =>
  useStore.setState((s) => ({ cameras: { ...s.cameras, [id]: cam } })),
);

socket.on('chat:message', (msg) =>
  useStore.setState((s) => ({
    chat: [...s.chat, msg].slice(-200),
    unreadChat: s.panel === 'chat' || msg.from === s.me?.id ? s.unreadChat : s.unreadChat + 1,
  })),
);

function applySession(res) {
  if (!res?.ok) return res;
  const { state, me, selfId } = res;
  useStore.setState({
    phase: 'room',
    error: null,
    openConstellation: null, // la sala arranca sin archivo asociado
    code: state.code,
    me: { ...me, id: selfId },
    participants: state.participants,
    figures: state.figures,
    cameras: state.cameras,
    snapshots: state.snapshots ?? [],
  });
  return res;
}

/**
 * Deja la sala y vuelve al menú principal. Se corta la conexión para que la
 * otra persona vea que nos fuimos, y se abre una nueva para poder entrar a otra
 * sesión sin recargar la página. La constelación queda en el servidor: quien
 * siga adentro la conserva, y con el mismo código se puede volver a entrar.
 */
export function leaveSession() {
  socket.disconnect();
  useStore.setState({
    phase: 'lobby',
    error: null,
    code: null,
    me: null,
    participants: {},
    figures: {},
    snapshots: [],
    chat: [],
    unreadChat: 0,
    cameras: {},
    selectedId: null,
    hoveredId: null,
    viewMode: 'orbit',
    viewTargetId: null,
    placingRole: null,
    openConstellation: null,
    panel: 'roles',
  });
  // Si entramos por un enlace con código, lo sacamos de la barra de direcciones
  // para que "volver a entrar" no vuelva a la misma sala sin querer.
  if (new URLSearchParams(location.search).has('codigo')) {
    history.replaceState(null, '', location.pathname);
  }
  socket.connect();
}

export function createSession(name) {
  return new Promise((resolve) => socket.emit('session:create', { name }, (r) => resolve(applySession(r))));
}

export function joinSession(code, name) {
  return new Promise((resolve) =>
    socket.emit('session:join', { code, name }, (r) => {
      if (!r?.ok) useStore.setState({ error: r?.error ?? 'No se pudo entrar a la sesión.' });
      resolve(applySession(r));
    }),
  );
}

export function addFigure(figure) {
  return new Promise((resolve) => socket.emit('figure:add', figure, resolve));
}

// Durante un arrastre se emite como mucho cada 45 ms; al soltar se manda el valor final.
const lastSent = new Map();
export function updateFigure(id, patch, { immediate = false } = {}) {
  st().patchFigureLocal(id, patch);
  const now = performance.now();
  if (!immediate && now - (lastSent.get(id) ?? 0) < 45) return;
  lastSent.set(id, now);
  socket.emit('figure:update', { id, patch });
}

/** Estado completo de la sala, con las figuras de cada momento, para archivarlo. */
export function exportSession() {
  return new Promise((resolve) => socket.emit('session:export', null, resolve));
}

/** Trae una constelación guardada a la sala. La ven los dos participantes. */
export function loadSession({ figures, snapshots }) {
  return new Promise((resolve) => socket.emit('session:load', { figures, snapshots }, resolve));
}

export const removeFigure = (id) => socket.emit('figure:remove', { id });
export const clearRoom = () => socket.emit('session:clear');
export const saveSnapshot = (name) => socket.emit('snapshot:save', { name });
export const restoreSnapshot = (id) => socket.emit('snapshot:restore', { id });
export const sendChat = (text) => socket.emit('chat:send', { text });
export const setFollowing = (following) => socket.emit('participant:following', { following });

let lastCam = 0;
export function sendCamera(cam) {
  const now = performance.now();
  if (now - lastCam < 90) return;
  lastCam = now;
  socket.emit('camera:update', cam);
}
