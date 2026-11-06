import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useConsulta } from '../hooks/useConsulta.js';
import { Boton, Cargando, ErrorAviso, Formulario, Tarjeta } from './UI.jsx';
import { clp } from '../services/api.js';
export function LayoutAdmin() {
  return (
    <div className="zona-admin">
      <aside className="menu-admin">
        <p className="ceja">ADMINISTRACIÓN</p>
        <nav aria-label="Administración">
          <NavLink to="/admin/pedidos">Pedidos</NavLink>
          <NavLink to="/admin/llamada">Pedido por llamada</NavLink>
          <NavLink to="/admin/cargas">Cargas diarias</NavLink>
          <NavLink to="/admin/productos">Productos</NavLink>
          <NavLink to="/admin/usuarios">Usuarios</NavLink>
          <NavLink to="/admin/cobertura">Comunas de reparto</NavLink>
          <NavLink to="/admin/cuadratura">Cuadratura</NavLink>
          <NavLink to="/admin/auditoria">Auditoría</NavLink>
        </nav>
        <p className="nota">Del primer balón al cierre del día.</p>
      </aside>
      <div className="contenido-admin">
        <Outlet />
      </div>
    </div>
  );
}
export function AvisosAccion({ accion }) {
  return (
    <>
      <ErrorAviso mensaje={accion.error} />
      {accion.aviso && (
        <p className="aviso aviso-exito" role="status">
          {accion.aviso}
        </p>
      )}
    </>
  );
}
export function Paginacion({
  pagina,
  cambiar,
  longitud,
  limite = 15,
  cargando = false,
}) {
  return (
    <div className="paginacion">
      <Boton
        variante="secundario"
        disabled={!pagina || cargando}
        onClick={() => cambiar((p) => p - 1)}
      >
        Anterior
      </Boton>
      <span>Página {pagina + 1}</span>
      <Boton
        variante="secundario"
        disabled={longitud < limite || cargando}
        onClick={() => cambiar((p) => p + 1)}
      >
        Siguiente
      </Boton>
    </div>
  );
}
export function SelectorItems({
  seleccion,
  cambiar,
  soloBalones = false,
  tipo = 'venta',
}) {
  const [busqueda, setBusqueda] = useState('');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(0);
  const consulta = useConsulta(
    `/catalogo?limite=10&offset=${pagina * 10}&buscar=${encodeURIComponent(buscar)}${soloBalones ? '&categoria=GAS' : ''}`,
    { publico: true },
  );
  const productos =
    consulta.datos?.filter(
      (p) => !soloBalones || [5, 11, 15, 45].includes(p.peso),
    ) || [];
  function cantidad(p, n) {
    if (
      !Number.isSafeInteger(n) ||
      n < 0 ||
      n > (tipo === 'carga' ? 999999999 : 9999)
    )
      return;
    cambiar((actual) => {
      const nuevo = { ...actual };
      if (!n) delete nuevo[p.id_producto];
      else
        nuevo[p.id_producto] = {
          id_producto: p.id_producto,
          nombre: p.nombre,
          cantidad: n,
          precio_unitario: p.precio,
        };
      return nuevo;
    });
  }
  return (
    <section className="selector-admin" aria-label="Seleccionar productos">
      <Formulario
        onSubmit={(e) => {
          e.preventDefault();
          setBuscar(busqueda);
          setPagina(0);
        }}
      >
        <label className="buscador">
          Buscar productos
          <input
            type="search"
            maxLength={100}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <Boton type="submit" variante="secundario">
          Buscar productos
        </Boton>
      </Formulario>
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {consulta.cargando ? (
        <Cargando />
      ) : (
        <>
          <div className="items-admin">
            {productos.map((p) => (
              <Tarjeta as="article" key={p.id_producto}>
                <div>
                  <h3>{p.nombre}</h3>
                  <p className="nota">
                    {clp(p.precio)} · Stock empresa: {p.stock}
                  </p>
                </div>
                <label>
                  Cantidad de {p.nombre}
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={tipo === 'carga' ? 999999999 : 9999}
                    step="1"
                    value={seleccion[p.id_producto]?.cantidad || 0}
                    onChange={(e) => cantidad(p, Number(e.target.value))}
                  />
                </label>
              </Tarjeta>
            ))}
          </div>
          {!productos.length && (
            <p className="nota">
              No hay productos admitidos en esta página para esta búsqueda.
            </p>
          )}
        </>
      )}
      <Paginacion
        pagina={pagina}
        cambiar={setPagina}
        longitud={consulta.datos?.length || 0}
        limite={10}
        cargando={consulta.cargando}
      />
      {Object.values(seleccion).length > 0 && (
        <div className="seleccion-actual">
          <h3>Productos seleccionados</h3>
          {Object.values(seleccion).map((i) => (
            <div key={i.id_producto}>
              <span>
                {i.cantidad} × {i.nombre}
              </span>
              <Boton
                variante="texto"
                onClick={() =>
                  cambiar((a) => {
                    const n = { ...a };
                    delete n[i.id_producto];
                    return n;
                  })
                }
                aria-label={`Quitar ${i.nombre}`}
              >
                Quitar
              </Boton>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
