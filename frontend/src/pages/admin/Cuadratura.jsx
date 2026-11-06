import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConsulta } from '../../hooks/useConsulta.js';
import { clp } from '../../services/api.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  ErrorAviso,
  Formulario,
  Tabla,
  Tarjeta,
} from '../../components/UI.jsx';
export function Cuadratura() {
  const [filtros, setFiltros] = useState({});
  const [personas, setPersonas] = useState({});
  const reps = useConsulta('/repartidores');
  const consulta = useConsulta(`/cuadratura?${new URLSearchParams(filtros)}`);
  useEffect(() => {
    if (consulta.datos)
      setPersonas((a) => ({
        ...a,
        ...Object.fromEntries(
          consulta.datos.repartidores.map((r) => [r.id_empleado, r.nombre]),
        ),
      }));
  }, [consulta.datos]);
  const opciones = {
    ...Object.fromEntries(
      (reps.datos || []).map((r) => [r.id_empleado, r.nombre]),
    ),
    ...personas,
  };
  return (
    <>
      <Encabezado
        etiqueta="CONTROL Y CUADRATURA"
        titulo="Cuadratura diaria"
        accion={
          <Boton variante="secundario" onClick={consulta.refrescar}>
            Actualizar cuadratura
          </Boton>
        }
      >
        Dinero por método y balones por producto. Los descuadres no se compensan
        entre sí.
      </Encabezado>
      <Tarjeta className="filtros-admin">
        <Formulario
          onSubmit={(e) => {
            e.preventDefault();
            setFiltros(
              Object.fromEntries(
                [...new FormData(e.currentTarget)].filter(([, v]) => v),
              ),
            );
          }}
        >
          <Campo label="Fecha de cuadratura" name="fecha" type="date" />
          <Campo
            label="Trabajador de cuadratura"
            name="id_empleado"
            defaultValue=""
          >
            <option value="">Todos los trabajadores</option>
            {Object.entries(opciones).map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </Campo>
          <Boton type="submit">Consultar cuadratura</Boton>
        </Formulario>
      </Tarjeta>
      <ErrorAviso mensaje={reps.error} reintentar={reps.refrescar} />
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {consulta.cargando ? (
        <Cargando />
      ) : (
        consulta.datos && (
          <>
            <p className="nota">
              Fecha de cobro: {consulta.datos.fecha}. Incluye trabajadores con
              actividad histórica aunque estén inactivos o hayan cambiado de
              rol.
            </p>
            <div className="indicadores-jornada">
              <Tarjeta>
                <small>Jornadas abiertas</small>
                <strong>{consulta.datos.resumen.abiertos}</strong>
              </Tarjeta>
              <Tarjeta>
                <small>Cierres guardados</small>
                <strong>{consulta.datos.resumen.cerrados}</strong>
              </Tarjeta>
              <Tarjeta>
                <small>Con descuadre</small>
                <strong
                  className={
                    consulta.datos.resumen.con_descuadre ? 'texto-error' : ''
                  }
                >
                  {consulta.datos.resumen.con_descuadre}
                </strong>
              </Tarjeta>
            </div>
            <div className="cuadraturas-admin">
              {consulta.datos.repartidores.map((r) => (
                <Tarjeta
                  as="article"
                  key={r.id_empleado}
                  className={r.descuadre ? 'trabajador-descuadre' : ''}
                >
                  <header className="cuadratura-cabecera">
                    <div>
                      <h2>{r.nombre}</h2>
                      <p className="nota">
                        {r.activo ? 'Activo' : 'Inactivo'} · {r.ventas.cantidad}{' '}
                        ventas cobradas
                      </p>
                    </div>
                    <span
                      className={`insignia ${r.estado === 'CUADRADO' ? 'estado-ENTREGADO' : r.estado === 'DESCUADRE' ? 'estado-CANCELADO' : 'estado-RECIBIDO'}`}
                    >
                      {r.estado === 'CUADRADO'
                        ? 'Cuadrado'
                        : r.estado === 'DESCUADRE'
                          ? 'Descuadre'
                          : 'Abierto'}
                    </span>
                  </header>
                  <dl className="resumen-cuadratura">
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{clp(r.ventas.subtotal)}</dd>
                    </div>
                    <div>
                      <dt>Descuentos</dt>
                      <dd>{clp(r.ventas.descuento)}</dd>
                    </div>
                    <div>
                      <dt>Total cobrado</dt>
                      <dd>{clp(r.ventas.total)}</dd>
                    </div>
                    <div className={r.dinero.descuadre ? 'texto-error' : ''}>
                      <dt>Diferencia dinero</dt>
                      <dd>
                        {r.cierre
                          ? clp(r.dinero.total.diferencia)
                          : 'Por declarar'}
                      </dd>
                    </div>
                  </dl>
                  <details>
                    <summary>Ver cuadratura de {r.nombre}</summary>
                    <h3>Dinero por método</h3>
                    <Tabla
                      titulo="Comparación de dinero"
                      columnas={[
                        'Método',
                        'Esperado',
                        'Entregado',
                        'Diferencia',
                      ]}
                    >
                      {['efectivo', 'transferencia', 'total'].map((k) => (
                        <tr
                          className={
                            r.dinero[k].descuadre ? 'fila-descuadre' : ''
                          }
                          key={k}
                        >
                          <th scope="row">
                            {k === 'efectivo'
                              ? 'Efectivo'
                              : k === 'transferencia'
                                ? 'Transferencia'
                                : 'Total'}
                          </th>
                          <td>{clp(r.dinero[k].esperado)}</td>
                          <td>
                            {r.cierre
                              ? clp(r.dinero[k].entregado)
                              : 'Por declarar'}
                          </td>
                          <td>
                            {r.cierre
                              ? clp(r.dinero[k].diferencia)
                              : 'Por declarar'}
                          </td>
                        </tr>
                      ))}
                    </Tabla>
                    <h3 className="seccion-admin">Productos vendidos</h3>
                    <Tabla
                      titulo="Todos los productos cobrados, incluidos accesorios"
                      columnas={[
                        'Producto',
                        'Unidades',
                        'Subtotal',
                        'Descuento',
                        'Total',
                      ]}
                    >
                      {r.productos_vendidos?.map((p) => (
                        <tr key={p.id_producto}>
                          <td>{p.nombre}</td>
                          <td>{p.cantidad}</td>
                          <td>{clp(p.subtotal)}</td>
                          <td>{clp(p.descuento)}</td>
                          <td>{clp(p.total)}</td>
                        </tr>
                      ))}
                    </Tabla>
                    {!r.productos_vendidos?.length && (
                      <p className="nota">Sin productos cobrados.</p>
                    )}
                    <h3 className="seccion-admin">Balones de control</h3>
                    <Tabla
                      titulo="Vendido + devuelto − cargado"
                      columnas={[
                        'Producto',
                        'Cargado',
                        'Vendido',
                        'Devuelto',
                        'Diferencia',
                      ]}
                    >
                      {r.balones.map((b) => (
                        <tr
                          className={b.descuadre ? 'fila-descuadre' : ''}
                          key={b.id_producto}
                        >
                          <td>{b.nombre}</td>
                          <td>{b.cargado}</td>
                          <td>{b.vendido}</td>
                          <td>{r.cierre ? b.devuelto : 'Por declarar'}</td>
                          <td>{r.cierre ? b.diferencia : 'Por declarar'}</td>
                        </tr>
                      ))}
                    </Tabla>
                    {!r.balones.length && (
                      <p className="nota">Sin movimiento de balones.</p>
                    )}
                    {r.cierre?.desactualizado && (
                      <p className="aviso aviso-error">
                        Los movimientos actuales difieren del cierre original.
                        Requiere revisión.
                      </p>
                    )}
                    {r.cierre?.observacion && (
                      <p className="aviso">
                        Observación: {r.cierre.observacion}
                      </p>
                    )}
                    {!!r.pedidos_sin_resolver.length && (
                      <div className="aviso">
                        <span>
                          {r.pedidos_sin_resolver.length} pedidos sin resolver:
                        </span>
                        {r.pedidos_sin_resolver.map((p) => (
                          <Link
                            key={p.id_venta}
                            to={`/admin/pedidos/${p.id_pedido_mongo}`}
                          >
                            Pedido #{p.id_venta}
                          </Link>
                        ))}
                      </div>
                    )}
                  </details>
                </Tarjeta>
              ))}
            </div>
            {!consulta.datos.repartidores.length && (
              <Tarjeta className="vacio">
                <h2>No hay trabajadores para esta selección</h2>
              </Tarjeta>
            )}
          </>
        )
      )}
    </>
  );
}
