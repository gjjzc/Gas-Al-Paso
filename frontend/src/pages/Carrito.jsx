import { useEffect } from 'react';
import { useCarrito } from '../context/Carrito.jsx';
import { ImagenProducto } from '../components/ImagenProducto.jsx';
import {
  Boton,
  Cargando,
  Encabezado,
  EnlaceBoton,
  ErrorAviso,
  Tarjeta,
  Totales,
  Vacio,
} from '../components/UI.jsx';
import { clp, fecha } from '../services/api.js';
export function Carrito() {
  const { carrito, ocupado, cargando, error, cargar, modificar } = useCarrito();
  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 30000);
    return () => clearInterval(id);
  }, [cargar]);
  async function cambiar(ruta, method, body) {
    try {
      await modificar(ruta, method, body);
    } catch {
      /* El contexto muestra el error. */
    }
  }
  return (
    <>
      <Encabezado
        etiqueta="TU PRÓXIMO PEDIDO"
        titulo="Tu carrito"
        accion={
          <EnlaceBoton variante="secundario" to="/catalogo">
            Seguir comprando
          </EnlaceBoton>
        }
      >
        Revisa tus productos antes de confirmar.
      </Encabezado>
      <ErrorAviso mensaje={error} reintentar={cargar} />
      {cargando && !carrito ? (
        <Cargando />
      ) : !carrito ? null : !carrito.items.length ? (
        <Vacio titulo="Tu carrito está esperando">
          Elige el gas y los accesorios que necesitas para tu hogar.
        </Vacio>
      ) : (
        <div className="dos-columnas">
          <section className="lista-carrito" aria-label="Productos del carrito">
            {carrito.items.map((item) => (
              <Tarjeta
                as="article"
                className="carrito-item"
                key={item.id_producto}
              >
                <ImagenProducto producto={item} />
                <div className="carrito-item-info">
                  <h2>{item.nombre}</h2>
                  <p className="muted">
                    {clp(item.precio_unitario)} por unidad
                  </p>
                  <div className="cantidad">
                    <Boton
                      variante="secundario"
                      aria-label={`Quitar una unidad de ${item.nombre}`}
                      disabled={ocupado || item.cantidad <= 1}
                      onClick={() =>
                        cambiar(`/carrito/items/${item.id_producto}`, 'PATCH', {
                          cantidad: item.cantidad - 1,
                        })
                      }
                    >
                      −
                    </Boton>
                    <span aria-label="Cantidad">{item.cantidad}</span>
                    <Boton
                      variante="secundario"
                      aria-label={`Agregar una unidad de ${item.nombre}`}
                      disabled={ocupado || item.cantidad >= 9999}
                      onClick={() =>
                        cambiar(`/carrito/items/${item.id_producto}`, 'PATCH', {
                          cantidad: item.cantidad + 1,
                        })
                      }
                    >
                      ＋
                    </Boton>
                  </div>
                </div>
                <div className="carrito-item-total">
                  <strong>{clp(item.precio_unitario * item.cantidad)}</strong>
                  <Boton
                    variante="texto"
                    disabled={ocupado}
                    onClick={() =>
                      cambiar(`/carrito/items/${item.id_producto}`, 'DELETE')
                    }
                  >
                    Eliminar <span className="sr-only">{item.nombre}</span>
                  </Boton>
                </div>
              </Tarjeta>
            ))}
            <Boton
              variante="texto"
              disabled={ocupado}
              onClick={() => {
                if (window.confirm('¿Vaciar todos los productos del carrito?'))
                  cambiar('/carrito', 'DELETE');
              }}
            >
              Vaciar carrito
            </Boton>
          </section>
          <Tarjeta className="resumen">
            <h2>Resumen del pedido</h2>
            <Totales datos={carrito} />
            <p className="nota-descuento">10% de descuento desde $30.000.</p>
            {ocupado ? (
              <Cargando texto="Actualizando carrito…" />
            ) : (
              <EnlaceBoton to="/confirmar">
                Continuar con el pedido →
              </EnlaceBoton>
            )}
            <p className="nota">Pagarás al recibir. No necesitas tarjeta.</p>
            <p className="nota">
              Carrito válido hasta {fecha(carrito.expira_en)}. Los precios y el
              stock se verifican al confirmar.
            </p>
          </Tarjeta>
        </div>
      )}
    </>
  );
}
