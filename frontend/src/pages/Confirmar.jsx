import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Auth.jsx';
import { useCarrito } from '../context/Carrito.jsx';
import { useConsulta } from '../hooks/useConsulta.js';
import { api, clp } from '../services/api.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  ErrorAviso,
  Formulario,
  Tarjeta,
  Totales,
  Vacio,
} from '../components/UI.jsx';
export function Confirmar() {
  const { usuario } = useAuth();
  const { carrito, cargando, error: errorCarrito, cargar } = useCarrito();
  const comunas = useConsulta('/comunas', { publico: true });
  const almacenamiento = `gas-al-paso.confirmacion.${usuario.id_usuario}`;
  const [pendiente, setPendiente] = useState(() => {
    try {
      const guardado = JSON.parse(sessionStorage.getItem(almacenamiento));
      return guardado?.key && guardado?.body && guardado?.carrito
        ? guardado
        : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const bloqueo = useRef(false);
  const navegar = useNavigate();
  useEffect(() => {
    cargar();
  }, [cargar]);
  async function enviar(e) {
    e.preventDefault();
    if (bloqueo.current) return;
    const campos = Object.fromEntries(new FormData(e.currentTarget));
    const datos = pendiente || {
      key: crypto.randomUUID(),
      carrito,
      body: {
        direccion_entrega: {
          calle: campos.calle,
          numero: campos.numero,
          id_comuna: Number(campos.id_comuna),
          referencia: campos.referencia,
        },
        metodo_cobro: campos.metodo_cobro,
      },
    };
    try {
      // Guardar antes de enviar: un timeout no demuestra que Oracle haya revertido.
      sessionStorage.setItem(almacenamiento, JSON.stringify(datos));
      setPendiente(datos);
    } catch {
      setError(
        'No pudimos guardar la solicitud en esta pestaña. Habilita el almacenamiento del navegador para confirmar con seguridad.',
      );
      return;
    }
    bloqueo.current = true;
    setEnviando(true);
    setError('');
    try {
      const pedido = await api('/pedidos', {
        method: 'POST',
        body: datos.body,
        key: datos.key,
      });
      sessionStorage.removeItem(almacenamiento);
      setPendiente(null);
      cargar();
      navegar(`/pedidos/${pedido._id}`, {
        replace: true,
        state: { confirmado: true, pedido },
      });
    } catch (e) {
      setError(e.message);
      if (
        e.estado >= 400 &&
        e.estado < 500 &&
        ![401, 408, 429].includes(e.estado)
      ) {
        sessionStorage.removeItem(almacenamiento);
        setPendiente(null);
        cargar();
      }
    } finally {
      bloqueo.current = false;
      setEnviando(false);
    }
  }
  const resumen = pendiente?.carrito || carrito;
  if (cargando && !resumen) return <Cargando />;
  if (!resumen)
    return <ErrorAviso mensaje={errorCarrito} reintentar={cargar} />;
  if (!resumen.items.length && !pendiente)
    return (
      <Vacio titulo="Tu carrito está vacío">
        Agrega productos antes de confirmar un pedido.
      </Vacio>
    );
  return (
    <>
      <Encabezado etiqueta="A UN PASO DE TU HOGAR" titulo="Confirma tu pedido">
        Revisa tu dirección. El pago se realiza al recibir.
      </Encabezado>
      <ErrorAviso mensaje={error} />
      <ErrorAviso mensaje={errorCarrito} reintentar={cargar} />
      {pendiente && (
        <p className="aviso" role="status">
          Hay una confirmación pendiente de respuesta. Reintenta la misma
          solicitud para comprobar el resultado sin duplicar tu pedido.
        </p>
      )}
      <Formulario onSubmit={enviar} className="formulario dos-columnas">
        <Tarjeta>
          <h2>¿Dónde lo recibes?</h2>
          <p className="muted">
            Dirección guardada: {usuario.direccion_principal}. Confirma calle y
            número por separado.
          </p>
          <ErrorAviso mensaje={comunas.error} reintentar={comunas.refrescar} />
          {comunas.cargando && <Cargando texto="Cargando comunas…" />}
          <fieldset disabled={!!pendiente || enviando}>
            <legend className="sr-only">Datos de entrega</legend>
            <div className="form-grid">
              <Campo label="Calle" name="calle" required maxLength={150} />
              <Campo label="Número" name="numero" required maxLength={20} />
            </div>
            <Campo
              label="Comuna de entrega"
              name="id_comuna"
              defaultValue={usuario.id_comuna || ''}
              required
            >
              <option value="" disabled>
                Selecciona una comuna
              </option>
              {comunas.datos?.map((c) => (
                <option value={c.id_comuna} key={c.id_comuna}>
                  {c.nombre}
                </option>
              ))}
            </Campo>
            <Campo
              label="Referencia (opcional)"
              name="referencia"
              maxLength={200}
              placeholder="Departamento, acceso, indicaciones…"
            />
            <h2 className="separador">¿Cómo prefieres pagar?</h2>
            <Campo
              label="Método de cobro"
              name="metodo_cobro"
              defaultValue="EFECTIVO"
              required
            >
              <option value="EFECTIVO">Efectivo al recibir</option>
              <option value="TRANSFERENCIA">Transferencia al recibir</option>
            </Campo>
          </fieldset>
          {pendiente && (
            <div className="datos-pendientes">
              <strong>Datos enviados</strong>
              <p>
                {pendiente.body.direccion_entrega.calle}{' '}
                {pendiente.body.direccion_entrega.numero}
              </p>
              <p>
                {comunas.datos?.find(
                  (c) =>
                    c.id_comuna === pendiente.body.direccion_entrega.id_comuna,
                )?.nombre ||
                  `Comuna ${pendiente.body.direccion_entrega.id_comuna}`}
              </p>
              <p>{pendiente.body.direccion_entrega.referencia}</p>
              <p>
                {pendiente.body.metodo_cobro === 'EFECTIVO'
                  ? 'Efectivo'
                  : 'Transferencia'}{' '}
                al recibir
              </p>
            </div>
          )}
        </Tarjeta>
        <Tarjeta className="resumen">
          <h2>Tu pedido</h2>
          <ul className="resumen-items">
            {resumen.items.map((i) => (
              <li key={i.id_producto}>
                <span>
                  {i.cantidad} × {i.nombre}
                </span>
                <strong>{clp(i.cantidad * i.precio_unitario)}</strong>
              </li>
            ))}
          </ul>
          <Totales datos={resumen} />
          <p className="nota">
            El total definitivo y el stock se comprueban al confirmar. El
            carrito no reserva productos.
          </p>
          <Boton
            type="submit"
            disabled={
              enviando ||
              (!pendiente &&
                (cargando || !comunas.datos?.length || !!errorCarrito))
            }
          >
            {enviando
              ? 'Confirmando…'
              : pendiente
                ? 'Reintentar confirmación'
                : 'Confirmar pedido'}
          </Boton>
          <p className="nota">Sin pago en línea. Cobro contra entrega.</p>
        </Tarjeta>
      </Formulario>
    </>
  );
}
