import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.js';
import { ROLE_GROUPS, ROLES_BY_KEY, roleColor } from '@shared/roles.js';
import {
  addFigure,
  clearRoom,
  exportSession,
  loadSession,
  removeFigure,
  restoreSnapshot,
  saveSnapshot,
  sendChat,
} from '../net.js';
import {
  deleteConstellation,
  fetchConstellation,
  loadMyConstellations,
  overwriteConstellation,
  saveConstellation,
} from '../api.js';
import { AuthForm, fecha, plural } from './Account.jsx';

/** En pantallas angostas el panel tapa la sala, así que arranca cerrado. */
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth <= 720;

export function SidePanel() {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const unread = useStore((s) => s.unreadChat);
  const placingRole = useStore((s) => s.placingRole);
  const [open, setOpen] = useState(() => !isNarrow());

  // Al elegir un rol hay que poder tocar el piso: en el celular el panel se
  // corre solo para dejar la sala a la vista.
  useEffect(() => {
    if (placingRole && isNarrow()) setOpen(false);
  }, [placingRole]);

  return (
    <>
      {/* Con el panel cerrado el aviso de "colocando" tiene que verse igual. */}
      {!open && placingRole && (
        <div className="placing placing--floating">
          Colocando <strong>{ROLES_BY_KEY[placingRole]?.label}</strong> — tocá el piso
          <button onClick={() => useStore.setState({ placingRole: null })}>cancelar</button>
        </div>
      )}

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
          <button
            className="side__collapse"
            onClick={() => setOpen((v) => !v)}
            title={open ? 'Ocultar panel' : 'Mostrar panel'}
          >
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
    </>
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
      <ArchiveSection />

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

/**
 * Archivo personal: guarda la sala tal como está en la cuenta de quien la abre,
 * y permite volver a traer cualquier constelación guardada. Al traerla, la ven
 * los dos participantes.
 */
function ArchiveSection() {
  const user = useStore((s) => s.user);
  const saved = useStore((s) => s.myConstellations);
  const openOne = useStore((s) => s.openConstellation);
  const figures = useStore((s) => s.figures);
  const [name, setName] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (user) loadMyConstellations();
  }, [user]);

  useEffect(() => {
    if (openOne?.name) setName(openOne.name);
  }, [openOne]);

  const flash = (text) => {
    setStatus(text);
    setTimeout(() => setStatus(null), 2600);
  };

  const store = async (targetId) => {
    setBusy(true);
    const room = await exportSession();
    if (!room?.ok) {
      setBusy(false);
      return flash('No se pudo leer la sala.');
    }
    const payload = {
      name: name.trim() || `Constelación del ${fecha(Date.now())}`,
      code: room.code,
      figures: room.figures,
      snapshots: room.snapshots,
    };
    const res = targetId ? await overwriteConstellation(targetId, payload) : await saveConstellation(payload);
    setBusy(false);
    if (!res?.ok) return flash(res?.error ?? 'No se pudo guardar.');
    useStore.setState({ openConstellation: { id: res.constelacion.id, name: res.constelacion.name } });
    flash(targetId ? 'Actualizada en tu cuenta.' : 'Guardada en tu cuenta.');
  };

  const bring = async (c) => {
    if (Object.keys(figures).length && !confirm(`Traer «${c.name}» reemplaza lo que hay en la sala para los dos. ¿Seguimos?`))
      return;
    setBusy(true);
    const res = await fetchConstellation(c.id);
    if (res?.ok) {
      await loadSession({ figures: res.constelacion.figures, snapshots: res.constelacion.snapshots });
      useStore.setState({ openConstellation: { id: c.id, name: c.name }, selectedId: null });
      flash(`«${c.name}» está en la sala.`);
    } else {
      flash(res?.error ?? 'No se pudo abrir.');
    }
    setBusy(false);
  };

  if (!user) {
    return (
      <section className="rolegroup">
        <h3>Mis constelaciones</h3>
        {showAuth ? (
          <>
            <AuthForm onDone={() => setShowAuth(false)} />
            <button className="linkish" onClick={() => setShowAuth(false)}>
              ahora no
            </button>
          </>
        ) : (
          <p className="hint">
            Con una cuenta podés guardar esta constelación y volver a abrirla en otra sesión.{' '}
            <button className="linkish" onClick={() => setShowAuth(true)}>
              Entrar o crear cuenta
            </button>
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rolegroup">
      <h3>Mis constelaciones</h3>
      <p className="hint">
        Se guarda en tu cuenta ({user.name}) con las posiciones actuales y todos los momentos. El consultante no la ve
        en su archivo.
      </p>

      <div className="row">
        <input
          className="search"
          placeholder="Nombre de la constelación"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => store(null)}>
          Guardar
        </button>
      </div>

      {openOne && (
        <button className="btn btn--sm" disabled={busy} onClick={() => store(openOne.id)}>
          Actualizar «{openOne.name}»
        </button>
      )}

      {status && <p className="account__status">{status}</p>}

      <ul className="savedlist savedlist--compact">
        {saved.length === 0 && <li className="empty">Todavía no guardaste ninguna.</li>}
        {saved.map((c) => (
          <li key={c.id}>
            <div className="savedlist__info">
              <strong>{c.name}</strong>
              <span>
                {fecha(c.updatedAt)} · {plural(c.figuras, 'representante', 'representantes')}
              </span>
            </div>
            <button className="btn btn--sm" disabled={busy} title="Traer a esta sala" onClick={() => bring(c)}>
              traer
            </button>
            <button
              className="role__add role__add--danger"
              title="Borrar de mi cuenta"
              onClick={() => {
                if (confirm(`¿Borrar «${c.name}» de tu cuenta? No se puede deshacer.`)) {
                  deleteConstellation(c.id);
                  if (openOne?.id === c.id) useStore.setState({ openConstellation: null });
                }
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
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
