import { useMemo, useState } from 'react';
import { useStore } from '../store.js';
import { ROLE_GROUPS, ROLES_BY_KEY, roleColor } from '@shared/roles.js';
import { addFigure, clearRoom, removeFigure, restoreSnapshot, saveSnapshot, sendChat } from '../net.js';

export function SidePanel() {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const unread = useStore((s) => s.unreadChat);
  const [open, setOpen] = useState(true);

  return (
    <aside className={`side${open ? '' : ' is-collapsed'}`}>
      <nav className="side__tabs">
        <button className={panel === 'roles' ? 'is-active' : ''} onClick={() => (setPanel('roles'), setOpen(true))}>
          Representantes
        </button>
        <button className={panel === 'sesion' ? 'is-active' : ''} onClick={() => (setPanel('sesion'), setOpen(true))}>
          Sesión
        </button>
        <button className={panel === 'chat' ? 'is-active' : ''} onClick={() => (setPanel('chat'), setOpen(true))}>
          Chat{unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <button className="side__collapse" onClick={() => setOpen((v) => !v)} title={open ? 'Ocultar panel' : 'Mostrar panel'}>
          {open ? '‹' : '›'}
        </button>
      </nav>

      {open && (
        <div className="side__body">
          {panel === 'roles' && <RolesTab />}
          {panel === 'sesion' && <SessionTab />}
          {panel === 'chat' && <ChatTab />}
        </div>
      )}
    </aside>
  );
}

function RolesTab() {
  const placingRole = useStore((s) => s.placingRole);
  const figures = useStore((s) => s.figures);
  const selectedId = useStore((s) => s.selectedId);
  const setView = useStore((s) => s.setView);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROLE_GROUPS;
    return ROLE_GROUPS.map((g) => ({ ...g, roles: g.roles.filter((r) => r.label.toLowerCase().includes(q)) })).filter(
      (g) => g.roles.length,
    );
  }, [query]);

  const placed = Object.values(figures);

  const quickAdd = (roleKey) => {
    // Colocación rápida: un anillo alrededor del centro, mirando hacia adentro.
    const n = placed.length;
    const angle = (n * 2.39996) % (Math.PI * 2); // ángulo áureo: reparte sin superponer
    const radius = 1.8 + (n % 4) * 0.9;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    addFigure({ roleKey, x, z, rotY: Math.atan2(-x, -z), scale: 1, color: roleColor(roleKey), label: '' }).then(
      (r) => r?.ok && useStore.setState({ selectedId: r.figure.id }),
    );
  };

  return (
    <div className="tab">
      <p className="hint">
        Elegí un rol y hacé clic en el piso para ubicarlo, o usá <strong>+</strong> para que entre solo.
      </p>
      <input className="search" placeholder="Buscar rol…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {placingRole && (
        <div className="placing">
          Colocando <strong>{ROLES_BY_KEY[placingRole]?.label}</strong> — hacé clic en el piso
          <button onClick={() => useStore.setState({ placingRole: null })}>cancelar</button>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} className="rolegroup">
          <h3>{g.label}</h3>
          <ul>
            {g.roles.map((r) => (
              <li key={r.key}>
                <button
                  className={`role${placingRole === r.key ? ' is-active' : ''}`}
                  onClick={() => useStore.setState({ placingRole: placingRole === r.key ? null : r.key })}
                >
                  <span className="role__dot" style={{ background: roleColor(r.key) }} />
                  {r.label}
                </button>
                <button className="role__add" title="Agregar al centro" onClick={() => quickAdd(r.key)}>
                  +
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {placed.length > 0 && (
        <section className="rolegroup">
          <h3>En la sala ({placed.length})</h3>
          <ul className="placedlist">
            {placed.map((f) => (
              <li key={f.id}>
                <button
                  className={`role${selectedId === f.id ? ' is-active' : ''}`}
                  onClick={() => useStore.setState({ selectedId: f.id })}
                >
                  <span className="role__dot" style={{ background: f.color }} />
                  {f.label?.trim() || ROLES_BY_KEY[f.roleKey]?.label || f.roleKey}
                </button>
                <button className="role__add" title="Ver desde esta figura" onClick={() => setView('figure', f.id)}>
                  ◉
                </button>
                <button className="role__add role__add--danger" title="Quitar" onClick={() => removeFigure(f.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SessionTab() {
  const snapshots = useStore((s) => s.snapshots);
  const showNames = useStore((s) => s.showNames);
  const showGrid = useStore((s) => s.showGrid);
  const toggle = useStore((s) => s.toggle);
  const [snapName, setSnapName] = useState('');

  return (
    <div className="tab">
      <section className="rolegroup">
        <h3>Momentos de la constelación</h3>
        <p className="hint">
          Guardá una foto de las posiciones antes de mover algo. Restaurarla devuelve la sala a ese instante para
          ambos.
        </p>
        <div className="row">
          <input
            className="search"
            placeholder="Nombre del momento"
            value={snapName}
            onChange={(e) => setSnapName(e.target.value)}
          />
          <button
            className="btn btn--sm"
            onClick={() => {
              saveSnapshot(snapName);
              setSnapName('');
            }}
          >
            Guardar
          </button>
        </div>
        <ul className="snaplist">
          {snapshots.length === 0 && <li className="empty">Todavía no guardaste ningún momento.</li>}
          {snapshots.map((s) => (
            <li key={s.id}>
              <span>{s.name}</span>
              <button onClick={() => restoreSnapshot(s.id)}>restaurar</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rolegroup">
        <h3>Vista</h3>
        <label className="check">
          <input type="checkbox" checked={showNames} onChange={() => toggle('showNames')} />
          Mostrar nombres sobre las figuras
        </label>
        <label className="check">
          <input type="checkbox" checked={showGrid} onChange={() => toggle('showGrid')} />
          Mostrar grilla del piso
        </label>
      </section>

      <section className="rolegroup">
        <h3>Sala</h3>
        <button
          className="btn btn--danger btn--sm"
          onClick={() => {
            if (confirm('¿Vaciar la sala para ambos participantes?')) clearRoom();
          }}
        >
          Vaciar la sala
        </button>
      </section>
    </div>
  );
}

function ChatTab() {
  const chat = useStore((s) => s.chat);
  const me = useStore((s) => s.me);
  const [text, setText] = useState('');

  return (
    <div className="tab tab--chat">
      <ul className="chat">
        {chat.length === 0 && <li className="empty">Sin mensajes todavía.</li>}
        {chat.map((m) => (
          <li key={m.id} className={m.from === me?.id ? 'is-mine' : ''}>
            <strong>{m.name}</strong>
            <span>{m.text}</span>
          </li>
        ))}
      </ul>
      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          sendChat(text);
          setText('');
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí un mensaje…" />
        <button className="btn btn--sm" type="submit">
          Enviar
        </button>
      </form>
    </div>
  );
}
