import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useConsulta } from '../hooks/useConsulta.js';
import { api, clp, fecha } from '../services/api.js';
import {
  Boton,
  Cargando,
  Encabezado,
  EnlaceBoton,
  ErrorAviso,
  Insignia,
  Tarjeta,
  Totales,
  Vacio,
  estados,
  Tabla,
} from '../components/UI.jsx';
const TAMANO = 10;
export function Pedidos() {
  const [pagina, setPagina] = useState(0);
  const [estado, setEstado] = useState('');
  const consulta = useConsulta(
    `/pedidos/mios?limite=${TAMANO}&offset=${pagina * TAMANO}${estado ? `&estado=${estado}` : ''}`,
    { intervalo: 10000 },
  );
  return (
    <>
      <Encabezado
        etiqueta="SIEMPRE AL TANTO"
        titulo="Mis pedidos"
        accion={<EnlaceBoton to="/catalogo">Hacer un pedido</EnlaceBoton>}
      >
        Sigue cada paso, desde que confirmas hasta que llega a tu puerta.
      </Encabezado>
      <div className="herramientas">
        <label>
          Filtrar por estado{' '}
          <select
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPagina(0);
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(estados).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Boton variante="secundario" onClick={consulta.refrescar}>
          Actualizar
        </Boton>
      </div>
      <p className="nota">
        Actualización automática cada 10 segundos mientras esta pestaña está
        visible.
        {consulta.actualizado &&
          ` Última consulta: ${fecha(consulta.actualizado)}.`}
      </p>
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {consulta.cargando ? (
        <Cargando texto="Consultando tus pedidos…" />
      ) : (
        consulta.datos && (
          <>
            {!consulta.datos.length ? (
              <Vacio
                titulo={
                  estado || pagina
                    ? 'No hay pedidos en esta vista'
                    : 'Tu primer pedido comienza aquí'
                }
              >
                Tus pedidos aparecerán aquí con su estado e historial.
              </Vacio>
            ) : (
              <div className="pedidos-lista">
                {consulta.datos.map((p) => (
                  <Tarjeta as="article" className="pedido-card" key={p._id}>
                    <div>
                      <p className="ceja">PEDIDO #{p.id_venta}</p>
                      <h2>
                        {p.items
                          .map((i) => `${i.cantidad} × ${i.nombre}`)
                          .join(' · ')}
                      </h2>
                      <p className="muted">{fecha(p.creado_en)}</p>
                    </div>
                    <div className="pedido-card-estado">
                      <Insignia estado={p.estado} />
                      <strong>{clp(p.total)}</strong>
                      <Link to={`/pedidos/${p._id}`}>
                        Ver pedido e historial →
                      </Link>
                    </div>
                  </Tarjeta>
                ))}
              </div>
            )}
            <div className="paginacion">
              <Boton
                variante="secundario"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Boton>
              <span>Página {pagina + 1}</span>
              <Boton
                variante="secundario"
                disabled={consulta.datos.length < TAMANO}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
            </div>
          </>
        )
      )}
    </>
  );
}
export function Pedido() {
  const { id } = useParams();
  const location = useLocation();
  const consulta = useConsulta(`/pedidos/${id}`, { intervalo: 5000 });
  const [error, setError] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const pedido =
    consulta.datos ||
    (location.state?.pedido?._id === id ? location.state.pedido : null);
  async function cancelar() {
    if (
      cancelando ||
      !window.confirm(
        '¿Cancelar este pedido? Se anulará la venta y se devolverá el stock.',
      )
    )
      return;
    setCancelando(true);
    setError('');
    try {
      await api(`/pedidos/${id}/cancelar`, { method: 'PATCH' });
      consulta.refrescar();
    } catch (e) {
      setError(e.message);
      consulta.refrescar();
    } finally {
      setCancelando(false);
    }
  }
  return (
    <>
      <Encabezado
        etiqueta="EL CAMINO A TU PUERTA"
        titulo={pedido ? `Pedido #${pedido.id_venta}` : 'Tu pedido'}
        accion={
          <EnlaceBoton to="/pedidos" variante="secundario">
            Volver a mis pedidos
          </EnlaceBoton>
        }
      >
        El estado se consulta automáticamente cada 5 segundos.
      </Encabezado>
      {location.state?.confirmado && (
        <p className="aviso aviso-exito" role="status">
          ¡Pedido confirmado! El total definitivo aparece a continuación.
          Pagarás al recibir.
        </p>
      )}
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      <ErrorAviso mensaje={error} />
      {consulta.cargando && !pedido ? (
        <Cargando />
      ) : (
        pedido && (
          <>
            <div className="pedido-estado">
              <Insignia estado={pedido.estado} />
              <p aria-live="polite" className="muted">
                Estado actual: {estados[pedido.estado] || pedido.estado}
              </p>
              <small>Última consulta: {fecha(consulta.actualizado)}</small>
            </div>
            {pedido.sincronizacion === 'PENDIENTE' && (
              <p className="aviso">
                Tu pedido está guardado. Estamos actualizando su historial en el
                sistema.
              </p>
            )}
            <div className="dos-columnas">
              <div className="detalle-principal">
                <Tarjeta>
                  <h2>Historial del pedido</h2>
                  <ol className="historial">
                    {pedido.historial_estados.map((h, indice) => (
                      <li
                        key={`${indice}-${h.estado}`}
                        className={
                          indice === pedido.historial_estados.length - 1
                            ? 'actual'
                            : ''
                        }
                      >
                        <span className="historial-punto" />
                        <div>
                          <strong>{estados[h.estado] || h.estado}</strong>
                          <time dateTime={h.fecha}>{fecha(h.fecha)}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Tarjeta>
                <Tarjeta>
                  <h2>Productos</h2>
                  <Tabla
                    titulo="Detalle de productos del pedido"
                    columnas={[
                      'Producto',
                      'Cantidad',
                      'Precio unitario',
                      'Importe',
                    ]}
                  >
                    {pedido.items.map((i) => (
                      <tr key={i.id_producto}>
                        <td>{i.nombre}</td>
                        <td>{i.cantidad}</td>
                        <td>{clp(i.precio_unitario)}</td>
                        <td>{clp(i.cantidad * i.precio_unitario)}</td>
                      </tr>
                    ))}
                  </Tabla>
                </Tarjeta>
              </div>
              <div className="detalle-lateral">
                <Tarjeta>
                  <h2>Entrega y cobro</h2>
                  <p>
                    <strong>
                      {pedido.direccion_entrega.calle}{' '}
                      {pedido.direccion_entrega.numero}
                    </strong>
                    <br />
                    {pedido.direccion_entrega.comuna}
                  </p>
                  {pedido.direccion_entrega.referencia && (
                    <p className="muted">
                      {pedido.direccion_entrega.referencia}
                    </p>
                  )}
                  <p>
                    Repartidor: {pedido.repartidor?.nombre || 'Por asignar'}
                  </p>
                  <p>
                    {pedido.metodo_cobro === 'TRANSFERENCIA'
                      ? 'Transferencia'
                      : 'Efectivo'}{' '}
                    contra entrega
                  </p>
                  <p className="nota">
                    Pago:{' '}
                    {pedido.estado_pago === 'COBRADA'
                      ? `Cobrado · ${pedido.metodo_pago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}`
                      : pedido.estado_pago === 'ANULADA'
                        ? 'Anulado'
                        : 'Pendiente de cobro'}
                  </p>
                  <Totales datos={pedido} />
                </Tarjeta>
                {pedido.estado === 'RECIBIDO' && (
                  <Tarjeta>
                    <h2>¿Cambiaste de planes?</h2>
                    <p className="nota">
                      Puedes cancelar mientras el pedido esté recibido y aún no
                      tenga repartidor asignado.
                    </p>
                    <Boton
                      variante="peligro"
                      disabled={cancelando || !!consulta.error}
                      onClick={cancelar}
                    >
                      {cancelando ? 'Cancelando…' : 'Cancelar pedido'}
                    </Boton>
                  </Tarjeta>
                )}
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}
