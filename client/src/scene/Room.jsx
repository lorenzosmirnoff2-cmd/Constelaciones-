import { Grid, ContactShadows, Html } from '@react-three/drei';
import { useStore } from '../store.js';

export const ROOM_RADIUS = 9;
export const WALL_HEIGHT = 5;

/** Referencias fijas en la pared para que ambos puedan nombrar direcciones. */
const MARKS = [
  { label: 'N', angle: 0 },
  { label: 'E', angle: Math.PI / 2 },
  { label: 'S', angle: Math.PI },
  { label: 'O', angle: -Math.PI / 2 },
];

export function Room() {
  const showGrid = useStore((s) => s.showGrid);

  return (
    <group>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#fff4e2', '#3a2f28', 0.5]} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <pointLight position={[-6, 3.2, -5]} intensity={18} distance={18} color="#ffd9a8" />
      <pointLight position={[6, 3.2, 5]} intensity={14} distance={18} color="#cfe0ff" />

      {/* Piso */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ROOM_RADIUS, 64]} />
        <meshStandardMaterial color="#b08e6a" roughness={0.85} metalness={0.02} />
      </mesh>

      {/* Zócalo del piso, da volumen al borde */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[ROOM_RADIUS, ROOM_RADIUS, 0.12, 64]} />
        <meshStandardMaterial color="#8a6c50" roughness={0.9} />
      </mesh>

      {/* Muro circular (visto desde adentro) */}
      <mesh position={[0, WALL_HEIGHT / 2, 0]} receiveShadow>
        <cylinderGeometry args={[ROOM_RADIUS + 0.4, ROOM_RADIUS + 0.4, WALL_HEIGHT, 64, 1, true]} />
        <meshStandardMaterial color="#efe4d6" roughness={1} side={2} />
      </mesh>

      {/* Remate superior del muro. La sala queda abierta arriba para que la
          vista cenital sea utilizable. */}
      <mesh position={[0, WALL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ROOM_RADIUS + 0.4, ROOM_RADIUS + 0.75, 64]} />
        <meshStandardMaterial color="#d8ccbc" roughness={1} side={2} />
      </mesh>

      {showGrid && (
        <Grid
          position={[0, 0.012, 0]}
          args={[ROOM_RADIUS * 2, ROOM_RADIUS * 2]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#8a6c50"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#6c5039"
          fadeDistance={26}
          fadeStrength={1.2}
          followCamera={false}
          infiniteGrid={false}
        />
      )}

      {/* Centro de la sala */}
      <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.34, 48]} />
        <meshBasicMaterial color="#6c5039" transparent opacity={0.55} />
      </mesh>

      <ContactShadows position={[0, 0.02, 0]} opacity={0.42} scale={ROOM_RADIUS * 2.2} blur={2.4} far={5} />

      {MARKS.map(({ label, angle }) => {
        const r = ROOM_RADIUS + 0.3;
        const p = [Math.sin(angle) * r, 1.9, Math.cos(angle) * r];
        return (
          <Html key={label} position={p} center distanceFactor={16} zIndexRange={[10, 0]}>
            <div className="wall-mark">{label}</div>
          </Html>
        );
      })}
    </group>
  );
}
