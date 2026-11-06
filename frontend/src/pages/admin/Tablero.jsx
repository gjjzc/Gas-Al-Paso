import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConsulta } from '../../hooks/useConsulta.js';
import { clp, fecha } from '../../services/api.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  EnlaceBoton,
  ErrorAviso,
  Formulario,
  Insignia,
  Tarjeta,
  estados,
} from '../../components/UI.jsx';
import { Paginacion } from '../../components/Admin.jsx';
export function Tablero() {
  const [filtros, setFiltros] = useState({});
  const [pagina, setPagina] = useState(0);
  const comunas = useConsulta('/comunas', { publico: true });
  const query = new URLSearchParams({
    ...filtros,
    limite: 15,
    offset: pagina * 15,
  });
  const consulta = useConsulta(`/pedidos?${query}`, { intervalo: 10000 });
  const pedidos = consulta.datos || [];
  function filtrar(e) {
    e.preventDefault();
    setPagina(0);
    setFiltros(
      Object.fromEntries(
        [...new FormData(e.currentTarget)].filter(([, v]) => v),
      ),
    );
  }
  return (
    <>
      <Encabezado
        etiqueta="OPERACIÓN DEL DÍA"
        titulo="Tablero de pedidos"
        accion={<EnlaceBoton to="/admin/llamada">Ingresar llamada</EnlaceBoton>}
      >
        De la confirmación a la entrega, cada pedido en su lugar.
      </Encabezado>
      <Tarjeta className="filtros-admin">
        <Formulario onSubmit={filtrar}>
          <Campo label="Estado del pedido" name="estado" defaultValue="">
            <option value="">Todos los estados</option>
            {Object.entries(estados).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Campo>
          <Campo label="Fecha de creación (UTC)" name="fecha" type="date" />
          <Campo label="Comuna del pedido" name="comuna" defaultValue="">
            <option value="">Todas las comunas</option>
            {comunas.datos?.map((c) => (
              <option value={c.id_comuna} key={c.id_comuna}>
                {c.nombre}
              </option>
            ))}
          </Campo>
          <Boton type="submit">Aplicar filtros</Boton>
        </Formulario>
      </Tarjeta>
      <ErrorAviso mensaje={comunas.error} reintentar={comunas.refrescar} />
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      <div className="barra-resultados">
        <p className="nota">
          {pedidos.length} pedidos en esta página · Actualización cada 10
          segundos.
          {consulta.actualizado &&
            ` Última consulta: ${fecha(consulta.actualizado)}.`}
        </p>
        <Boton variante="secundario" onClick={consulta.refrescar}>
          Actualizar tablero
        </Boton>
      </div>
      {consulta.cargando ? (
        <Cargando />
      ) : (
        consulta.datos && (
          <>
            <div className="tablero-columnas">
              {Object.entries(estados)
                .filter(([k]) => !filtros.estado || filtros.estado === k)
                .map(([k, nombre]) => (
                  <section key={k} className={`columna-pedidos columna-${k}`}>
                    <header>
                      <h2>{nombre}</h2>
                      <span>
                        {pedidos.filter((p) => p.estado === k).length}
                      </span>
                    </header>
                    {pedidos
                      .filter((p) => p.estado === k)
                      .map((p) => (
                        <Tarjeta as="article" key={p._id}>
                          <p className="ceja">PEDIDO #{p.id_venta}</p>
                          <h3>{p.cliente.nombre}</h3>
                          <p className="nota">
                            {p.direccion_entrega.comuna}
                            <br />
                            {p.direccion_entrega.calle}{' '}
                            {p.direccion_entrega.numero}
                          </p>
                          <p>
                            <strong>{clp(p.total)}</strong>
                          </p>
                          <p className="nota">
                            {p.repartidor?.nombre || 'Sin repartidor'} ·{' '}
                            {p.canal === 'LLAMADA' ? 'Llamada' : 'Web'}
                          </p>
                          <Link to={`/admin/pedidos/${p._id}`}>
                            Gestionar pedido →
                          </Link>
                        </Tarjeta>
                      ))}
                    {!pedidos.some((p) => p.estado === k) && (
                      <p className="nota sin-pedidos-columna">
                        Sin pedidos en esta página.
                      </p>
                    )}
                  </section>
                ))}
            </div>
            <Paginacion
              pagina={pagina}
              cambiar={setPagina}
              longitud={pedidos.length}
            />
            <p className="nota">
              Los contadores corresponden a la página actual, no al total
              histórico. Usa los filtros para concentrarte en un estado o
              comuna.
            </p>
          </>
        )
      )}
    </>
  );
}
