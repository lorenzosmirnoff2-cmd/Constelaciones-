import { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { zoomBy } from '../scene/Controls.jsx';

const STEP = 0.18; // un toque; manteniendo apretado se repite
const REPEAT_MS = 40;

/**
 * Botones para acercar y alejar la cámara, abajo a la derecha.
 * Hacen lo mismo que la rueda del mouse, las teclas , y . y el pellizco con
 * dos dedos; están para que también se pueda desde el celular.
 */
export function ZoomControls() {
  const viewMode = useStore((s) => s.viewMode);
  const timer = useRef(null);
  // Mirando desde una figura o desde la otra persona la posición no es propia.
  const disabled = viewMode === 'peer' || viewMode === 'figure';

  useEffect(() => {
    const stop = () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
    // Se suelta el botón donde sea (incluso fuera de él) y el zoom se corta.
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      stop();
    };
  }, []);

  const press = (dir) => (e) => {
    e.preventDefault();
    if (disabled) return;
    zoomBy(dir * STEP);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => zoomBy(dir * STEP), REPEAT_MS);
  };

  return (
    <div className="zoom">
      <button
        className="zoom__btn"
        onPointerDown={press(1)}
        disabled={disabled}
        title="Acercar (tecla , o rueda del mouse)"
        aria-label="Acercar"
      >
        +
      </button>
      <button
        className="zoom__btn"
        onPointerDown={press(-1)}
        disabled={disabled}
        title="Alejar (tecla . o rueda del mouse)"
        aria-label="Alejar"
      >
        −
      </button>
    </div>
  );
}
