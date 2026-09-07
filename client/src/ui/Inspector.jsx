import { useStore } from '../store.js';
import { removeFigure, updateFigure } from '../net.js';
import { ROLES_BY_KEY, GENDER_COLORS } from '@shared/roles.js';

const PALETTE = [GENDER_COLORS.m, GENDER_COLORS.f, GENDER_COLORS.n, '#8bc48a', '#b58ed6', '#d96f6f', '#7bd0c1', '#9aa3ad'];

export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const figure = useStore((s) => (s.selectedId ? s.figures[s.selectedId] : null));
  const setView = useStore((s) => s.setView);

  if (!selectedId || !figure) return null;
  const role = ROLES_BY_KEY[figure.roleKey];
  const deg = Math.round(((figure.rotY * 180) / Math.PI + 360) % 360);

  return (
    <section className="inspector">
      <header>
        <span className="inspector__dot" style={{ background: figure.color }} />
        <div>
          <strong>{figure.label?.trim() || role?.label || figure.roleKey}</strong>
          <em>{role?.label ?? 'Representante'}</em>
        </div>
        <button className="icon" title="Cerrar" onClick={() => useStore.setState({ selectedId: null })}>
          ×
        </button>
      </header>

      <div className="inspector__grid">
        <label className="field field--inline">
          <span>Etiqueta</span>
          <input
            value={figure.label ?? ''}
            placeholder={role?.label ?? ''}
            maxLength={32}
            onChange={(e) => updateFigure(figure.id, { label: e.target.value }, { immediate: true })}
          />
        </label>

        <label className="field field--inline">
          <span>Mirada · {deg}°</span>
          <input
            type="range"
            min="0"
            max="359"
            value={deg}
            onChange={(e) => updateFigure(figure.id, { rotY: (Number(e.target.value) * Math.PI) / 180 })}
            onPointerUp={() => updateFigure(figure.id, { rotY: figure.rotY }, { immediate: true })}
          />
        </label>

        <label className="field field--inline">
          <span>Tamaño</span>
          <input
            type="range"
            min="0.7"
            max="1.6"
            step="0.02"
            value={figure.scale ?? 1}
            onChange={(e) => updateFigure(figure.id, { scale: Number(e.target.value) })}
            onPointerUp={() => updateFigure(figure.id, { scale: figure.scale }, { immediate: true })}
          />
        </label>

        <div className="field field--inline">
          <span>Color</span>
          <div className="swatches">
            {PALETTE.map((c) => (
              <button
                key={c}
                className={`swatch${figure.color === c ? ' is-active' : ''}`}
                style={{ background: c }}
                onClick={() => updateFigure(figure.id, { color: c }, { immediate: true })}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>

      <label className="field">
        <span>Nota del constelador</span>
        <textarea
          rows={2}
          value={figure.note ?? ''}
          placeholder="Lo que aparece, lo que dice, lo que siente…"
          onChange={(e) => updateFigure(figure.id, { note: e.target.value }, { immediate: true })}
        />
      </label>

      <footer>
        <button className="btn btn--sm" onClick={() => setView('figure', figure.id)}>
          Mirar desde acá
        </button>
        <button className="btn btn--sm btn--danger" onClick={() => removeFigure(figure.id)}>
          Quitar de la sala
        </button>
        <span className="inspector__tip">Arrastrá la figura para moverla · el aro blanco la gira · Q / E rotan 15°</span>
      </footer>
    </section>
  );
}
