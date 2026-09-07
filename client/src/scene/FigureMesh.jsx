import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ROLES_BY_KEY } from '@shared/roles.js';

// Proporciones del representante según el género del rol.
// El eje +Z local es siempre "hacia dónde mira".
const SHAPES = {
  m: { body: [0.2, 0.31, 1.0], head: 0.185, base: 0.36 },
  f: { body: [0.13, 0.35, 1.06], head: 0.17, base: 0.38 },
  n: { body: [0.22, 0.24, 0.96], head: 0.19, base: 0.34 },
};

export function FigureMesh({ figure, selected, hovered, showName, onGrab, onHover, onLookFrom }) {
  const role = ROLES_BY_KEY[figure.roleKey] ?? { label: figure.roleKey, gender: 'n', short: '?' };
  const shape = SHAPES[role.gender] ?? SHAPES.n;
  const [rTop, rBottom, bodyH] = shape.body;
  const baseY = 0.08;
  const headY = baseY + bodyH + shape.head * 0.85;

  const color = figure.color || '#e0a458';
  const materials = useMemo(() => {
    const c = new THREE.Color(color);
    return {
      body: { color: c.getStyle(), roughness: 0.45, metalness: 0.05 },
      dark: { color: c.clone().multiplyScalar(0.72).getStyle(), roughness: 0.6 },
      emissive: selected ? c.clone().multiplyScalar(0.55).getStyle() : hovered ? c.clone().multiplyScalar(0.28).getStyle() : '#000000',
    };
  }, [color, selected, hovered]);

  return (
    <group
      position={[figure.x, 0, figure.z]}
      rotation={[0, figure.rotY, 0]}
      scale={figure.scale || 1}
      onPointerDown={(e) => {
        e.stopPropagation();
        onGrab?.(figure.id, e);
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerOver={() => onHover?.(figure.id)}
      onPointerOut={() => onHover?.(null)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onLookFrom?.(figure.id);
      }}
    >
      {/* Peana */}
      <mesh position={[0, baseY / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[shape.base, shape.base + 0.02, baseY, 32]} />
        <meshStandardMaterial {...materials.dark} />
      </mesh>

      {/* Cuerpo */}
      <mesh position={[0, baseY + bodyH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[rTop, rBottom, bodyH, 32]} />
        <meshStandardMaterial {...materials.body} emissive={materials.emissive} />
      </mesh>

      {/* Cabeza */}
      <mesh position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[shape.head, 24, 20]} />
        <meshStandardMaterial {...materials.body} emissive={materials.emissive} />
      </mesh>

      {/* "Nariz": indica la mirada cuando se está a ras del piso */}
      <mesh position={[0, headY, shape.head * 0.92]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.055, 0.16, 12]} />
        <meshStandardMaterial color="#2c2320" roughness={0.5} />
      </mesh>

      {/* Flecha de dirección en el piso */}
      <group position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, shape.base + 0.24, 0]}>
          <planeGeometry args={[0.1, 0.42]} />
          <meshBasicMaterial color="#2c2320" transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, shape.base + 0.56, 0]}>
          <circleGeometry args={[0.16, 3, Math.PI / 2]} />
          <meshBasicMaterial color="#2c2320" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Aro de selección */}
      {(selected || hovered) && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[shape.base + 0.1, shape.base + 0.18, 48]} />
          <meshBasicMaterial color={selected ? '#ffffff' : '#ffe6b0'} transparent opacity={selected ? 0.95 : 0.5} />
        </mesh>
      )}

      {showName && (
        <Html position={[0, headY + shape.head + 0.34, 0]} center distanceFactor={11} zIndexRange={[20, 0]}>
          <div className={`fig-label${selected ? ' is-selected' : ''}`}>
            <span className="fig-label__role">{figure.label?.trim() || role.label}</span>
            {figure.label?.trim() && <span className="fig-label__sub">{role.label}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}
