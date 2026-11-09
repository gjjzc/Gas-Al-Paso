import { useRef, useState } from 'react';
import { api } from '../services/api.js';
// CRUD sin reintentos automaticos: ante una respuesta perdida, revisar el listado.
export function useAccion() {
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const bloqueo = useRef(false);
  async function ejecutar(ruta, method, body, mensaje = 'Cambios guardados.') {
    if (bloqueo.current) return null;
    bloqueo.current = true;
    setEnviando(true);
    setError('');
    setAviso('');
    try {
      const r = await api(ruta, { method, body });
      setAviso(mensaje);
      return r;
    } catch (e) {
      setError(
        e.message +
          ((!e.estado || e.estado >= 500) && method === 'POST'
            ? ' Revisa el listado antes de repetir: la operación podría haberse guardado.'
            : ''),
      );
      return null;
    } finally {
      bloqueo.current = false;
      setEnviando(false);
    }
  }
  function limpiar() {
    setError('');
    setAviso('');
  }
  return { ejecutar, error, aviso, enviando, limpiar };
}
