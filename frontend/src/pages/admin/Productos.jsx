import { ImagenProducto } from '../../components/ImagenProducto.jsx';
import { useState } from 'react';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useAccion } from '../../hooks/useAccion.js';
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
import { AvisosAccion, Paginacion } from '../../components/Admin.jsx';
import { Confirmacion } from '../../components/Confirmacion.jsx';
import { clp } from '../../services/api.js';
export function Productos() {
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(0);
  const [editar, setEditar] = useState(null);
  const [eliminar, setEliminar] = useState(null);
  const consulta = useConsulta(
    `/catalogo?incluir_inactivos=true&limite=15&offset=${pagina * 15}&buscar=${encodeURIComponent(buscar)}`,
  );
  const accion = useAccion();
  async function guardar(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const datos = {
      nombre: f.get('nombre'),
      descripcion: f.get('descripcion'),
      categoria: f.get('categoria'),
      peso: Number(f.get('peso')),
      precio: Number(f.get('precio')),
      stock: Number(f.get('stock')),
      imagen: f.get('imagen').trim(),
      activo: f.has('activo'),
      destacado: f.has('destacado'),
    };
    const r = await accion.ejecutar(
      editar.id_producto ? `/catalogo/${editar.id_producto}` : '/catalogo',
      editar.id_producto ? 'PUT' : 'POST',
      datos,
      editar.id_producto ? 'Producto actualizado.' : 'Producto creado.',
    );
    if (r) setEditar(null);
    consulta.refrescar();
  }
  async function borrar() {
    const r = await accion.ejecutar(
      `/catalogo/${eliminar.id_producto}`,
      'DELETE',
      undefined,
      'Producto desactivado; sus ventas se conservan.',
    );
    setEliminar(null);
    consulta.refrescar();
  }
  return (
    <>
      <Encabezado
        etiqueta="CATÁLOGO Y EXISTENCIAS"
        titulo="Productos"
        accion={
          <Boton
            onClick={() => {
              accion.limpiar();
              setEditar({
                activo: true,
                destacado: false,
                categoria: 'GAS',
                peso: 11,
                stock: 0,
              });
            }}
          >
            Crear producto
          </Boton>
        }
      >
        Administra precios, stock y catálogo. Los cambios de precio y
        stock quedan registrados en auditoría.
      </Encabezado>
      <AvisosAccion accion={accion} />
      <Formulario
        className="formulario busqueda-admin"
        onSubmit={(e) => {
          e.preventDefault();
          setBuscar(new FormData(e.currentTarget).get('buscar'));
          setPagina(0);
        }}
      >
        <Campo
          label="Buscar producto por nombre o descripción"
          name="buscar"
          type="search"
          maxLength={100}
        />
        <Boton type="submit" variante="secundario">
          Buscar producto
        </Boton>
      </Formulario>
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {editar && (
        <Tarjeta className="editor-admin">
          <h2>{editar.id_producto ? 'Editar producto' : 'Nuevo producto'}</h2>
          <Formulario onSubmit={guardar} key={editar.id_producto || 'nuevo'}>
            <div className="form-grid">
              <Campo
                label="Nombre del producto"
                name="nombre"
                maxLength={50}
                defaultValue={editar.nombre || ''}
                required
              />
              <Campo
                label="Categoría"
                name="categoria"
                defaultValue={editar.categoria}
              >
                <option value="GAS">Gas</option>
                <option value="ACCESORIO">Accesorio</option>
              </Campo>
              <Campo
                label="Peso en kg"
                name="peso"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="999.99"
                step="0.01"
                defaultValue={editar.peso}
                required
              />
              <Campo
                label="Precio en CLP"
                name="precio"
                type="number"
                inputMode="numeric"
                min="1"
                max="99999999"
                step="1"
                defaultValue={editar.precio || ''}
                required
              />
              <Campo
                label="Stock de empresa"
                name="stock"
                type="number"
                inputMode="numeric"
                min="0"
                max="999999999"
                step="1"
                defaultValue={editar.stock}
                required
              />
            </div>
            <Campo
              label="Descripción del producto"
              name="descripcion"
              maxLength={100}
              defaultValue={editar.descripcion || ''}
              required
            />
            <Campo label="Imagen: ruta local" name="imagen" maxLength={250}
              placeholder="/productos/balon-11kg.jpg" value={editar.imagen || ''}
              onChange={e => setEditar(actual => ({ ...actual, imagen: e.target.value }))}
              ayuda="Archivo en frontend/public/productos/. Vacío usa la imagen de reemplazo." />
            <div className="vista-previa-producto">
              <p>Vista previa de la imagen</p>
              <ImagenProducto producto={editar} />
            </div>
            <div className="checks-admin">
              <label>
                <input
                  type="checkbox"
                  name="activo"
                  defaultChecked={editar.activo}
                />
                Producto activo
              </label>
              <label>
                <input
                  type="checkbox"
                  name="destacado"
                  defaultChecked={editar.destacado}
                />
                Destacado
              </label>
            </div>
            <div className="acciones-flex">
              <Boton type="submit" disabled={accion.enviando}>
                {accion.enviando ? 'Guardando…' : 'Guardar producto'}
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                disabled={accion.enviando}
                onClick={() => setEditar(null)}
              >
                Cerrar editor
              </Boton>
            </div>
          </Formulario>
        </Tarjeta>
      )}
      {consulta.cargando ? (
        <Cargando />
      ) : (
        consulta.datos && (
          <>
            <Tarjeta>
              <Tabla
                titulo="Catálogo: incluye productos inactivos"
                columnas={[
                  'Producto',
                  'Categoría',
                  'Precio',
                  'Stock',
                  'Estado',
                  'Acciones',
                ]}
              >
                {consulta.datos.map((p) => (
                  <tr key={p.id_producto}>
                    <td>
                      <ImagenProducto producto={p} className="foto-mini" /><strong>{p.nombre}</strong>
                      <small className="dato-secundario">{p.descripcion}</small>
                    </td>
                    <td>{p.categoria}</td>
                    <td>{clp(p.precio)}</td>
                    <td>{p.stock}</td>
                    <td>
                      <span
                        className={`insignia ${p.activo ? 'estado-ENTREGADO' : 'estado-CANCELADO'}`}
                      >
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="acciones-tabla">
                        <Boton
                          variante="secundario"
                          disabled={accion.enviando}
                          onClick={() => {
                            accion.limpiar();
                            setEditar(p);
                          }}
                        >
                          Editar <span className="sr-only">{p.nombre}</span>
                        </Boton>
                        {p.activo && (
                          <Boton
                            variante="peligro"
                            disabled={accion.enviando}
                            onClick={() => setEliminar(p)}
                          >
                            Eliminar <span className="sr-only">{p.nombre}</span>
                          </Boton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Tabla>
              {!consulta.datos.length && (
                <p className="nota">No hay productos con esta búsqueda.</p>
              )}
            </Tarjeta>
            <Paginacion
              pagina={pagina}
              cambiar={setPagina}
              longitud={consulta.datos.length}
            />
          </>
        )
      )}
      {eliminar && (
        <Confirmacion
          titulo="Eliminar del catálogo"
          texto="Desactivar producto"
          ocupado={accion.enviando}
          cancelar={() => setEliminar(null)}
          aceptar={borrar}
        >
          <p>{eliminar.nombre}</p>
          <p>
            Se desactivará para nuevas compras. Se conservarán las ventas
            históricas y podrás reactivarlo desde Editar.
          </p>
        </Confirmacion>
      )}
    </>
  );
}
