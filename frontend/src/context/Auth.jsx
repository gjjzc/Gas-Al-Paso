import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, sesion } from '../services/api.js';
const Contexto = createContext(null);
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  async function verificar() {
    const actual = ++version.current;
    setCargando(true);
    setError('');
    if (!sesion.leer()) {
      setUsuario(null);
      setCargando(false);
      return;
    }
    try {
      const datos = await api('/auth/me');
      if (actual === version.current) setUsuario(datos);
    } catch (e) {
      if (actual === version.current) {
        setUsuario(null);
        if (sesion.leer()) setError(e.message);
      }
    } finally {
      if (actual === version.current) setCargando(false);
    }
  }
  useEffect(() => {
    verificar();
    const expirar = () => {
      version.current++;
      setCargando(false);
      setUsuario(null);
      setError('Tu sesión terminó. Inicia sesión nuevamente.');
    };
    window.addEventListener('sesion-expirada', expirar);
    return () => window.removeEventListener('sesion-expirada', expirar);
  }, []);
  async function login(datos) {
    const respuesta = await api('/auth/login', {
      method: 'POST',
      body: datos,
      publico: true,
    });
    version.current++;
    setCargando(false);
    sesion.guardar(respuesta.token);
    setUsuario(respuesta.usuario);
    setError('');
    return respuesta.usuario;
  }
  function salir() {
    version.current++;
    setCargando(false);
    sesion.borrar();
    setUsuario(null);
    setError('');
  }
  return (
    <Contexto.Provider
      value={{ usuario, cargando, error, login, salir, verificar }}
    >
      {children}
    </Contexto.Provider>
  );
}
export const useAuth = () => useContext(Contexto);
