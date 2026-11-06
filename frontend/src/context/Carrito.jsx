import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './Auth.jsx';
import { api } from '../services/api.js';
const Contexto = createContext(null);
export function CarritoProvider({ children }) {
  const { usuario } = useAuth();
  const [carrito, setCarrito] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const generacion = useRef(0);
  const bloqueado = useRef(false);
  const lectura = useRef(0);
  const cargar = useCallback(async () => {
    if (usuario?.rol !== 'CLIENTE' || bloqueado.current) return;
    const solicitud = ++lectura.current;
    const actual = generacion.current;
    setCargando(true);
    try {
      const datos = await api('/carrito');
      if (actual === generacion.current && solicitud === lectura.current) {
        setCarrito(datos);
        setError('');
      }
    } catch (e) {
      if (actual === generacion.current) setError(e.message);
    } finally {
      if (actual === generacion.current) setCargando(false);
    }
  }, [usuario?.id_usuario]);
  useEffect(() => {
    generacion.current++;
    setCarrito(null);
    setError('');
    setCargando(false);
    cargar();
  }, [cargar]);
  async function modificar(ruta, method, body) {
    if (bloqueado.current) return;
    const actual = generacion.current;
    lectura.current++;
    bloqueado.current = true;
    setOcupado(true);
    setError('');
    try {
      const datos = await api(ruta, { method, body });
      if (actual === generacion.current) setCarrito(datos);
      return datos;
    } catch (e) {
      if (actual === generacion.current) setError(e.message);
      throw e;
    } finally {
      bloqueado.current = false;
      setOcupado(false);
    }
  }
  const cantidad =
    carrito?.items?.reduce((n, item) => n + item.cantidad, 0) || 0;
  return (
    <Contexto.Provider
      value={{ carrito, cantidad, cargando, ocupado, error, cargar, modificar }}
    >
      {children}
    </Contexto.Provider>
  );
}
export const useCarrito = () => useContext(Contexto);
