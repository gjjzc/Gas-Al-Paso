import { ImagenProducto } from '../../components/ImagenProducto.jsx';
import { useState } from 'react';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useOperacion } from '../../hooks/useOperacion.js';
import { clp, fecha } from '../../services/api.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  ErrorAviso,
  Insignia,
  Tarjeta,
  estados,
} from '../../components/UI.jsx';
import { Confirmacion } from '../../components/Confirmacion.jsx';
import { OperacionPendiente, pago } from '../../components/Repartidor.jsx';
export function PedidosAsignados() {
  const [pagina, setPagina] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [metodo, setMetodo] = useState('');
  const consulta = useConsulta(
    `/pedidos/asignados?limite=10&offset=${pagina * 10}${filtro ? `&estado=${filtro}` : ''}`,
    { intervalo: 10000 },
  );
  const operacion = useOperacion('estado-pedido');
  async function confirmar() {
    const r = await operacion.ejecutar({
      ruta: `/pedidos/${seleccion._id}/estado`,
      method: 'PATCH',
      body: {
        estado: seleccion.estado === 'ASIGNADO' ? 'EN_CAMINO' : 'ENTREGADO',
        ...(seleccion.estado === 'EN_CAMINO' ? { metodo_pago: metodo } : {}),
      },
      vista: {
        titulo: `Pedido #${seleccion.id_venta}`,
        total: seleccion.total,
      },
    });
    setSeleccion(null);
    if (r) consulta.refrescar();
  }
  async function reintentar() {
    const r = await operacion.ejecutar();
    if (r) consulta.refrescar();
  }
  return (
    <>
      <Encabezado
        etiqueta="TU RUTA DE HOY"
        titulo="Pedidos asignados"
        accion={
          <Boton variante="secundario" onClick={consulta.refrescar}>
            Actualizar pedidos
          </Boton>
        }
      >
        Dirección, cobro y próximos pasos, a mano.
      </Encabezado>
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      <ErrorAviso mensaje={operacion.error} />
      <OperacionPendiente operacion={operacion} reintentar={reintentar} />
      {operacion.resultado && (
        <p className="aviso aviso-exito" role="status">
          Pedido #{operacion.resultado.id_venta}:{' '}
          {estados[operacion.resultado.estado]}.{' '}
          {operacion.resultado.estado === 'ENTREGADO' &&
            `Cobrado por ${pago(operacion.resultado.metodo_pago)}.`}
        </p>
      )}
      <Campo
        label="Ver pedidos"
        value={filtro}
        onChange={(e) => {
          setFiltro(e.target.value);
          setPagina(0);
        }}
      >
        <option value="">Todos los asignados a mí</option>
        <option value="ASIGNADO">Por iniciar</option>
        <option value="EN_CAMINO">En camino</option>
        <option value="ENTREGADO">Entregados</option>
        <option value="CANCELADO">Cancelados</option>
      </Campo>
      <p className="nota">
        Se actualiza cada 10 segundos con la pestaña visible.{' '}
        {consulta.actualizado &&
          `Última consulta: ${fecha(consulta.actualizado)}.`}
      </p>
      {consulta.cargando ? (
        <Cargando />
      ) : (
        consulta.datos && (
          <>
            <div className="ruta-pedidos">
              {consulta.datos.map((p) => (
                <Tarjeta as="article" className="ruta-pedido" key={p._id}>
                  <header>
                    <div>
                      <p className="ceja">PEDIDO #{p.id_venta}</p>
                      <h2>{p.cliente.nombre}</h2>
                    </div>
                    <Insignia estado={p.estado} />
                  </header>
                  <address>
                    <strong>
                      {p.direccion_entrega.calle} {p.direccion_entrega.numero}
                    </strong>
                    <span>{p.direccion_entrega.comuna}</span>
                    {p.direccion_entrega.referencia && (
                      <span className="muted">
                        {p.direccion_entrega.referencia}
                      </span>
                    )}
                  </address>
                  <div className="cobro-pedido">
                    <span>
                      Solicitado: <strong>{pago(p.metodo_cobro)}</strong>
                    </span>
                    <strong>{clp(p.total)}</strong>
                  </div>
                  {p.metodo_pago && (
                    <p className="nota">Pago real: {pago(p.metodo_pago)}</p>
                  )}
                  <a
                    className="boton boton-secundario llamar"
                    href={`tel:${p.cliente.telefono.replace(/[^\d+]/g, '')}`}
                  >
                    Llamar al cliente
                  </a>
                  <details>
                    <summary>Productos e historial</summary>
                    <ul className="resumen-items">
                      {p.items.map((i) => (
                        <li key={i.id_producto}>
                          <span className="producto-con-foto"><ImagenProducto producto={i} className="foto-mini" />
                            {i.cantidad} × {i.nombre}
                          </span>
                          <strong>{clp(i.cantidad * i.precio_unitario)}</strong>
                        </li>
                      ))}
                    </ul>
                    <ol className="historial">
                      {p.historial_estados.map((h, i) => (
                        <li key={i}>
                          <strong>{estados[h.estado]}</strong>
                          <time dateTime={h.fecha}>{fecha(h.fecha)}</time>
                        </li>
                      ))}
                    </ol>
                  </details>
                  {['ASIGNADO', 'EN_CAMINO'].includes(p.estado) && (
                    <Boton
                      className="accion-ruta"
                      disabled={
                        operacion.enviando ||
                        !!operacion.pendiente ||
                        !!consulta.error
                      }
                      onClick={() => {
                        setSeleccion(p);
                        setMetodo('');
                      }}
                    >
                      {p.estado === 'ASIGNADO'
                        ? 'Iniciar camino'
                        : 'Entregar y cobrar'}
                    </Boton>
                  )}
                </Tarjeta>
              ))}
            </div>
            {!consulta.datos.length && (
              <Tarjeta className="vacio">
                <h2>No hay pedidos en esta vista</h2>
                <p>
                  Los nuevos pedidos que te asigne administración aparecerán
                  aquí.
                </p>
              </Tarjeta>
            )}
            <div className="paginacion">
              <Boton
                variante="secundario"
                disabled={!pagina}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Boton>
              <span>Página {pagina + 1}</span>
              <Boton
                variante="secundario"
                disabled={consulta.datos.length < 10}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
            </div>
          </>
        )
      )}
      {seleccion && (
        <Confirmacion
          titulo={
            seleccion.estado === 'ASIGNADO'
              ? '¿Iniciar el camino?'
              : 'Confirmar entrega y cobro'
          }
          cancelar={() => setSeleccion(null)}
          ocupado={operacion.enviando}
          inhabilitado={seleccion.estado === 'EN_CAMINO' && !metodo}
          texto={
            seleccion.estado === 'ASIGNADO'
              ? 'Confirmar en camino'
              : 'Confirmar entrega'
          }
          aceptar={() => {
            if (seleccion.estado === 'EN_CAMINO' && !metodo) return;
            confirmar();
          }}
        >
          <p>
            Pedido #{seleccion.id_venta} · {seleccion.cliente.nombre}
          </p>
          <p>
            <strong>
              {seleccion.direccion_entrega.calle}{' '}
              {seleccion.direccion_entrega.numero}
            </strong>
          </p>
          {seleccion.estado === 'EN_CAMINO' ? (
            <>
              <p>
                Confirma que entregaste los productos y recibiste{' '}
                <strong>{clp(seleccion.total)}</strong>.
              </p>
              <p className="nota">
                El cliente solicitó {pago(seleccion.metodo_cobro)}. Registra
                cómo pagó realmente.
              </p>
              <Campo
                label="Método de pago real"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                required
              >
                <option value="" disabled>
                  Selecciona el pago recibido
                </option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </Campo>
              {!metodo && (
                <p className="nota">
                  Selecciona un método para poder confirmar.
                </p>
              )}
            </>
          ) : (
            <p>El cliente verá que su pedido está en camino.</p>
          )}
        </Confirmacion>
      )}
    </>
  );
}
