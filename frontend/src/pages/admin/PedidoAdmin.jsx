import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useAccion } from '../../hooks/useAccion.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  EnlaceBoton,
  ErrorAviso,
  Insignia,
  Tarjeta,
  Totales,
  estados,
} from '../../components/UI.jsx';
import { Confirmacion } from '../../components/Confirmacion.jsx';
import { AvisosAccion } from '../../components/Admin.jsx';
import { clp, fecha } from '../../services/api.js';
import { pago } from '../../components/Repartidor.jsx';
function Asignacion({ pedido, ejecutar, ocupado, cancelar }) {
  const comunas = useConsulta('/comunas', { publico: true });
  const idComuna =
    pedido.direccion_entrega.id_comuna ||
    comunas.datos?.find((c) => c.nombre === pedido.direccion_entrega.comuna)
      ?.id_comuna;
  const reps = useConsulta(
    `/repartidores${idComuna ? `?comuna=${idComuna}` : ''}`,
  );
  const [id, setId] = useState('');
  return (
    <Confirmacion
      titulo="Asignar repartidor"
      texto="Confirmar asignación"
      cancelar={cancelar}
      ocupado={ocupado}
      inhabilitado={!id || reps.cargando || !!reps.error || !idComuna}
      aceptar={() => ejecutar(Number(id))}
    >
      <p>
        Pedido #{pedido.id_venta} · {pedido.direccion_entrega.comuna}
      </p>
      <ErrorAviso mensaje={comunas.error} reintentar={comunas.refrescar} />
      <ErrorAviso mensaje={reps.error} reintentar={reps.refrescar} />
      {comunas.cargando || reps.cargando ? (
        <Cargando />
      ) : (
        <>
          <Campo
            label="Repartidor para el pedido"
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            <option value="" disabled>
              Selecciona un repartidor
            </option>
            <optgroup label="Cubren la comuna">
              {reps.datos
                ?.filter((r) => r.cubre_comuna)
                .map((r) => (
                  <option key={r.id_empleado} value={r.id_empleado}>
                    {r.nombre} · Cubre la comuna
                  </option>
                ))}
            </optgroup>
            <optgroup label="Otros repartidores">
              {reps.datos
                ?.filter((r) => !r.cubre_comuna)
                .map((r) => (
                  <option key={r.id_empleado} value={r.id_empleado}>
                    {r.nombre} · Fuera de cobertura
                  </option>
                ))}
            </optgroup>
          </Campo>
          <p className="nota">
            Primero aparecen los repartidores de la comuna. También puedes
            asignar otro; una jornada ya cerrada será rechazada.
          </p>
          {!idComuna && (
            <p className="aviso aviso-error">
              No se pudo identificar la comuna de este pedido.
            </p>
          )}
        </>
      )}
    </Confirmacion>
  );
}
export function PedidoAdmin() {
  const { id } = useParams();
  const navegar = useNavigate();
  const consulta = useConsulta(`/pedidos/${id}`, { intervalo: 10000 });
  const accion = useAccion();
  const [modal, setModal] = useState('');
  const [metodo, setMetodo] = useState('');
  const p = consulta.datos;
  async function guardar(ruta, method, body, mensaje) {
    const r = await accion.ejecutar(ruta, method, body, mensaje);
    setModal('');
    if (r && method === 'DELETE') navegar('/admin/pedidos');
    else consulta.refrescar();
  }
  return (
    <>
      <Encabezado
        etiqueta="GESTIÓN DEL PEDIDO"
        titulo={p ? `Pedido #${p.id_venta}` : 'Pedido'}
        accion={
          <EnlaceBoton variante="secundario" to="/admin/pedidos">
            Volver al tablero
          </EnlaceBoton>
        }
      />
      <AvisosAccion accion={accion} />
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {consulta.cargando ? (
        <Cargando />
      ) : (
        p && (
          <>
            <div className="pedido-estado">
              <Insignia estado={p.estado} />
              <p>
                {p.canal === 'LLAMADA' ? 'Pedido telefónico' : 'Pedido web'} ·{' '}
                {fecha(p.creado_en)}
              </p>
            </div>
            <div className="dos-columnas">
              <div className="detalle-principal">
                <Tarjeta>
                  <h2>Cliente y entrega</h2>
                  <h3>{p.cliente.nombre}</h3>
                  <p>{p.cliente.telefono}</p>
                  <p>
                    <strong>
                      {p.direccion_entrega.calle} {p.direccion_entrega.numero}
                    </strong>
                    <br />
                    {p.direccion_entrega.comuna}
                  </p>
                  <p>{p.direccion_entrega.referencia}</p>
                  <p>
                    Repartidor:{' '}
                    <strong>{p.repartidor?.nombre || 'Sin asignar'}</strong>
                  </p>
                  <p>Cobro solicitado: {pago(p.metodo_cobro)}</p>
                  {p.metodo_pago && <p>Pago real: {pago(p.metodo_pago)}</p>}
                  <div className="acciones-flex">
                    {['RECIBIDO', 'ASIGNADO'].includes(p.estado) && (
                      <Boton
                        disabled={accion.enviando || !!consulta.error}
                        onClick={() => setModal('asignar')}
                      >
                        {p.repartidor
                          ? 'Reasignar repartidor'
                          : 'Asignar repartidor'}
                      </Boton>
                    )}
                    {['ASIGNADO', 'EN_CAMINO'].includes(p.estado) && (
                      <Boton
                        disabled={accion.enviando || !!consulta.error}
                        onClick={() => {
                          setModal('estado');
                          setMetodo('');
                        }}
                      >
                        {p.estado === 'ASIGNADO'
                          ? 'Marcar en camino'
                          : 'Entregar y cobrar'}
                      </Boton>
                    )}
                    {!['ENTREGADO', 'CANCELADO'].includes(p.estado) && (
                      <Boton
                        variante="peligro"
                        disabled={accion.enviando}
                        onClick={() => setModal('cancelar')}
                      >
                        Cancelar pedido
                      </Boton>
                    )}
                    {p.estado === 'CANCELADO' && (
                      <Boton
                        variante="peligro"
                        disabled={accion.enviando}
                        onClick={() => setModal('eliminar')}
                      >
                        Eliminar pedido cancelado
                      </Boton>
                    )}
                  </div>
                </Tarjeta>
                <Tarjeta>
                  <h2>Historial</h2>
                  <ol className="historial">
                    {p.historial_estados.map((h, i) => (
                      <li key={i}>
                        <strong>{estados[h.estado]}</strong>
                        <time dateTime={h.fecha}>{fecha(h.fecha)}</time>
                      </li>
                    ))}
                  </ol>
                </Tarjeta>
              </div>
              <Tarjeta>
                <h2>Importes y productos</h2>
                <ul className="resumen-items">
                  {p.items.map((i) => (
                    <li key={i.id_producto}>
                      <span>
                        {i.cantidad} × {i.nombre}
                      </span>
                      <strong>{clp(i.cantidad * i.precio_unitario)}</strong>
                    </li>
                  ))}
                </ul>
                <Totales datos={p} />
                <p className="nota">Pago: {p.estado_pago}</p>
                {p.sincronizacion === 'PENDIENTE' && (
                  <p className="aviso">
                    Guardado en Oracle; sincronización pendiente.
                  </p>
                )}
              </Tarjeta>
            </div>
            {modal === 'asignar' && (
              <Asignacion
                pedido={p}
                ocupado={accion.enviando}
                cancelar={() => setModal('')}
                ejecutar={(empleado) =>
                  guardar(
                    `/pedidos/${id}/asignar`,
                    'PATCH',
                    { id_empleado: empleado },
                    'Repartidor asignado.',
                  )
                }
              />
            )}
            {modal === 'estado' && (
              <Confirmacion
                titulo={
                  p.estado === 'ASIGNADO'
                    ? 'Confirmar salida'
                    : 'Confirmar entrega y cobro'
                }
                texto={
                  p.estado === 'ASIGNADO'
                    ? 'Confirmar en camino'
                    : 'Confirmar entrega'
                }
                ocupado={accion.enviando}
                cancelar={() => setModal('')}
                inhabilitado={p.estado === 'EN_CAMINO' && !metodo}
                aceptar={() =>
                  guardar(
                    `/pedidos/${id}/estado`,
                    'PATCH',
                    {
                      estado:
                        p.estado === 'ASIGNADO' ? 'EN_CAMINO' : 'ENTREGADO',
                      ...(p.estado === 'EN_CAMINO'
                        ? { metodo_pago: metodo }
                        : {}),
                    },
                    'Estado actualizado.',
                  )
                }
              >
                <p>
                  Pedido #{p.id_venta} · {clp(p.total)}
                </p>
                {p.estado === 'EN_CAMINO' ? (
                  <>
                    <p>Confirma la entrega y el dinero recibido.</p>
                    <Campo
                      label="Método de pago real"
                      value={metodo}
                      onChange={(e) => setMetodo(e.target.value)}
                    >
                      <option value="" disabled>
                        Selecciona el pago recibido
                      </option>
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                    </Campo>
                  </>
                ) : (
                  <p>El cliente verá su pedido en camino.</p>
                )}
              </Confirmacion>
            )}
            {['cancelar', 'eliminar'].includes(modal) && (
              <Confirmacion
                titulo={
                  modal === 'cancelar'
                    ? 'Cancelar pedido'
                    : 'Eliminar pedido cancelado'
                }
                ocupado={accion.enviando}
                cancelar={() => setModal('')}
                texto={
                  modal === 'cancelar'
                    ? 'Confirmar cancelación'
                    : 'Eliminar pedido'
                }
                aceptar={() =>
                  modal === 'cancelar'
                    ? guardar(
                        `/pedidos/${id}/cancelar`,
                        'PATCH',
                        undefined,
                        'Pedido cancelado y stock repuesto.',
                      )
                    : guardar(
                        `/pedidos/${id}`,
                        'DELETE',
                        undefined,
                        'Pedido eliminado.',
                      )
                }
              >
                <p>
                  {modal === 'cancelar'
                    ? 'Se anulará la venta y se repondrá el stock.'
                    : 'Se eliminará el documento del pedido; se conserva la venta anulada y su auditoría.'}
                </p>
              </Confirmacion>
            )}
          </>
        )
      )}
    </>
  );
}
