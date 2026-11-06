import { useRef, useState } from 'react';
import { useAuth } from '../context/Auth.jsx';
import { api, nuevaClave } from '../services/api.js';

// Conservar el cuerpo y la clave permite recuperar una respuesta perdida sin repetir la venta/cierre.
export function useOperacion(tipo) {
  const { usuario } = useAuth();
  const almacenamiento = `gas-al-paso.operacion.${usuario.id_usuario}.${tipo}`;
  const [pendiente, setPendiente] = useState(() => {
    try {
      const valor = JSON.parse(sessionStorage.getItem(almacenamiento));
      return valor?.ruta && valor?.body && valor?.key ? valor : null;
    } catch {
      return null;
    }
  });
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const bloqueo = useRef(false);
  async function ejecutar(datos) {
    if (bloqueo.current) return;
    const solicitud = pendiente || { ...datos, key: nuevaClave() };
    try {
      sessionStorage.setItem(almacenamiento, JSON.stringify(solicitud));
    } catch {
      setError(
        'Habilita el almacenamiento de esta pestaña para confirmar con seguridad.',
      );
      return;
    }
    bloqueo.current = true;
    setEnviando(true);
    setError('');
    setPendiente(solicitud);
    try {
      const respuesta = await api(solicitud.ruta, {
        method: solicitud.method || 'POST',
        body: solicitud.body,
        key: solicitud.key,
      });
      sessionStorage.removeItem(almacenamiento);
      setPendiente(null);
      setResultado(respuesta);
      return respuesta;
    } catch (e) {
      setError(e.message);
      if (
        e.estado >= 400 &&
        e.estado < 500 &&
        ![401, 408, 429].includes(e.estado)
      ) {
        sessionStorage.removeItem(almacenamiento);
        setPendiente(null);
      }
    } finally {
      bloqueo.current = false;
      setEnviando(false);
    }
  }
  function nueva() {
    if (!pendiente) {
      setResultado(null);
      setError('');
    }
  }
  return { pendiente, resultado, error, enviando, ejecutar, nueva };
}
