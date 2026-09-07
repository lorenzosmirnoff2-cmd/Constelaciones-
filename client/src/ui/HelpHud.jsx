import { useState } from 'react';

const ROWS = [
  ['W A S D', 'caminar por la sala'],
  ['Arrastrar con el mouse', 'mirar alrededor'],
  ['Rueda', 'acercarse / alejarse'],
  ['Espacio / Z', 'subir / bajar la mirada'],
  ['Shift', 'moverse más rápido'],
  ['Arrastrar una figura', 'moverla por el piso'],
  ['Aro blanco', 'girar hacia dónde mira'],
  ['Q / E', 'girar 15° la seleccionada'],
  ['Doble clic en figura', 'mirar desde su lugar'],
  ['Supr', 'quitar la seleccionada'],
];

export function HelpHud() {
  const [open, setOpen] = useState(false);

  return (
    <div className={`help${open ? ' is-open' : ''}`}>
      <button className="help__toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Ocultar controles' : '¿Cómo me muevo?'}
      </button>
      {open && (
        <dl className="help__list">
          {ROWS.map(([k, v]) => (
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
