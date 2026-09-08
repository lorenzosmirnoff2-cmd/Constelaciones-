import { Canvas } from '@react-three/fiber';
import { useStore } from './store.js';
import { Scene } from './scene/Scene.jsx';
import { Lobby } from './ui/Lobby.jsx';
import { TopBar } from './ui/TopBar.jsx';
import { SidePanel } from './ui/SidePanel.jsx';
import { Inspector } from './ui/Inspector.jsx';
import { VideoDock } from './ui/VideoDock.jsx';
import { HelpHud } from './ui/HelpHud.jsx';
import { ZoomControls } from './ui/ZoomControls.jsx';

export function App() {
  const phase = useStore((s) => s.phase);
  // Con una figura seleccionada el inspector ocupa el pie de la pantalla: en el
  // celular hay que correr de ahí los botones de zoom y la ayuda.
  const inspecting = useStore((s) => !!s.selectedId);

  if (phase === 'lobby') return <Lobby />;

  return (
    <div className={`app${inspecting ? ' app--inspecting' : ''}`}>
      <div className="viewport">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 55, near: 0.08, far: 200, position: [0, 4, 10.5] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#141110']} />
          <fog attach="fog" args={['#141110', 22, 60]} />
          <Scene />
        </Canvas>
      </div>

      <TopBar />
      <SidePanel />
      <VideoDock />
      <Inspector />
      <HelpHud />
      <ZoomControls />
    </div>
  );
}
