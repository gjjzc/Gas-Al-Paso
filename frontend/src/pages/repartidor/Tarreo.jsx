import { useState } from 'react';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useOperacion } from '../../hooks/useOperacion.js';
import { calcularImportes } from '../../services/importes.js';
import { clp } from '../../services/api.js';
import { Balon } from '../../components/Ilustraciones.jsx';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  EnlaceBoton,
  ErrorAviso,
  Tarjeta,
  Totales,
} from '../../components/UI.jsx';
import { Confirmacion } from '../../components/Confirmacion.jsx';
import { OperacionPendiente, pago } from '../../components/Repartidor.jsx';
export function Tarreo() {
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState({});
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [confirmando, setConfirmando] = useState(false);
  const catalogo = useConsulta(`/catalogo?limite=12&offset=${pagina * 12}`, {
    publico: true,
  });
  const jornada = useConsulta('/cierre', { intervalo: 15000 });
  const operacion = useOperacion('tarreo');
  const items = Object.values(seleccion).sort(
    (a, b) => a.id_producto - b.id_producto,
  );
  const totales = calcularImportes(items);
  const cerrada = jornada.datos?.estado !== 'ABIERTO';
  function cantidad(producto, numero) {
    if (
      !Number.isInteger(numero) ||
      numero < 0 ||
      numero > Math.min(9999, producto.stock)
    )
      return;
    setSeleccion((actual) => {
      const nuevo = { ...actual };
      if (numero === 0) delete nuevo[producto.id_producto];
      else
        nuevo[producto.id_producto] = {
          id_producto: producto.id_producto,
          nombre: producto.nombre,
          cantidad: numero,
          precio_unitario: producto.precio,
        };
      return nuevo;
    });
  }
  async function guardar() {
    const r = await operacion.ejecutar({
      ruta: '/ventas/calle',
      body: {
        items: items.map(({ id_producto, cantidad }) => ({
          id_producto,
          cantidad,
        })),
        metodo_pago: metodo,
      },
      vista: { titulo: 'Venta en la calle', ...totales },
    });
    setConfirmando(false);
    if (r) {
      jornada.refrescar();
      catalogo.refrescar();
    }
  }
  async function reintentar() {
    const r = await operacion.ejecutar();
    if (r) {
      jornada.refrescar();
      catalogo.refrescar();
    }
  }
  return (
    <>
      <Encabezado
        etiqueta="VENTA AL PASO"
        titulo="Venta en la calle"
        accion={
          <Boton
            variante="secundario"
            disabled={operacion.enviando || !!operacion.pendiente}
            onClick={() => {
              catalogo.refrescar();
              jornada.refrescar();
            }}
          >
            Actualizar productos
          </Boton>
        }
      >
        Selecciona productos y registra el pago recibido.
      </Encabezado>
      <ErrorAviso mensaje={operacion.error} />
      <OperacionPendiente operacion={operacion} reintentar={reintentar} />
      {operacion.resultado ? (
        <Tarjeta className="recibo-venta">
          <p className="ceja">VENTA REGISTRADA</p>
          <h2>Venta #{operacion.resultado.id_venta}</h2>
          <p className="aviso aviso-exito" role="status">
            Cobro registrado por {pago(operacion.resultado.metodo_pago)}.
          </p>
          <ul className="resumen-items">
            {operacion.resultado.items.map((i) => (
              <li key={i.id_producto}>
                <span>
                  {i.cantidad} × {i.nombre}
                </span>
                <strong>{clp(i.cantidad * i.precio_unitario)}</strong>
              </li>
            ))}
          </ul>
          <Totales datos={operacion.resultado} />
          <p className="nota">Estos son los importes definitivos de Oracle.</p>
          {operacion.resultado.sincronizacion === 'PENDIENTE' && (
            <p className="aviso">
              La venta está guardada. Su auditoría se sincronizará cuando Mongo
              esté disponible.
            </p>
          )}
          <div className="acciones-flex">
            <Boton
              onClick={() => {
                operacion.nueva();
                setSeleccion({});
              }}
            >
              Registrar otra venta
            </Boton>
            <EnlaceBoton variante="secundario" to="/repartidor/ventas">
              Ver ventas del día
            </EnlaceBoton>
          </div>
        </Tarjeta>
      ) : (
        !operacion.pendiente && (
          <>
            <ErrorAviso
              mensaje={jornada.error}
              reintentar={jornada.refrescar}
            />
            {jornada.cargando && <Cargando texto="Consultando tu jornada…" />}
            {jornada.datos?.cierre && (
              <p className="aviso">
                La jornada ya está cerrada.{' '}
                <EnlaceBoton to="/repartidor/cierre" variante="secundario">
                  Ver cierre
                </EnlaceBoton>
              </p>
            )}
            <div className="dos-columnas">
              <section>
                <ErrorAviso
                  mensaje={catalogo.error}
                  reintentar={catalogo.refrescar}
                />
                {catalogo.cargando ? (
                  <Cargando texto="Cargando productos…" />
                ) : (
                  <div className="selector-productos">
                    {catalogo.datos?.map((p) => (
                      <Tarjeta
                        as="article"
                        className="selector-producto"
                        key={p.id_producto}
                      >
                        <Balon
                          peso={p.peso}
                          accesorio={p.categoria !== 'GAS'}
                        />
                        <div>
                          <h2>{p.nombre}</h2>
                          <p>
                            <strong>{clp(p.precio)}</strong>{' '}
                            <small>· Stock {p.stock}</small>
                          </p>
                          <div className="cantidad">
                            <Boton
                              variante="secundario"
                              aria-label={`Quitar ${p.nombre}`}
                              disabled={
                                cerrada || !seleccion[p.id_producto]?.cantidad
                              }
                              onClick={() =>
                                cantidad(
                                  p,
                                  (seleccion[p.id_producto]?.cantidad || 0) - 1,
                                )
                              }
                            >
                              −
                            </Boton>
                            <label
                              className="sr-only"
                              htmlFor={`cantidad-${p.id_producto}`}
                            >
                              Cantidad de {p.nombre}
                            </label>
                            <input
                              id={`cantidad-${p.id_producto}`}
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max={Math.min(9999, p.stock)}
                              step="1"
                              value={seleccion[p.id_producto]?.cantidad || 0}
                              disabled={cerrada || p.stock === 0}
                              onChange={(e) =>
                                cantidad(p, Number(e.target.value))
                              }
                            />
                            <Boton
                              variante="secundario"
                              aria-label={`Agregar ${p.nombre}`}
                              disabled={
                                cerrada ||
                                (seleccion[p.id_producto]?.cantidad || 0) >=
                                  Math.min(9999, p.stock)
                              }
                              onClick={() =>
                                cantidad(
                                  p,
                                  (seleccion[p.id_producto]?.cantidad || 0) + 1,
                                )
                              }
                            >
                              ＋
                            </Boton>
                          </div>
                        </div>
                      </Tarjeta>
                    ))}
                  </div>
                )}
                {!catalogo.cargando &&
                  !catalogo.error &&
                  !catalogo.datos?.length && (
                    <p className="aviso">No hay productos en esta página.</p>
                  )}
                <div className="paginacion">
                  <Boton
                    variante="secundario"
                    disabled={!pagina || catalogo.cargando}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </Boton>
                  <span>Página {pagina + 1}</span>
                  <Boton
                    variante="secundario"
                    disabled={
                      !catalogo.datos ||
                      catalogo.datos.length < 12 ||
                      catalogo.cargando
                    }
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Siguiente
                  </Boton>
                </div>
              </section>
              <Tarjeta className="resumen">
                <h2>Antes de cobrar</h2>
                {!items.length && (
                  <p className="nota">Elige al menos un producto.</p>
                )}
                <ul className="resumen-items">
                  {items.map((i) => (
                    <li key={i.id_producto}>
                      <span>
                        {i.cantidad} × {i.nombre}
                        <button
                          className="quitar-linea"
                          aria-label={`Eliminar ${i.nombre}`}
                          onClick={() =>
                            setSeleccion((a) => {
                              const n = { ...a };
                              delete n[i.id_producto];
                              return n;
                            })
                          }
                        >
                          Quitar
                        </button>
                      </span>
                      <strong>{clp(i.cantidad * i.precio_unitario)}</strong>
                    </li>
                  ))}
                </ul>
                <Totales datos={totales} />
                <p className="nota-descuento">
                  10% de descuento desde $30.000.
                </p>
                <Campo
                  label="Pago recibido"
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </Campo>
                <p className="nota">
                  El precio y el stock se verifican al guardar. La venta queda
                  cobrada y descuenta el stock de la empresa.
                </p>
                <Boton
                  disabled={
                    !items.length ||
                    cerrada ||
                    !!jornada.error ||
                    operacion.enviando ||
                    items.length > 50
                  }
                  onClick={() => setConfirmando(true)}
                >
                  Revisar y confirmar venta
                </Boton>
                {items.length > 50 && (
                  <p className="aviso aviso-error">
                    El máximo es 50 productos distintos.
                  </p>
                )}
              </Tarjeta>
            </div>
          </>
        )
      )}
      {confirmando && (
        <Confirmacion
          titulo="Confirmar venta en la calle"
          texto="Registrar venta cobrada"
          cancelar={() => setConfirmando(false)}
          ocupado={operacion.enviando}
          aceptar={guardar}
        >
          <p>
            {items.reduce((s, i) => s + i.cantidad, 0)} unidades · Pago en{' '}
            {pago(metodo)}
          </p>
          <Totales datos={totales} />
          <p>
            Confirma que recibiste el pago. Esta venta no genera un pedido de
            reparto.
          </p>
        </Confirmacion>
      )}
    </>
  );
}
