import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

// Mantiene la ultima respuesta visible ante errores transitorios de actualizacion.
export function useConsulta(ruta, { intervalo = 0, publico = false } = {}) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [actualizado, setActualizado] = useState(null);
  const [intento, setIntento] = useState(0);
  const refrescar = useCallback(() => setIntento((n) => n + 1), []);
  const version = useRef(0);
  useEffect(() => {
    const actual = ++version.current;
    const control = new AbortController();
    let ocupado = false;
    setDatos(null);
    setCargando(true);
    setError('');
    async function consultar() {
      if (ocupado || control.signal.aborted) return;
      ocupado = true;
      try {
        const respuesta = await api(ruta, { signal: control.signal, publico });
        if (actual === version.current && !control.signal.aborted) {
          setDatos(respuesta);
          setError('');
          setActualizado(new Date().toISOString());
        }
      } catch (e) {
        if (!control.signal.aborted && actual === version.current)
          setError(e.message);
      } finally {
        ocupado = false;
        if (!control.signal.aborted && actual === version.current)
          setCargando(false);
      }
    }
    consultar();
    const temporizador = intervalo
      ? setInterval(() => {
          if (!document.hidden) consultar();
        }, intervalo)
      : null;
    const alVolver = () => {
      if (!document.hidden) consultar();
    };
    if (intervalo) {
      window.addEventListener('focus', alVolver);
      document.addEventListener('visibilitychange', alVolver);
    }
    return () => {
      control.abort();
      clearInterval(temporizador);
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [ruta, intervalo, publico, intento]);
  return { datos, error, cargando, actualizado, refrescar };
}
