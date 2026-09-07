import { create } from 'zustand';

/**
 * Estado global de la aplicación.
 * La sala 3D y el panel lateral leen de aquí; `net.js` es el único que escribe
 * lo que llega del servidor.
 */
export const useStore = create((set, get) => ({
  // --- conexión / sesión -------------------------------------------------
  phase: 'lobby', // 'lobby' | 'room'
  connected: false,
  error: null,
  code: null,
  me: null, // { id, name, role: 'constelador' | 'consultante' }
  participants: {},

  // --- cuenta (opcional: se puede constelar sin registrarse) --------------
  user: null, // { id, email, name }
  myConstellations: [], // resúmenes de las constelaciones guardadas en la cuenta
  openConstellation: null, // { id, name } si la sala salió de una guardada

  // --- contenido de la constelación --------------------------------------
  figures: {},
  snapshots: [],
  chat: [],
  unreadChat: 0,

  // --- vista local (no se sincroniza salvo la cámara) --------------------
  selectedId: null,
  hoveredId: null,
  cameras: {}, // cámaras de los otros participantes
  viewMode: 'orbit', // 'orbit' | 'walk' | 'figure' | 'peer'
  viewTargetId: null, // id de figura o de participante según viewMode
  showNames: true,
  showGrid: true,
  placingRole: null, // rol elegido en la paleta, se coloca con el próximo clic en el piso
  panel: 'roles', // 'roles' | 'video' | 'chat' | 'sesion'
  videoOpen: false,

  set,
  get,

  // --- helpers -----------------------------------------------------------
  isFollowingPeer: () => get().viewMode === 'peer' && !!get().viewTargetId,
  figureList: () => Object.values(get().figures),
  peer: () => {
    const { participants, me } = get();
    return Object.values(participants).find((p) => p.id !== me?.id) ?? null;
  },
  selected: () => {
    const { figures, selectedId } = get();
    return selectedId ? figures[selectedId] ?? null : null;
  },

  // --- mutaciones locales ------------------------------------------------
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  setPanel: (panel) => set((s) => ({ panel, unreadChat: panel === 'chat' ? 0 : s.unreadChat })),
  setView: (viewMode, viewTargetId = null) => set({ viewMode, viewTargetId }),
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
  patchFigureLocal: (id, patch) =>
    set((s) => (s.figures[id] ? { figures: { ...s.figures, [id]: { ...s.figures[id], ...patch } } } : s)),
}));
