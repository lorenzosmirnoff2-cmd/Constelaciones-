import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store.js';

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();

/**
 * Muestra dónde está mirando el otro participante dentro de la sala.
 * Es lo que hace que la sesión se sienta compartida aunque cada uno tenga su
 * propia perspectiva.
 */
export function PeerMarker({ selfId }) {
  const cameras = useStore((s) => s.cameras);
  const participants = useStore((s) => s.participants);
  const viewMode = useStore((s) => s.viewMode);
  const viewTargetId = useStore((s) => s.viewTargetId);

  const others = Object.keys(cameras).filter(
    (id) => id !== selfId && participants[id] && !(viewMode === 'peer' && viewTargetId === id),
  );

  return others.map((id) => (
    <PeerBody key={id} id={id} participant={participants[id]} />
  ));
}

function PeerBody({ id, participant }) {
  const group = useRef();

  useFrame((_, delta) => {
    const cam = useStore.getState().cameras[id];
    if (!cam?.p || !group.current) return;
    pos.fromArray(cam.p);
    quat.fromArray(cam.q);
    const t = 1 - Math.pow(0.0005, Math.min(delta, 0.1));
    group.current.position.lerp(pos, t);
    group.current.quaternion.slerp(quat, t);
  });

  const color = participant?.role === 'constelador' ? '#7bd0c1' : '#f2c14e';

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[0.13, 18, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
      {/* Cono que apunta hacia donde mira: la cámara mira hacia -Z local */}
      <mesh position={[0, 0, -0.26]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.11, 0.34, 16, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, 0.32, 0]} center distanceFactor={12} zIndexRange={[15, 0]}>
        <div className="peer-tag" style={{ borderColor: color }}>
          {participant?.name ?? 'Participante'}
          {participant?.following ? ' · siguiendo' : ''}
        </div>
      </Html>
    </group>
  );
}
