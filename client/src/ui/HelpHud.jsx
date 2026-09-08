import { useState } from 'react';

const TECLADO = [
  ['W A S D', 'caminar por la sala'],
  ['Arrastrar con el mouse', 'mirar alrededor'],
  [', / .', 'acercar / alejar'],
  ['Rueda', 'acercarse / alejarse'],
  ['Espacio / Z', 'subir / bajar la mirada'],
  ['Shift', 'moverse más rápido'],
  ['Arrastrar una figura', 'moverla por el piso'],
  ['Aro blanco', 'girar hacia dónde mira'],
  ['Q / E', 'girar 15° la seleccionada'],
  ['Doble clic en figura', 'mirar desde su lugar'],
  ['Supr', 'quitar la seleccionada'],
];

const TACTIL = [
  ['Arrastrar con un dedo', 'mirar alrededor'],
  ['Pellizcar con dos dedos', 'acercar / alejar'],
  ['Botones + y −', 'acercar / alejar'],
  ['Arrastrar una figura', 'moverla por el piso'],
  ['Aro blanco', 'girar hacia dónde mira'],
  ['Tocar una figura', 'seleccionarla y abrir sus datos'],
  ['Tocar dos veces', 'mirar desde su lugar'],
];

// En un celular o una tablet los atajos de teclado no sirven de nada.
const esTactil = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function HelpHud() {
  const [open, setOpen] = useState(false);
  const rows = esTactil() ? TACTIL : TECLADO;

  return (
    <div className={`help${open ? ' is-open' : ''}`}>
      <button className="help__toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Ocultar controles' : '¿Cómo me muevo?'}
      </button>
      {open && (
        <dl className="help__list">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
