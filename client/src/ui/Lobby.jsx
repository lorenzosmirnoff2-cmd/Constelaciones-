import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { createSession, joinSession, loadSession } from '../net.js';
import { fetchConstellation, restoreSession } from '../api.js';
import { AccountBox } from './Account.jsx';

export function Lobby() {
  const connected = useStore((s) => s.connected);
  const error = useStore((s) => s.error);
  const user = useStore((s) => s.user);
  const [name, setName] = useState(() => localStorage.getItem('cf.name') ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // El código puede llegar en el enlace que comparte el constelador.
    const fromUrl = new URLSearchParams(location.search).get('codigo');
    if (fromUrl) setCode(fromUrl.toUpperCase());
    restoreSession();
  }, []);

  // Al entrar a la cuenta, el nombre de la sala pasa a ser el de la cuenta.
  useEffect(() => {
    if (user?.name) setName((n) => n.trim() || user.name);
  }, [user]);

  const remember = () => localStorage.setItem('cf.name', name.trim());

  const onCreate = async () => {
    setBusy(true);
    remember();
    await createSession(name);
    setBusy(false);
  };

  const onJoin = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    remember();
    await joinSession(code, name);
    setBusy(false);
  };

  // Abre una constelación archivada: crea una sala nueva y la deja armada.
  const onOpenSaved = async (summary) => {
    setBusy(true);
    remember();
    const res = await fetchConstellation(summary.id);
    if (res?.ok) {
      const created = await createSession(name || user?.name);
      if (created?.ok) {
        await loadSession({ figures: res.constelacion.figures, snapshots: res.constelacion.snapshots });
        useStore.setState({ openConstellation: { id: summary.id, name: summary.name } });
      }
    } else {
      useStore.setState({ error: res?.error ?? 'No se pudo abrir esa constelación.' });
    }
    setBusy(false);
  };

  return (
    <div className="lobby">
      <div className="lobby__glow" />
      <main className="lobby__card">
        <header className="lobby__head">
          <div className="lobby__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1>Sala de Constelaciones</h1>
          <p>
            Un espacio tridimensional compartido para constelar a distancia. El constelador abre la sala y
            comparte el código; ambos entran con los mismos permisos y cada uno mira desde su propio lugar.
          </p>
        </header>

        <label className="field">
          <span>Tu nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cómo te van a ver en la sala"
            maxLength={40}
          />
        </label>

        <div className="lobby__actions">
          <section className="lobby__block">
            <h2>Soy constelador/a</h2>
            <p>Creo la sala y recibo un código de 6 caracteres para pasarle al consultante.</p>
            <button className="btn btn--primary" onClick={onCreate} disabled={busy || !connected}>
              Crear sesión
            </button>
          </section>

          <div className="lobby__divider"><span>o</span></div>

          <section className="lobby__block">
            <h2>Tengo un código</h2>
            <p>Entro a la sala que abrió mi constelador/a.</p>
            <form onSubmit={onJoin} className="lobby__join">
              <input
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                aria-label="Código de sesión"
              />
              <button className="btn" type="submit" disabled={busy || !connected || code.length < 4}>
                Entrar
              </button>
            </form>
          </section>
        </div>

        <AccountBox onOpenSaved={onOpenSaved} busy={busy || !connected} />

        {error && <p className="lobby__error">{error}</p>}
        <footer className="lobby__foot">
          <span className={`dot${connected ? ' dot--on' : ''}`} />
          {connected ? 'Conectado al servidor de sesiones' : 'Buscando el servidor…'}
        </footer>
      </main>
    </div>
  );
}
