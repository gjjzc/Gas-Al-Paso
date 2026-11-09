import { useEffect, useRef, useState } from 'react';
import { api, fecha } from '../services/api.js';
import { telefonoParcial } from '../services/telefono.js';
import { Boton, Campo, Cargando, ErrorAviso } from './UI.jsx';
export function BuscadorClientes({ onElegir, onCrear }) {
  const [texto, setTexto] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [intento, setIntento] = useState(0);
  const version = useRef(0);
  const digitos = telefonoParcial(texto);
  function cambiar(e) {
    version.current++;
    setTexto(e.target.value);
    setDatos(null);
    setError('');
    setCargando(false);
  }
  useEffect(() => {
    const actual = ++version.current;
    const control = new AbortController();
    setDatos(null);
    setError('');
    if (digitos.length < 4) {
      setCargando(false);
      return () => control.abort();
    }
    setCargando(true);
    const timer = setTimeout(async () => {
      try {
        const resultados = await api(
          `/clientes?telefono=${encodeURIComponent(digitos)}`,
          { signal: control.signal },
        );
        if (!control.signal.aborted && actual === version.current)
          setDatos(resultados);
      } catch (e) {
        if (!control.signal.aborted && actual === version.current)
          setError(e.message);
      } finally {
        if (!control.signal.aborted && actual === version.current)
          setCargando(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      control.abort();
    };
  }, [texto, intento]);
  return (
    <section
      className="buscador-clientes"
      aria-label="Búsqueda de clientes por teléfono"
    >
      <Campo
        label="Buscar cliente por teléfono"
        type="search"
        inputMode="tel"
        value={texto}
        onChange={cambiar}
        maxLength={40}
        ayuda="Escribe al menos 4 dígitos. Puedes usar los últimos cuatro del teléfono; máximo 10 resultados."
      />
      {texto && digitos.length < 4 && (
        <p className="nota">Ingresa entre 4 y 9 dígitos válidos para buscar.</p>
      )}
      <ErrorAviso mensaje={error} reintentar={() => setIntento((n) => n + 1)} />
      {cargando && <Cargando texto="Buscando clientes…" />}
      {datos && (
        <>
          {datos.length > 0 ? (
            <ul className="resultados-clientes">
              {datos.map((c) => (
                <li key={c.id_cliente}>
                  <div>
                    <strong>{c.nombre}</strong>
                    <span>{c.telefono}</span>
                    <p>
                      {c.direccion_principal} · {c.comuna}
                    </p>
                    <small>
                      {c.cantidad_pedidos} pedidos · Último:{' '}
                      {c.fecha_ultimo_pedido
                        ? fecha(c.fecha_ultimo_pedido)
                        : 'Sin pedidos'}
                    </small>
                  </div>
                  <Boton
                    variante="secundario"
                    onClick={() => onElegir(c.id_cliente)}
                    aria-label={`Ver ficha de ${c.nombre}`}
                  >
                    Ver ficha
                  </Boton>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sin-resultados-clientes">
              <p role="status">Sin resultados para ese teléfono.</p>
              <Boton onClick={() => onCrear(digitos)}>
                Crear cliente y pedido
              </Boton>
              <p className="nota">
                Si buscaste solo una parte, completa los 9 dígitos antes de
                confirmar el pedido.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
