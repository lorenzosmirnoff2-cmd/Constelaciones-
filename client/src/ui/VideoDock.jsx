import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { socket } from '../net.js';

const FALLBACK_ICE = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

// El servidor decide qué STUN/TURN usar (ver TURN_URL en el README). Se pide una
// sola vez por sesión de navegador.
let icePromise = null;
function getIceConfig() {
  icePromise ??= fetch('/api/ice')
    .then((r) => (r.ok ? r.json() : FALLBACK_ICE))
    .then((c) => (c?.iceServers?.length ? c : FALLBACK_ICE))
    .catch(() => FALLBACK_ICE);
  return icePromise;
}

/**
 * Videollamada 1 a 1 por WebRTC.
 * El servidor de sesiones sólo hace de señalizador: el audio y el video van
 * directo entre los dos navegadores.
 */
export function VideoDock() {
  const me = useStore((s) => s.me);
  const participants = useStore((s) => s.participants);
  const peer = Object.values(participants).find((p) => p.id !== me?.id) ?? null;

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | calling | incoming | live | error
  const [error, setError] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const pcRef = useRef(null);
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const streamRef = useRef(null);
  const peerIdRef = useRef(null);
  const pendingOffer = useRef(null);
  const pendingCandidates = useRef([]);

  peerIdRef.current = peer?.id ?? null;

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pendingOffer.current = null;
    pendingCandidates.current = [];
    if (localRef.current) localRef.current.srcObject = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
    setStatus('idle');
  }, []);

  const getMedia = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    return stream;
  }, []);

  const ensurePc = useCallback(async () => {
    if (pcRef.current) return pcRef.current;
    const stream = await getMedia();
    const pc = new RTCPeerConnection(await getIceConfig());
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate && peerIdRef.current) {
        socket.emit('rtc:signal', { to: peerIdRef.current, data: { type: 'candidate', candidate: e.candidate } });
      }
    };
    pc.ontrack = (e) => {
      if (remoteRef.current) remoteRef.current.srcObject = e.streams[0];
      setStatus('live');
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') setStatus('live');
      if (s === 'failed' || s === 'closed') {
        setError(s === 'failed' ? 'No se pudo establecer la conexión de video.' : null);
        cleanup();
      }
      if (s === 'disconnected') setStatus('calling');
    };
    pcRef.current = pc;
    return pc;
  }, [cleanup, getMedia]);

  const flushCandidates = useCallback(async (pc) => {
    for (const c of pendingCandidates.current) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* candidato tardío, se ignora */
      }
    }
    pendingCandidates.current = [];
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!peerIdRef.current) {
      setError('Todavía no hay nadie más en la sala.');
      return;
    }
    try {
      setStatus('calling');
      const pc = await ensurePc();
      if (pendingOffer.current) {
        // Estábamos respondiendo una llamada entrante.
        await pc.setRemoteDescription(pendingOffer.current);
        pendingOffer.current = null;
        await flushCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('rtc:signal', { to: peerIdRef.current, data: { type: 'answer', sdp: pc.localDescription } });
      } else {
        socket.emit('rtc:ready');
        // Desempate determinista: llama quien tenga el id menor.
        if (me?.id && peerIdRef.current && me.id < peerIdRef.current) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('rtc:signal', { to: peerIdRef.current, data: { type: 'offer', sdp: pc.localDescription } });
        }
      }
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'Hay que permitir el acceso a la cámara y al micrófono.' : String(err?.message || err));
      setStatus('error');
    }
  }, [ensurePc, flushCandidates, me?.id]);

  // --- señalización -------------------------------------------------------
  useEffect(() => {
    const onReady = async ({ from }) => {
      if (!streamRef.current) return; // aún no aceptamos la cámara: no hacemos nada
      if (!me?.id || me.id >= from) return; // el otro lado hará la oferta
      const pc = await ensurePc();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('rtc:signal', { to: from, data: { type: 'offer', sdp: pc.localDescription } });
    };

    const onSignal = async ({ from, data }) => {
      try {
        if (data.type === 'offer') {
          if (!streamRef.current) {
            pendingOffer.current = new RTCSessionDescription(data.sdp);
            setStatus('incoming');
            setOpen(true);
            return;
          }
          const pc = await ensurePc();
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('rtc:signal', { to: from, data: { type: 'answer', sdp: pc.localDescription } });
        } else if (data.type === 'answer') {
          const pc = pcRef.current;
          if (!pc) return;
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushCandidates(pc);
        } else if (data.type === 'candidate') {
          const candidate = new RTCIceCandidate(data.candidate);
          const pc = pcRef.current;
          if (pc?.remoteDescription?.type) await pc.addIceCandidate(candidate);
          else pendingCandidates.current.push(candidate);
        }
      } catch (err) {
        setError(String(err?.message || err));
      }
    };

    socket.on('rtc:ready', onReady);
    socket.on('rtc:signal', onSignal);
    return () => {
      socket.off('rtc:ready', onReady);
      socket.off('rtc:signal', onSignal);
    };
  }, [ensurePc, flushCandidates, me?.id]);

  useEffect(() => cleanup, [cleanup]);

  // Si la otra persona se va, cortamos.
  useEffect(() => {
    if (!peer && status !== 'idle') cleanup();
  }, [peer, status, cleanup]);

  const toggleTrack = (kind, next) => {
    streamRef.current?.getTracks().filter((t) => t.kind === kind).forEach((t) => (t.enabled = next));
  };

  return (
    <div className={`videodock${open ? ' is-open' : ''}`}>
      <button className="videodock__tab" onClick={() => setOpen((v) => !v)}>
        <span className="videodock__icon" aria-hidden="true">▣</span>
        Videollamada
        {status === 'live' && <span className="dot dot--on" />}
        {status === 'incoming' && <span className="dot dot--ring" />}
      </button>

      {open && (
        <div className="videodock__panel">
          <div className="videodock__screens">
            <video ref={remoteRef} className="videodock__remote" autoPlay playsInline />
            <video ref={localRef} className="videodock__local" autoPlay playsInline muted />
            {status !== 'live' && (
              <div className="videodock__overlay">
                {status === 'idle' && (peer ? `Llamar a ${peer.name}` : 'Esperando a la otra persona')}
                {status === 'calling' && 'Conectando…'}
                {status === 'incoming' && `${peer?.name ?? 'La otra persona'} te está llamando`}
                {status === 'error' && 'No se pudo conectar'}
              </div>
            )}
          </div>

          <div className="videodock__controls">
            {status === 'idle' || status === 'error' ? (
              <button className="btn btn--sm btn--primary" onClick={start} disabled={!peer}>
                Iniciar videollamada
              </button>
            ) : status === 'incoming' ? (
              <button className="btn btn--sm btn--primary" onClick={start}>
                Responder
              </button>
            ) : (
              <>
                <button
                  className={`icon${micOn ? '' : ' is-off'}`}
                  title={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
                  onClick={() => {
                    toggleTrack('audio', !micOn);
                    setMicOn(!micOn);
                  }}
                >
                  {micOn ? '🎙' : '🔇'}
                </button>
                <button
                  className={`icon${camOn ? '' : ' is-off'}`}
                  title={camOn ? 'Apagar cámara' : 'Encender cámara'}
                  onClick={() => {
                    toggleTrack('video', !camOn);
                    setCamOn(!camOn);
                  }}
                >
                  {camOn ? '🎥' : '🚫'}
                </button>
                <button className="btn btn--sm btn--danger" onClick={cleanup}>
                  Cortar
                </button>
              </>
            )}
          </div>

          {error && <p className="videodock__error">{error}</p>}
        </div>
      )}
    </div>
  );
}
