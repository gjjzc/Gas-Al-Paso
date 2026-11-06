import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useOperacion } from '../../hooks/useOperacion.js';
import { calcularImportes } from '../../services/importes.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  EnlaceBoton,
  ErrorAviso,
  Formulario,
  Tarjeta,
  Totales,
} from '../../components/UI.jsx';
import { SelectorItems, Paginacion } from '../../components/Admin.jsx';
import { Confirmacion } from '../../components/Confirmacion.jsx';
import { OperacionPendiente, pago } from '../../components/Repartidor.jsx';
export function Llamada() {
  const [busqueda, setBusqueda] = useState('');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(0);
  const [cliente, setCliente] = useState(null);
  const [seleccion, setSeleccion] = useState({});
  const [revision, setRevision] = useState(null);
  const clientes = useConsulta(
    `/usuarios?rol=CLIENTE&activo=true&limite=10&offset=${pagina * 10}&buscar=${encodeURIComponent(buscar)}`,
  );
  const comunas = useConsulta('/comunas', { publico: true });
  const operacion = useOperacion('admin-llamada');
  const navegar = useNavigate();
  const items = Object.values(seleccion).sort(
    (a, b) => a.id_producto - b.id_producto,
  );
  const totales = calcularImportes(items);
  function revisar(e) {
    e.preventDefault();
    if (!cliente || !items.length) return;
    const f = new FormData(e.currentTarget);
    setRevision({
      id_cliente: cliente.id_cliente,
      direccion_entrega: {
        calle: f.get('calle'),
        numero: f.get('numero'),
        id_comuna: Number(f.get('comuna')),
        referencia: f.get('referencia'),
      },
      metodo_cobro: f.get('metodo'),
      items: items.map(({ id_producto, cantidad }) => ({
        id_producto,
        cantidad,
      })),
    });
  }
  async function confirmar() {
    const r = await operacion.ejecutar({
      ruta: '/pedidos/telefonico',
      body: revision,
      vista: {
        titulo: `Pedido por llamada · ${cliente.nombre}`,
        total: totales.total,
      },
    });
    setRevision(null);
    if (r) navegar(`/admin/pedidos/${r._id}`);
  }
  async function reintentar() {
    const r = await operacion.ejecutar();
    if (r) navegar(`/admin/pedidos/${r._id}`);
  }
  return (
    <>
      <Encabezado
        etiqueta="ATENCIÓN TELEFÓNICA"
        titulo="Pedido por llamada"
        accion={
          <EnlaceBoton variante="secundario" to="/admin/usuarios">
            Gestionar clientes
          </EnlaceBoton>
        }
      >
        Confirma quién llama, qué necesita y dónde lo recibe.
      </Encabezado>
      <ErrorAviso mensaje={operacion.error} />
      <OperacionPendiente operacion={operacion} reintentar={reintentar} />
      {!operacion.pendiente && (
        <>
          <Tarjeta>
            <h2>1. Selecciona el cliente</h2>
            <Formulario
              className="formulario busqueda-admin"
              onSubmit={(e) => {
                e.preventDefault();
                setBuscar(busqueda);
                setPagina(0);
              }}
            >
              <Campo
                label="Buscar cliente por nombre o correo"
                type="search"
                maxLength={100}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <Boton type="submit" variante="secundario">
                Buscar cliente
              </Boton>
            </Formulario>
            <ErrorAviso
              mensaje={clientes.error}
              reintentar={clientes.refrescar}
            />
            {clientes.cargando ? (
              <Cargando />
            ) : (
              <>
                <div className="clientes-opciones">
                  {clientes.datos?.map((c) => (
                    <Boton
                      variante={
                        cliente?.id_usuario === c.id_usuario
                          ? 'principal'
                          : 'secundario'
                      }
                      key={c.id_usuario}
                      onClick={() => setCliente(c)}
                      aria-pressed={cliente?.id_usuario === c.id_usuario}
                    >
                      {c.nombre} · {c.email}
                    </Boton>
                  ))}
                </div>
                {!clientes.datos?.length && (
                  <p className="nota">
                    No hay clientes activos con esta búsqueda. Puedes crear uno
                    en Usuarios.
                  </p>
                )}
                <Paginacion
                  pagina={pagina}
                  cambiar={setPagina}
                  longitud={clientes.datos?.length || 0}
                  limite={10}
                />
              </>
            )}
            {cliente && (
              <p className="aviso">
                Cliente seleccionado: <strong>{cliente.nombre}</strong> ·{' '}
                {cliente.telefono}
              </p>
            )}
          </Tarjeta>
          <Tarjeta className="seccion-admin">
            <h2>2. Productos y cantidades</h2>
            <SelectorItems seleccion={seleccion} cambiar={setSeleccion} />
          </Tarjeta>
          {cliente && (
            <Formulario
              key={cliente.id_usuario}
              onSubmit={revisar}
              className="formulario dos-columnas seccion-admin"
            >
              <Tarjeta>
                <h2>3. Entrega y cobro</h2>
                <p className="nota">
                  Dirección principal: {cliente.direccion_principal}. Confirma
                  calle y número por separado.
                </p>
                <ErrorAviso
                  mensaje={comunas.error}
                  reintentar={comunas.refrescar}
                />
                <div className="form-grid">
                  <Campo
                    label="Calle de entrega"
                    name="calle"
                    maxLength={150}
                    required
                  />
                  <Campo
                    label="Número de entrega"
                    name="numero"
                    maxLength={20}
                    required
                  />
                </div>
                <Campo
                  label="Comuna de entrega"
                  name="comuna"
                  defaultValue={cliente.id_comuna || ''}
                  required
                >
                  <option value="" disabled>
                    Selecciona comuna
                  </option>
                  {comunas.datos?.map((c) => (
                    <option key={c.id_comuna} value={c.id_comuna}>
                      {c.nombre}
                    </option>
                  ))}
                </Campo>
                <Campo
                  label="Referencia de entrega"
                  name="referencia"
                  maxLength={200}
                />
                <Campo
                  label="Método de cobro solicitado"
                  name="metodo"
                  defaultValue="EFECTIVO"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </Campo>
              </Tarjeta>
              <Tarjeta className="resumen">
                <h2>Resumen de la llamada</h2>
                <Totales datos={totales} />
                <p className="nota">
                  Cobro contra entrega. Oracle verificará precio y stock al
                  guardar.
                </p>
                <Boton
                  type="submit"
                  disabled={
                    !items.length ||
                    items.length > 50 ||
                    !comunas.datos?.length ||
                    operacion.enviando
                  }
                >
                  Revisar pedido telefónico
                </Boton>
              </Tarjeta>
            </Formulario>
          )}
        </>
      )}
      {revision && (
        <Confirmacion
          titulo="Confirmar pedido por llamada"
          texto="Crear pedido telefónico"
          ocupado={operacion.enviando}
          cancelar={() => setRevision(null)}
          aceptar={confirmar}
        >
          <p>
            {cliente.nombre} · {revision.direccion_entrega.calle}{' '}
            {revision.direccion_entrega.numero}
          </p>
          <p>{pago(revision.metodo_cobro)} contra entrega</p>
          <Totales datos={totales} />
        </Confirmacion>
      )}
    </>
  );
}
