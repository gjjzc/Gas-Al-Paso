import { useState } from 'react';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useAccion } from '../../hooks/useAccion.js';
import { useAuth } from '../../context/Auth.jsx';
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
function EditorUsuario({ actual, comunas, guardar, cancelar, ocupado }) {
  const [rol, setRol] = useState(actual.rol || 'CLIENTE');
  function enviar(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const datos = { nombre: f.get('nombre'), email: f.get('email') };
    if (!actual.id_usuario) {
      datos.rol = rol;
      datos.password = f.get('password');
      datos.activo = f.has('activo');
    } else {
      if (rol !== actual.rol) datos.rol = rol;
      if (f.has('activo') !== actual.activo) datos.activo = f.has('activo');
      if (f.get('password')) datos.password = f.get('password');
    }
    if (rol === 'CLIENTE') {
      datos.telefono = f.get('telefono');
      datos.direccion_principal = f.get('direccion');
      datos.id_comuna = Number(f.get('comuna'));
    }
    guardar(datos);
  }
  return (
    <Tarjeta className="editor-admin">
      <h2>{actual.id_usuario ? 'Editar usuario' : 'Nuevo usuario'}</h2>
      {actual.telefono_revision === 1 && (
        <p className="aviso aviso-error">
          Teléfono provisional de una migración: confirma con el cliente su
          número real y actualízalo. No se usará para vincular otra cuenta
          automáticamente.
        </p>
      )}
      <Formulario onSubmit={enviar}>
        <div className="form-grid">
          <Campo
            label="Nombre del usuario"
            name="nombre"
            maxLength={80}
            defaultValue={actual.nombre || ''}
            required
          />
          <Campo
            label="Correo del usuario"
            name="email"
            type="email"
            autoComplete="off"
            maxLength={254}
            defaultValue={actual.email || ''}
            required
          />
          <Campo
            label="Rol del usuario"
            value={rol}
            disabled={Boolean(actual.id_usuario) && actual.rol === 'CLIENTE'}
            onChange={(e) => setRol(e.target.value)}
          >
            {(!actual.id_usuario || actual.rol === 'CLIENTE') && (
              <option value="CLIENTE">Cliente</option>
            )}
            <option value="REPARTIDOR">Repartidor</option>
            <option value="ADMIN">Administrador</option>
          </Campo>
          <Campo
            label={
              actual.id_usuario
                ? 'Nueva contraseña (opcional)'
                : 'Contraseña inicial'
            }
            name="password"
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            required={!actual.id_usuario}
            ayuda={
              actual.id_usuario
                ? 'Dejar en blanco conserva la contraseña actual.'
                : 'Mínimo 8 caracteres; máximo 72 bytes.'
            }
          />
        </div>
        {rol === 'CLIENTE' && (
          <>
            <div className="form-grid">
              <Campo
                label="Teléfono del cliente"
                name="telefono"
                type="tel"
                maxLength={20}
                defaultValue={actual.telefono || ''}
                required
              />
              <Campo
                label="Comuna del cliente"
                name="comuna"
                defaultValue={actual.id_comuna || ''}
                required
              >
                <option value="" disabled>
                  Selecciona comuna
                </option>
                {comunas.map((c) => (
                  <option key={c.id_comuna} value={c.id_comuna}>
                    {c.nombre}
                  </option>
                ))}
              </Campo>
            </div>
            <Campo
              label="Dirección del cliente"
              name="direccion"
              maxLength={200}
              defaultValue={actual.direccion_principal || ''}
              required
            />
          </>
        )}
        <div className="checks-admin">
          <label>
            <input
              type="checkbox"
              name="activo"
              defaultChecked={actual.activo !== false}
            />
            Usuario activo
          </label>
        </div>
        <p className="nota">
          No se puede convertir un cliente en empleado ni al revés. Las comunas
          del repartidor se gestionan en Comunas de reparto. Cambiar rol, estado
          activo o contraseña invalida las sesiones de esa cuenta.
        </p>
        <div className="acciones-flex">
          <Boton
            type="submit"
            disabled={ocupado || (rol === 'CLIENTE' && !comunas.length)}
          >
            {ocupado ? 'Guardando…' : 'Guardar usuario'}
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            disabled={ocupado}
            onClick={cancelar}
          >
            Cerrar editor
          </Boton>
        </div>
      </Formulario>
    </Tarjeta>
  );
}
export function Usuarios() {
  const [filtros, setFiltros] = useState({});
  const [pagina, setPagina] = useState(0);
  const [editar, setEditar] = useState(null);
  const [revision, setRevision] = useState(null);
  const { usuario } = useAuth();
  const accion = useAccion();
  const comunas = useConsulta('/comunas', { publico: true });
  const consulta = useConsulta(
    `/usuarios?${new URLSearchParams({ ...filtros, limite: 15, offset: pagina * 15 })}`,
  );
  async function guardar(datos, confirmado = false) {
    if (
      editar.id_usuario &&
      !confirmado &&
      (datos.rol || datos.activo !== undefined || datos.password)
    ) {
      setRevision(datos);
      return;
    }
    const r = await accion.ejecutar(
      editar.id_usuario ? `/usuarios/${editar.id_usuario}` : '/usuarios',
      editar.id_usuario ? 'PATCH' : 'POST',
      datos,
      editar.id_usuario ? 'Usuario actualizado.' : 'Usuario creado.',
    );
    setRevision(null);
    if (r) setEditar(null);
    consulta.refrescar();
  }
  return (
    <>
      <Encabezado
        etiqueta="PERSONAS Y ACCESOS"
        titulo="Usuarios"
        accion={
          <Boton
            onClick={() => {
              accion.limpiar();
              setEditar({ rol: 'CLIENTE', activo: true });
            }}
          >
            Crear usuario
          </Boton>
        }
      >
        Clientes, repartidores y administradores, con permisos separados.
      </Encabezado>
      <AvisosAccion accion={accion} />
      <Tarjeta className="filtros-admin">
        <Formulario
          onSubmit={(e) => {
            e.preventDefault();
            setFiltros(
              Object.fromEntries(
                [...new FormData(e.currentTarget)].filter(([, v]) => v),
              ),
            );
            setPagina(0);
          }}
        >
          <Campo
            label="Buscar usuario por nombre o correo"
            name="buscar"
            type="search"
            maxLength={100}
          />
          <Campo label="Filtrar rol" name="rol" defaultValue="">
            <option value="">Todos los roles</option>
            <option value="CLIENTE">Cliente</option>
            <option value="REPARTIDOR">Repartidor</option>
            <option value="ADMIN">Administrador</option>
          </Campo>
          <Campo label="Filtrar acceso" name="activo" defaultValue="">
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </Campo>
          <Boton type="submit">Buscar usuarios</Boton>
        </Formulario>
      </Tarjeta>
      <ErrorAviso mensaje={comunas.error} reintentar={comunas.refrescar} />
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {editar && (
        <EditorUsuario
          key={editar.id_usuario || 'nuevo'}
          actual={editar}
          comunas={comunas.datos || []}
          guardar={guardar}
          cancelar={() => setEditar(null)}
          ocupado={accion.enviando}
        />
      )}
      {consulta.cargando ? (
        <Cargando />
      ) : (
        consulta.datos && (
          <>
            <Tarjeta>
              <Tabla
                titulo="Cuentas de usuario"
                columnas={['Nombre', 'Correo', 'Rol', 'Acceso', 'Acciones']}
              >
                {consulta.datos.map((u) => (
                  <tr key={u.id_usuario}>
                    <td>
                      {u.nombre}
                      {u.id_usuario === usuario.id_usuario && (
                        <small className="dato-secundario">Tu cuenta</small>
                      )}
                    </td>
                    <td>{u.email}</td>
                    <td>{u.rol}</td>
                    <td>
                      <span
                        className={`insignia ${u.activo ? 'estado-ENTREGADO' : 'estado-CANCELADO'}`}
                      >
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <Boton
                        variante="secundario"
                        disabled={accion.enviando}
                        onClick={() => {
                          accion.limpiar();
                          setEditar(u);
                        }}
                      >
                        Editar <span className="sr-only">{u.email}</span>
                      </Boton>
                    </td>
                  </tr>
                ))}
              </Tabla>
              {!consulta.datos.length && (
                <p className="nota">No hay usuarios para esta búsqueda.</p>
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
      {revision && (
        <Confirmacion
          titulo="Confirmar cambio de acceso"
          texto="Guardar cambio de acceso"
          ocupado={accion.enviando}
          cancelar={() => setRevision(null)}
          aceptar={() => guardar(revision, true)}
        >
          <p>{editar.email}</p>
          <p>
            Se invalidarán las sesiones de esta cuenta. No se permite desactivar
            al último administrador activo.
          </p>
          {editar.id_usuario === usuario.id_usuario && (
            <p className="aviso">
              Es tu propia cuenta: tendrás que volver a iniciar sesión y podrías
              perder acceso a administración.
            </p>
          )}
        </Confirmacion>
      )}
    </>
  );
}
