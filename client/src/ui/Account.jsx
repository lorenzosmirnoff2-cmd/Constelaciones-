import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { deleteConstellation, loadMyConstellations, login, logout, register } from '../api.js';

export const fecha = (ms) =>
  new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Formulario de ingreso / registro. La cuenta es opcional: sirve para guardar
 * constelaciones y volver a abrirlas en otra sesión.
 */
export function AuthForm({ onDone }) {
  const [mode, setMode] = useState('entrar'); // 'entrar' | 'crear'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(() => localStorage.getItem('cf.name') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = mode === 'crear' ? await register(email, password, name) : await login(email, password);
    setBusy(false);
    if (!res?.ok) return setError(res?.error ?? 'No se pudo continuar.');
    localStorage.setItem('cf.name', res.user.name);
    onDone?.(res.user);
  };

  return (
    <form className="account__form" onSubmit={submit}>
      <div className="account__switch">
        <button type="button" className={mode === 'entrar' ? 'is-active' : ''} onClick={() => setMode('entrar')}>
          Entrar
        </button>
        <button type="button" className={mode === 'crear' ? 'is-active' : ''} onClick={() => setMode('crear')}>
          Crear cuenta
        </button>
      </div>

      {mode === 'crear' && (
        <label className="field">
          <span>Tu nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
        </label>
      )}

      <label className="field">
        <span>Correo</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="nombre@correo.com"
        />
      </label>

      <label className="field">
        <span>Contraseña</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'crear' ? 'new-password' : 'current-password'}
          placeholder={mode === 'crear' ? 'Al menos 8 caracteres' : ''}
        />
      </label>

      {error && <p className="account__error">{error}</p>}

      <button className="btn btn--primary" type="submit" disabled={busy || !email || !password}>
        {busy ? 'Un momento…' : mode === 'crear' ? 'Crear mi cuenta' : 'Entrar a mi cuenta'}
      </button>
    </form>
  );
}

/**
 * Bloque de cuenta del vestíbulo: si no hay sesión iniciada ofrece entrar; si la
 * hay, lista las constelaciones guardadas para abrirlas en una sala nueva.
 */
export function AccountBox({ onOpenSaved, busy }) {
  const user = useStore((s) => s.user);
  const saved = useStore((s) => s.myConstellations);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user) loadMyConstellations();
  }, [user]);

  if (!user) {
    return (
      <section className="account">
        {open ? (
          <>
            <AuthForm onDone={() => setOpen(false)} />
            <button className="linkish" onClick={() => setOpen(false)}>
              Seguir sin cuenta
            </button>
          </>
        ) : (
          <p className="account__pitch">
            <strong>¿Querés guardar tus constelaciones?</strong> Con una cuenta quedan archivadas y las podés volver a
            abrir cuando quieras.{' '}
            <button className="linkish" onClick={() => setOpen(true)}>
              Entrar o crear cuenta
            </button>
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="account">
      <header className="account__head">
        <span>
          Cuenta de <strong>{user.name}</strong>
        </span>
        <button className="linkish" onClick={logout}>
          salir
        </button>
      </header>

      <h3>Mis constelaciones ({saved.length})</h3>
      {saved.length === 0 ? (
        <p className="hint">Todavía no guardaste ninguna. Podés hacerlo desde la pestaña «Sesión» dentro de la sala.</p>
      ) : (
        <ul className="savedlist">
          {saved.map((c) => (
            <li key={c.id}>
              <div className="savedlist__info">
                <strong>{c.name}</strong>
                <span>
                  {fecha(c.updatedAt)} · {plural(c.figuras, 'representante', 'representantes')}
                  {c.momentos > 0 ? ` · ${plural(c.momentos, 'momento', 'momentos')}` : ''}
                </span>
              </div>
              <button className="btn btn--sm" disabled={busy} onClick={() => onOpenSaved(c)}>
                Abrir en una sala
              </button>
              <button
                className="role__add role__add--danger"
                title="Borrar"
                onClick={() => {
                  if (confirm(`¿Borrar «${c.name}» de tu cuenta? No se puede deshacer.`)) deleteConstellation(c.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
