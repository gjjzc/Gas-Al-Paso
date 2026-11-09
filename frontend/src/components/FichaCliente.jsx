import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConsulta } from '../hooks/useConsulta.js';
import { useAccion } from '../hooks/useAccion.js';
import {
  Boton,
  Campo,
  Cargando,
  ErrorAviso,
  Formulario,
  Insignia,
  Tabla,
  Tarjeta,
} from './UI.jsx';
import { AvisosAccion } from './Admin.jsx';
import { fecha, clp } from '../services/api.js';
function EditorCliente({ cliente, guardar, cancelar, ocupado }) {
  const comunas = useConsulta('/comunas', { publico: true });
  const d = cliente.direccion_entrega_sugerida;
  const [estructurada, setEstructurada] = useState(Boolean(d));
  function enviar(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {};
    const nombre = f.get('nombre').trim();
    if (nombre !== cliente.nombre) body.nombre = nombre;
    if (estructurada) {
      const dir = {
        calle: f.get('calle'),
        numero: f.get('numero'),
        comuna: Number(f.get('comuna')),
        referencia: f.get('referencia'),
      };
      if (
        !d ||
        dir.calle !== d.calle ||
        dir.numero !== d.numero ||
        dir.comuna !== cliente.id_comuna ||
        dir.referencia !== (d.referencia || '')
      )
        body.direccion_principal = dir;
    } else if (
      f.get('direccion') !== cliente.direccion_principal ||
      Number(f.get('comuna')) !== cliente.id_comuna
    ) {
      body.direccion_principal = f.get('direccion');
      body.id_comuna = Number(f.get('comuna'));
    }
    guardar(body);
  }
  return (
    <Tarjeta className="editor-admin">
      <h3>Corregir datos del cliente</h3>
      <ErrorAviso mensaje={comunas.error} reintentar={comunas.refrescar} />
      <Formulario onSubmit={enviar}>
        <Campo
          label="Nombre del cliente"
          name="nombre"
          minLength={2}
          maxLength={80}
          defaultValue={cliente.nombre}
          required
        />
        <div className="checks-admin">
          <label>
            <input
              type="checkbox"
              checked={estructurada}
              onChange={(e) => setEstructurada(e.target.checked)}
            />
            Editar calle y número por separado
          </label>
        </div>
        {estructurada ? (
          <>
            <div className="form-grid">
              <Campo
                label="Calle principal"
                name="calle"
                defaultValue={d?.calle || ''}
                required
                maxLength={150}
              />
              <Campo
                label="Número principal"
                name="numero"
                defaultValue={d?.numero || ''}
                required
                maxLength={20}
              />
            </div>
            <Campo
              label="Referencia principal"
              name="referencia"
              maxLength={200}
              defaultValue={d?.referencia || ''}
            />
          </>
        ) : (
          <Campo
            label="Dirección principal"
            name="direccion"
            defaultValue={cliente.direccion_principal}
            maxLength={200}
            required
          />
        )}
        <Campo
          label="Comuna principal"
          name="comuna"
          defaultValue={cliente.id_comuna}
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
        <p className="nota">
          Corrige el perfil actual; no cambia la dirección ni el nombre
          guardados en pedidos anteriores. El teléfono no se modifica desde esta
          ficha.
        </p>
        <div className="acciones-flex">
          <Boton type="submit" disabled={ocupado || !comunas.datos?.length}>
            {ocupado ? 'Guardando…' : 'Guardar ficha'}
          </Boton>
          <Boton
            variante="secundario"
            type="button"
            onClick={cancelar}
            disabled={ocupado}
          >
            Cancelar edición
          </Boton>
        </div>
      </Formulario>
    </Tarjeta>
  );
}
export function FichaCliente({ id, onNuevo }) {
  const consulta = useConsulta(`/clientes/${id}`);
  const accion = useAccion();
  const [editando, setEditando] = useState(false);
  const [sinCambios, setSinCambios] = useState('');
  async function guardar(body) {
    if (!Object.keys(body).length) {
      setSinCambios('No hay cambios para guardar.');
      return;
    }
    setSinCambios('');
    const r = await accion.ejecutar(
      `/clientes/${id}`,
      'PATCH',
      body,
      'Ficha del cliente actualizada.',
    );
    if (r) {
      setEditando(false);
      consulta.refrescar();
    }
  }
  const c = consulta.datos;
  return (
    <section aria-label="Ficha del cliente">
      <AvisosAccion accion={accion} />
      {sinCambios && <p className="aviso">{sinCambios}</p>}
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {consulta.cargando ? (
        <Cargando texto="Cargando ficha e historial…" />
      ) : (
        c && (
          <>
            <Tarjeta>
              <header className="cuadratura-cabecera">
                <div>
                  <p className="ceja">CLIENTE #{c.id_cliente}</p>
                  <h2>{c.nombre}</h2>
                </div>
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setEditando(true);
                    setSinCambios('');
                  }}
                >
                  Editar cliente
                </Boton>
              </header>
              <dl className="datos-ficha">
                <div>
                  <dt>Teléfono</dt>
                  <dd>{c.telefono}</dd>
                </div>
                <div>
                  <dt>Dirección principal</dt>
                  <dd>
                    {c.direccion_principal} · {c.comuna}
                  </dd>
                </div>
                <div>
                  <dt>Cantidad de pedidos</dt>
                  <dd>{c.cantidad_pedidos}</dd>
                </div>
                <div>
                  <dt>Último pedido</dt>
                  <dd>
                    {c.fecha_ultimo_pedido
                      ? fecha(c.fecha_ultimo_pedido)
                      : 'Sin pedidos registrados'}
                  </dd>
                </div>
              </dl>
              {c.telefono_revision === 1 && (
                <p className="aviso aviso-error">
                  Contacto provisional de la migración: debe revisarse antes de
                  crear pedidos por teléfono.
                </p>
              )}
              <div className="acciones-flex">
                <Boton
                  onClick={() => onNuevo(c)}
                  disabled={c.telefono_revision === 1}
                >
                  Nuevo pedido para este cliente
                </Boton>
                <Boton variante="secundario" onClick={consulta.refrescar}>
                  Actualizar historial
                </Boton>
              </div>
            </Tarjeta>
            {editando && (
              <EditorCliente
                key={id}
                cliente={c}
                guardar={guardar}
                cancelar={() => setEditando(false)}
                ocupado={accion.enviando}
              />
            )}
            <Tarjeta className="seccion-admin">
              <h3>Historial reciente</h3>
              <p className="nota">
                Últimos 10 pedidos registrados en Mongo. El contador incluye los
                pedidos guardados, también cancelados; los eliminados no se
                cuentan. Si hay sincronización pendiente, actualiza después.
              </p>
              {c.pedidos_recientes.length ? (
                <Tabla
                  titulo="Pedidos recientes del cliente"
                  columnas={[
                    'Pedido',
                    'Fecha',
                    'Estado',
                    'Entrega',
                    'Total',
                    'Acción',
                  ]}
                >
                  {c.pedidos_recientes.map((p) => (
                    <tr key={p._id}>
                      <td>#{p.id_venta}</td>
                      <td>{fecha(p.creado_en)}</td>
                      <td>
                        <Insignia estado={p.estado} />
                      </td>
                      <td>
                        {p.direccion_entrega.calle} {p.direccion_entrega.numero}
                        <small className="dato-secundario">
                          {p.direccion_entrega.comuna}
                        </small>
                      </td>
                      <td>{clp(p.total)}</td>
                      <td>
                        <Link to={`/admin/pedidos/${p._id}`}>
                          Ver pedido #{p.id_venta}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Tabla>
              ) : (
                <p className="aviso">
                  Este cliente todavía no tiene pedidos registrados.
                </p>
              )}
            </Tarjeta>
          </>
        )
      )}
    </section>
  );
}
