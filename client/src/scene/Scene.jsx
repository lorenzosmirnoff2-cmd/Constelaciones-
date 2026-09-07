import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { addFigure, updateFigure } from '../net.js';
import { roleColor } from '@shared/roles.js';
import { Room, ROOM_RADIUS } from './Room.jsx';
import { FigureMesh } from './FigureMesh.jsx';
import { CameraRig, beginLook, viewState } from './Controls.jsx';
import { PeerMarker } from './PeerMarker.jsx';

const PLACE_LIMIT = ROOM_RADIUS - 0.6;

function clampToRoom(x, z) {
  const r = Math.hypot(x, z);
  if (r <= PLACE_LIMIT) return [x, z];
  return [(x / r) * PLACE_LIMIT, (z / r) * PLACE_LIMIT];
}

export function Scene() {
  const { camera, gl } = useThree();
  const figures = useStore((s) => s.figures);
  const selectedId = useStore((s) => s.selectedId);
  const hoveredId = useStore((s) => s.hoveredId);
  const showNames = useStore((s) => s.showNames);
  const viewMode = useStore((s) => s.viewMode);
  const viewTargetId = useStore((s) => s.viewTargetId);
  const me = useStore((s) => s.me);
  const drag = useRef(null);

  const tools = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      floor: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      ndc: new THREE.Vector2(),
      hit: new THREE.Vector3(),
    }),
    [],
  );

  /**
   * Punto del piso bajo el cursor. Se calcula a mano en vez de apoyarse en los
   * eventos de R3F: así el arrastre sigue funcionando aunque el puntero pase
   * por encima de otra figura o se salga del lienzo.
   */
  const floorPoint = useCallback(
    (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      tools.ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      tools.raycaster.setFromCamera(tools.ndc, camera);
      return tools.raycaster.ray.intersectPlane(tools.floor, tools.hit) ? tools.hit : null;
    },
    [camera, gl, tools],
  );

  useEffect(() => {
    const move = (e) => {
      const d = drag.current;
      if (!d) return;
      const f = useStore.getState().figures[d.id];
      const point = floorPoint(e.clientX, e.clientY);
      if (!f || !point) return;
      if (d.mode === 'move') {
        const [x, z] = clampToRoom(point.x + d.ox, point.z + d.oz);
        updateFigure(d.id, { x, z });
      } else {
        updateFigure(d.id, { rotY: Math.atan2(point.x - f.x, point.z - f.z) });
      }
    };

    const end = () => {
      const d = drag.current;
      if (d) {
        const f = useStore.getState().figures[d.id];
        // Valor definitivo, sin el limitador de frecuencia del arrastre.
        if (f) updateFigure(f.id, { x: f.x, z: f.z, rotY: f.rotY }, { immediate: true });
        document.body.style.cursor = '';
      }
      drag.current = null;
      viewState.draggingFigure = false;
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [floorPoint]);

  const onGrab = useCallback(
    (id, e) => {
      const f = useStore.getState().figures[id];
      if (!f) return;
      useStore.setState({ selectedId: id, placingRole: null });
      viewState.draggingFigure = true;
      const native = e.nativeEvent ?? e;
      const point = floorPoint(native.clientX, native.clientY);
      drag.current = {
        id,
        mode: 'move',
        ox: point ? f.x - point.x : 0,
        oz: point ? f.z - point.z : 0,
      };
      document.body.style.cursor = 'grabbing';
    },
    [floorPoint],
  );

  const onGrabRing = useCallback((id, e) => {
    e.stopPropagation();
    viewState.draggingFigure = true;
    drag.current = { id, mode: 'rotate' };
    document.body.style.cursor = 'grabbing';
  }, []);

  const onFloorDown = useCallback((e) => beginLook(e.nativeEvent ?? e), []);

  const onFloorClick = useCallback((e) => {
    if (viewState.moved > 6) return; // fue un arrastre para mirar, no un clic
    const { placingRole } = useStore.getState();
    if (!placingRole) {
      useStore.setState({ selectedId: null });
      return;
    }
    const [x, z] = clampToRoom(e.point.x, e.point.z);
    addFigure({
      roleKey: placingRole,
      label: '',
      x,
      z,
      rotY: Math.atan2(-x, -z), // la figura nueva mira hacia el centro
      scale: 1,
      color: roleColor(placingRole),
    }).then((r) => r?.ok && useStore.setState({ selectedId: r.figure.id }));
    useStore.setState({ placingRole: null });
  }, []);

  const list = useMemo(() => Object.values(figures), [figures]);
  const selected = selectedId ? figures[selectedId] : null;

  return (
    <>
      <CameraRig />
      <Room />

      {/* Piso interactivo: colocar figuras, deseleccionar y empezar a mirar */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} onPointerDown={onFloorDown} onClick={onFloorClick}>
        <circleGeometry args={[ROOM_RADIUS * 3, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Envolvente: permite mirar alrededor arrastrando sobre la pared o el cielo */}
      <mesh onPointerDown={onFloorDown}>
        <sphereGeometry args={[80, 16, 12]} />
        <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} />
      </mesh>

      {list.map((f) => (
        <FigureMesh
          key={f.id}
          figure={f}
          selected={f.id === selectedId}
          hovered={f.id === hoveredId}
          showName={showNames && !(viewMode === 'figure' && viewTargetId === f.id)}
          onGrab={onGrab}
          onHover={(id) => useStore.setState({ hoveredId: id })}
          onLookFrom={(id) => useStore.getState().setView('figure', id)}
        />
      ))}

      {selected && <RotateRing figure={selected} onGrab={onGrabRing} />}

      <PeerMarker selfId={me?.id} />
    </>
  );
}

/** Aro que se arrastra para girar la figura seleccionada. */
function RotateRing({ figure, onGrab }) {
  const inner = 1.02 * (figure.scale || 1);
  const outer = inner + 0.16;
  return (
    <group position={[figure.x, 0.05, figure.z]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => onGrab(figure.id, e)}
        onClick={(e) => e.stopPropagation()}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          if (document.body.style.cursor !== 'grabbing') document.body.style.cursor = '';
        }}
      >
        <ringGeometry args={[inner, outer, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* Marca del aro alineada con la mirada */}
      <mesh
        position={[Math.sin(figure.rotY) * (inner + 0.08), 0.005, Math.cos(figure.rotY) * (inner + 0.08)]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.1, 20]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
