import { useState } from 'react';
import { useStore } from '../store.js';
import { setFollowing } from '../net.js';
import { resetView, topView } from '../scene/Controls.jsx';
import { ROLES_BY_KEY } from '@shared/roles.js';

export function TopBar() {
  const code = useStore((s) => s.code);
  const me = useStore((s) => s.me);
  const participants = useStore((s) => s.participants);
  const connected = useStore((s) => s.connected);
  const viewMode = useStore((s) => s.viewMode);
  const viewTargetId = useStore((s) => s.viewTargetId);
  const figures = useStore((s) => s.figures);
  const setView = useStore((s) => s.setView);
  const [copied, setCopied] = useState(null);

  const peers = Object.values(participants).filter((p) => p.id !== me?.id);

  const copy = async (text, tag) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied('error');
    }
  };

  const follow = (peerId) => {
    if (viewMode === 'peer' && viewTargetId === peerId) {
      setView('orbit');
      setFollowing(null);
    } else {
      setView('peer', peerId);
      setFollowing(peerId);
    }
  };

  const backToMyView = () => {
    setView('orbit');
    setFollowing(null);
  };

  const viewingFigure = viewMode === 'figure' ? figures[viewTargetId] : null;
  const followingPeer = viewMode === 'peer' ? participants[viewTargetId] : null;

  return (
    <header className="topbar">
      <div className="topbar__group">
        <span className="topbar__label">Sesión</span>
        <button className="chip chip--code" onClick={() => copy(code, 'code')} title="Copiar código">
          {code}
        </button>
        <button
          className="chip"
          onClick={() => copy(`${location.origin}/?codigo=${code}`, 'link')}
          title="Copiar enlace de invitación"
        >
          {copied === 'link' ? 'Enlace copiado' : copied === 'code' ? 'Código copiado' : 'Copiar invitación'}
        </button>
      </div>

      <div className="topbar__group topbar__group--people">
        <span className={`dot${connected ? ' dot--on' : ''}`} title={connected ? 'En línea' : 'Sin conexión'} />
        <span className="who">
          {me?.name} <em>{me?.role === 'constelador' ? 'constelador/a' : 'consultante'}</em>
        </span>
        {peers.length === 0 && <span className="who who--waiting">Esperando a la otra persona…</span>}
        {peers.map((p) => (
          <button
            key={p.id}
            className={`chip chip--peer${viewMode === 'peer' && viewTargetId === p.id ? ' is-active' : ''}`}
            onClick={() => follow(p.id)}
            title={`Ver la sala desde la perspectiva de ${p.name}`}
          >
            <span className="dot dot--on" />
            {p.name}
            <em>{viewMode === 'peer' && viewTargetId === p.id ? 'saliendo' : 'ver su vista'}</em>
          </button>
        ))}
      </div>

      <div className="topbar__group">
        {(viewingFigure || followingPeer) && (
          <button className="chip chip--alert" onClick={backToMyView}>
            {viewingFigure
              ? `Mirando desde ${viewingFigure.label?.trim() || ROLES_BY_KEY[viewingFigure.roleKey]?.label}`
              : `Viendo a ${followingPeer?.name}`}
            <em>volver a mi vista</em>
          </button>
        )}
        <button className="chip" onClick={() => (setView('orbit'), resetView())} title="Vista general">
          Vista general
        </button>
        <button className="chip" onClick={() => (setView('orbit'), topView())} title="Vista desde arriba">
          Vista cenital
        </button>
      </div>
    </header>
  );
}
