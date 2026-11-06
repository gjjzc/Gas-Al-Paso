import { useState } from 'react';
import { useConsulta } from '../../hooks/useConsulta.js';
import { clp, fecha } from '../../services/api.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  ErrorAviso,
  Tarjeta,
  Totales,
} from '../../components/UI.jsx';
import { pago, ResumenJornada } from '../../components/Repartidor.jsx';
export function VentasDia() {
  const [dia, setDia] = useState('');
  const [pagina, setPagina] = useState(0);
  const consulta = useConsulta(
    `/ventas/dia?limite=10&offset=${pagina * 10}${dia ? `&fecha=${dia}` : ''}`,
    { intervalo: 15000 },
  );
  return (
    <>
      <Encabezado
        etiqueta="TUS COBROS"
        titulo="Ventas del día"
        accion={
          <Boton variante="secundario" onClick={consulta.refrescar}>
            Actualizar ventas
          </Boton>
        }
      >
        Totales por fecha de cobro, separados por método de pago.
      </Encabezado>
      <Campo
        label="Fecha de ventas"
        type="date"
        value={dia || consulta.datos?.fecha || ''}
        onChange={(e) => {
          setDia(e.target.value);
          setPagina(0);
        }}
      />
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {consulta.cargando ? (
        <Cargando />
      ) : (
        consulta.datos && (
          <>
            <ResumenJornada datos={consulta.datos.resumen} />
            <p className="nota">
              El resumen incluye todas tus ventas del día, aunque estén en otras
              páginas. Solo las cobradas suman dinero. Las pendientes y anuladas
              se identifican en cada venta.
            </p>
            <div className="ventas-lista">
              {consulta.datos.ventas.map((v) => (
                <Tarjeta as="article" key={v.id_venta}>
                  <header className="venta-cabecera">
                    <h2>Venta #{v.id_venta}</h2>
                    <span className="insignia">
                      {v.canal === 'TARREO'
                        ? 'Calle'
                        : v.canal === 'WEB'
                          ? 'Web'
                          : 'Telefónica'}
                    </span>
                  </header>
                  <p>
                    <strong>
                      {v.estado_pago === 'COBRADA'
                        ? 'Cobrada'
                        : v.estado_pago === 'ANULADA'
                          ? 'Anulada'
                          : 'Pendiente de cobro'}
                    </strong>
                    {v.estado_pago === 'COBRADA' && ` · ${pago(v.metodo_pago)}`}
                  </p>
                  <p className="nota">
                    {v.estado_pago === 'COBRADA' ? 'Cobro' : 'Venta'}:{' '}
                    {fecha(v.fecha_cobro || v.fecha_venta)}
                  </p>
                  <details>
                    <summary>Ver productos y descuento</summary>
                    <ul className="resumen-items">
                      {v.items.map((i) => (
                        <li key={i.id_producto}>
                          <span>
                            {i.cantidad} × {i.nombre}
                          </span>
                          <strong>{clp(i.precio_unitario * i.cantidad)}</strong>
                        </li>
                      ))}
                    </ul>
                    <Totales datos={v} />
                  </details>
                  <div className="venta-total">
                    <span>Total de la venta</span>
                    <strong>{clp(v.total)}</strong>
                  </div>
                </Tarjeta>
              ))}
            </div>
            {!consulta.datos.ventas.length && (
              <Tarjeta className="vacio">
                <h2>No hay ventas para esta fecha</h2>
                <p>
                  Los pedidos cobrados y las ventas de calle aparecerán aquí.
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
                disabled={consulta.datos.ventas.length < 10}
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
