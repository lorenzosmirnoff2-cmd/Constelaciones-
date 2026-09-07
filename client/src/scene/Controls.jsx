import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { sendCamera, updateFigure, removeFigure } from '../net.js';
import { ROOM_RADIUS, WALL_HEIGHT } from './Room.jsx';

const EYE = 1.65;
const MIN_Y = 0.5;
const MAX_Y = 13; // se puede sobrevolar la sala para leer la constelación desde arriba

/**
 * Estado de cámara compartido entre el rig y las capas de interacción.
 * Vive fuera de React para poder actualizarse a 60 fps sin re-renderizar.
 */
export const viewState = {
  yaw: 0, // desde +Z mirando hacia el centro de la sala
  pitch: -0.42,
  pos: new THREE.Vector3(0, 4.4, 8.3),
  looking: false,
  lastX: 0,
  lastY: 0,
  draggingFigure: false,
  moved: 0,
};

/** Lo llama la capa de interacción cuando el puntero baja sobre algo que no es una figura. */
export function beginLook(event) {
  if (viewState.draggingFigure) return;
  viewState.looking = true;
  viewState.moved = 0;
  viewState.lastX = event.clientX ?? 0;
  viewState.lastY = event.clientY ?? 0;
}

const keys = new Set();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const remotePos = new THREE.Vector3();
const remoteQuat = new THREE.Quaternion();

export function CameraRig() {
  const { camera, gl } = useThree();
  const viewMode = useStore((s) => s.viewMode);
  const viewTargetId = useStore((s) => s.viewTargetId);
  const savedPose = useRef(null);

  // --- teclado ------------------------------------------------------------
  useEffect(() => {
    const isTyping = (t) => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    const down = (e) => {
      if (isTyping(e.target)) return;
      keys.add(e.code);
      const { selectedId, figures } = useStore.getState();
      if (e.code === 'Escape') useStore.setState({ selectedId: null });
      if (!selectedId || !figures[selectedId]) return;
      const step = e.shiftKey ? Math.PI / 36 : Math.PI / 12; // 5° o 15°
      if (e.code === 'KeyQ') updateFigure(selectedId, { rotY: figures[selectedId].rotY - step }, { immediate: true });
      if (e.code === 'KeyE') updateFigure(selectedId, { rotY: figures[selectedId].rotY + step }, { immediate: true });
      if (e.code === 'Delete' || e.code === 'Backspace') removeFigure(selectedId);
    };
    const up = (e) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      keys.clear();
    };
  }, []);

  // --- mirar arrastrando --------------------------------------------------
  useEffect(() => {
    const move = (e) => {
      if (!viewState.looking) return;
      const dx = e.clientX - viewState.lastX;
      const dy = e.clientY - viewState.lastY;
      viewState.lastX = e.clientX;
      viewState.lastY = e.clientY;
      viewState.moved += Math.abs(dx) + Math.abs(dy);
      viewState.yaw -= dx * 0.0042;
      viewState.pitch = THREE.MathUtils.clamp(viewState.pitch - dy * 0.0042, -1.35, 1.35);
    };
    const up = () => {
      viewState.looking = false;
    };
    const wheel = (e) => {
      if (useStore.getState().viewMode === 'peer') return;
      tmpEuler.set(viewState.pitch, viewState.yaw, 0);
      tmpForward.set(0, 0, -1).applyEuler(tmpEuler).multiplyScalar(-e.deltaY * 0.0035);
      viewState.pos.add(tmpForward);
      clampPos();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    gl.domElement.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      gl.domElement.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  // --- entrar / salir de las vistas especiales ----------------------------
  useEffect(() => {
    if (viewMode === 'figure') {
      const fig = useStore.getState().figures[viewTargetId];
      if (fig) {
        if (!savedPose.current) savedPose.current = { pos: viewState.pos.clone(), yaw: viewState.yaw, pitch: viewState.pitch };
        viewState.yaw = fig.rotY + Math.PI; // la cámara mira hacia -Z local, la figura hacia +Z
        viewState.pitch = 0;
        viewState.pos.set(fig.x, EYE * (fig.scale || 1), fig.z);
      }
    } else if (viewMode === 'peer') {
      if (!savedPose.current) savedPose.current = { pos: viewState.pos.clone(), yaw: viewState.yaw, pitch: viewState.pitch };
    } else if (savedPose.current) {
      viewState.pos.copy(savedPose.current.pos);
      viewState.yaw = savedPose.current.yaw;
      viewState.pitch = savedPose.current.pitch;
      savedPose.current = null;
    }
  }, [viewMode, viewTargetId]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const { viewMode: mode, viewTargetId: targetId, cameras, figures } = useStore.getState();

    if (mode === 'peer') {
      const cam = cameras[targetId];
      if (cam?.p) {
        remotePos.fromArray(cam.p);
        remoteQuat.fromArray(cam.q);
        camera.position.lerp(remotePos, 1 - Math.pow(0.0001, delta));
        camera.quaternion.slerp(remoteQuat, 1 - Math.pow(0.0001, delta));
      }
      return; // en modo espejo no se emite cámara propia
    }

    if (mode === 'figure') {
      const fig = figures[targetId];
      if (fig) viewState.pos.set(fig.x, EYE * (fig.scale || 1), fig.z);
    } else {
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.5 : 3.6) * delta;
      tmpEuler.set(0, viewState.yaw, 0);
      tmpForward.set(0, 0, -1).applyEuler(tmpEuler);
      tmpRight.set(1, 0, 0).applyEuler(tmpEuler);
      let moved = false;
      if (keys.has('KeyW') || keys.has('ArrowUp')) (viewState.pos.addScaledVector(tmpForward, speed), (moved = true));
      if (keys.has('KeyS') || keys.has('ArrowDown')) (viewState.pos.addScaledVector(tmpForward, -speed), (moved = true));
      if (keys.has('KeyA') || keys.has('ArrowLeft')) (viewState.pos.addScaledVector(tmpRight, -speed), (moved = true));
      if (keys.has('KeyD') || keys.has('ArrowRight')) (viewState.pos.addScaledVector(tmpRight, speed), (moved = true));
      if (keys.has('Space')) (viewState.pos.y += speed, (moved = true));
      if (keys.has('KeyZ') || keys.has('ControlLeft')) (viewState.pos.y -= speed, (moved = true));
      if (moved) clampPos();
    }

    camera.position.copy(viewState.pos);
    tmpEuler.set(viewState.pitch, viewState.yaw, 0);
    tmpQuat.setFromEuler(tmpEuler);
    camera.quaternion.copy(tmpQuat);

    sendCamera({ p: camera.position.toArray(), q: camera.quaternion.toArray() });
  });

  return null;
}

function clampPos() {
  const p = viewState.pos;
  const r = Math.hypot(p.x, p.z);
  const limit = ROOM_RADIUS - 0.25;
  if (r > limit) {
    p.x = (p.x / r) * limit;
    p.z = (p.z / r) * limit;
  }
  p.y = THREE.MathUtils.clamp(p.y, MIN_Y, MAX_Y);
}

/** Devuelve la cámara a una vista general de la sala. */
export function resetView() {
  viewState.pos.set(0, 4.4, 8.3);
  viewState.yaw = 0;
  viewState.pitch = -0.42;
}

/** Vista cenital, útil para leer las direcciones de las miradas. */
export function topView() {
  viewState.pos.set(0, 12, 0.001);
  viewState.yaw = 0;
  viewState.pitch = -1.52;
}
