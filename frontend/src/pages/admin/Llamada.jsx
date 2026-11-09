import { useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/Auth.jsx';
import { BuscadorClientes } from '../../components/BuscadorClientes.jsx';
import { FichaCliente } from '../../components/FichaCliente.jsx';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useOperacion } from '../../hooks/useOperacion.js';
import { calcularImportes } from '../../services/importes.js';
import { normalizarTelefono } from '../../services/telefono.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  ErrorAviso,
  Formulario,
  Tarjeta,
  Totales,
} from '../../components/UI.jsx';
import { SelectorItems } from '../../components/Admin.jsx';
import { Confirmacion } from '../../components/Confirmacion.jsx';
import { OperacionPendiente, pago } from '../../components/Repartidor.jsx';
function precargar(cliente, telefono = '') {
  const d = cliente?.direccion_entrega_sugerida;
  return {
    nombre: cliente?.nombre || '',
    telefono: cliente?.telefono || telefono,
    calle: d?.calle || cliente?.direccion_principal || '',
    numero: d?.numero || '',
    comuna: String(cliente?.id_comuna || ''),
    referencia: d?.referencia || '',
    metodo: 'EFECTIVO',
    guardar: false,
  };
}
function CargarCliente({ id }) {
  const consulta = useConsulta(`/clientes/${id}`);
  if (consulta.cargando)
    return <Cargando texto="Precargando datos del cliente…" />;
  if (consulta.error)
    return (
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
    );
  return <FormularioLlamada clienteInicial={consulta.datos} />;
}
export function Llamada() {
  const [query] = useSearchParams();
  const location = useLocation();
  const { usuario } = useAuth();
  const id = query.get('cliente');
  // Permitir recuperar la solicitud original aunque Mongo no este disponible para leer la ficha.
  const pendiente = sessionStorage.getItem(
    `gas-al-paso.operacion.${usuario.id_usuario}.admin-llamada`,
  );
  return id && !pendiente ? (
    <CargarCliente key={id} id={id} />
  ) : (
    <FormularioLlamada
      telefonoInicial={
        typeof location.state?.telefono === 'string'
          ? location.state.telefono
          : ''
      }
    />
  );
}
function FormularioLlamada({ clienteInicial = null, telefonoInicial = '' }) {
  const [seleccion, setSeleccion] = useState({});
  const [revision, setRevision] = useState(null);
  const [errores, setErrores] = useState({});
  const [formulario, setFormulario] = useState(() =>
    precargar(clienteInicial, telefonoInicial),
  );
  const [ficha, setFicha] = useState(null);
  const [principalLibre, setPrincipalLibre] = useState(
    Boolean(clienteInicial && !clienteInicial.direccion_entrega_sugerida),
  );
  const comunas = useConsulta('/comunas', { publico: true });
  const operacion = useOperacion('admin-llamada');
  const navegar = useNavigate();
  const items = Object.values(seleccion).sort(
    (a, b) => a.id_producto - b.id_producto,
  );
  const totales = calcularImportes(items);
  function valor(campo) {
    return {
      value: formulario[campo],
      onChange: (e) => {
        setFormulario((a) => ({ ...a, [campo]: e.target.value }));
        setErrores((a) => ({ ...a, [campo]: '' }));
        operacion.limpiarErrorCampo(campo);
      },
    };
  }
  function cambiarItems(cambio) {
    setSeleccion(cambio);
    setErrores((a) => ({ ...a, items: '' }));
    operacion.limpiarErrorCampo('items');
  }
  function revisar(e) {
    e.preventDefault();
    const errores = {};
    const f = formulario;
    if (f.nombre.trim().length < 2 || f.nombre.trim().length > 80)
      errores.nombre = 'Ingresa un nombre de 2 a 80 caracteres.';
    if (!normalizarTelefono(f.telefono))
      errores.telefono =
        'Usa 9 dígitos comenzando con 9; también puedes escribir +56.';
    if (!f.calle.trim() || f.calle.trim().length > 150)
      errores.calle = 'Ingresa una calle de hasta 150 caracteres.';
    if (!f.numero.trim() || f.numero.trim().length > 20)
      errores.numero = 'Ingresa un número de hasta 20 caracteres.';
    if (!comunas.datos?.some((c) => c.id_comuna === Number(f.comuna)))
      errores.comuna = 'Selecciona una comuna de la lista.';
    if (!items.length || items.length > 50)
      errores.items =
        'Selecciona entre 1 y 50 productos con cantidad mayor a cero.';
    setErrores(errores);
    if (Object.keys(errores).length) return;
    setRevision({
      cliente: {
        nombre: f.nombre.trim(),
        telefono: normalizarTelefono(f.telefono),
        direccion: {
          calle: f.calle.trim(),
          numero: f.numero.trim(),
          comuna: Number(f.comuna),
          referencia: f.referencia.trim(),
        },
      },
      guardar_como_principal: f.guardar,
      metodo_cobro: f.metodo,
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
        titulo: `Pedido por llamada · ${formulario.nombre}`,
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
      <Encabezado etiqueta="ATENCIÓN TELEFÓNICA" titulo="Pedido por llamada">
        Solo necesitas los datos de contacto. No requiere cuenta, correo ni
        contraseña.
      </Encabezado>
      <ErrorAviso mensaje={operacion.error} />
      <OperacionPendiente operacion={operacion} reintentar={reintentar} />
      <div hidden={!!operacion.pendiente}>
        <Tarjeta className="buscador-en-llamada">
          <h2>Buscar cliente (opcional)</h2>
          <BuscadorClientes
            onElegir={setFicha}
            onCrear={(telefono) => {
              setFormulario(precargar(null, telefono));
              setFicha(null);
              setErrores({});
              setPrincipalLibre(false);
            }}
          />
          {ficha && (
            <FichaCliente
              key={ficha}
              id={ficha}
              onNuevo={(c) => {
                setFormulario(precargar(c));
                setFicha(null);
                setErrores({});
                setPrincipalLibre(!c.direccion_entrega_sugerida);
              }}
            />
          )}
        </Tarjeta>
        {principalLibre && (
          <p className="aviso">
            La dirección principal está guardada como texto. Verifica la calle y
            completa el número antes de confirmar; no hemos separado esos datos
            automáticamente.
          </p>
        )}
        <Tarjeta>
          <h2>1. Productos y cantidades</h2>
          <SelectorItems seleccion={seleccion} cambiar={cambiarItems} />
          {errores.items && (
            <p className="campo-error" role="alert">
              {errores.items}
            </p>
          )}
        </Tarjeta>
        <Formulario
          noValidate
          onSubmit={revisar}
          className="formulario dos-columnas seccion-admin"
        >
          <Tarjeta>
            <h2>2. Contacto y entrega</h2>
            <div className="form-grid">
              <Campo
                label="Nombre"
                {...valor('nombre')}
                maxLength={80}
                autoComplete="name"
                error={errores.nombre || operacion.errorCampos?.nombre}
                required
              />
              <Campo
                label="Teléfono"
                {...valor('telefono')}
                type="tel"
                inputMode="tel"
                maxLength={40}
                autoComplete="tel"
                ayuda="Formato: 912345678 o +56 9 1234 5678. Reutilizaremos el cliente si su teléfono ya existe."
                error={errores.telefono || operacion.errorCampos?.telefono}
                required
              />
              <Campo
                label="Calle"
                {...valor('calle')}
                maxLength={150}
                autoComplete="address-line1"
                error={errores.calle || operacion.errorCampos?.calle}
                required
              />
              <Campo
                label="Número"
                {...valor('numero')}
                maxLength={20}
                error={errores.numero || operacion.errorCampos?.numero}
                required
              />
            </div>
            <ErrorAviso
              mensaje={comunas.error}
              reintentar={comunas.refrescar}
            />
            <Campo
              label="Comuna"
              {...valor('comuna')}
              error={errores.comuna || operacion.errorCampos?.comuna}
              required
            >
              <option value="">Selecciona comuna</option>
              {comunas.datos?.map((c) => (
                <option key={c.id_comuna} value={c.id_comuna}>
                  {c.nombre}
                </option>
              ))}
            </Campo>
            <Campo
              label="Referencia (opcional)"
              {...valor('referencia')}
              error={errores.referencia || operacion.errorCampos?.referencia}
              maxLength={200}
            />
            <Campo label="Método de cobro" {...valor('metodo')}>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
            </Campo>
            <div className="checks-admin">
              <label>
                <input
                  type="checkbox"
                  checked={formulario.guardar}
                  onChange={(e) =>
                    setFormulario((a) => ({ ...a, guardar: e.target.checked }))
                  }
                />
                Guardar esta dirección como principal
              </label>
            </div>
            <p className="nota">
              Si el cliente ya existe, su dirección principal se conserva salvo
              que marques esta opción. Un cliente nuevo guarda esta primera
              dirección.
            </p>
          </Tarjeta>
          <Tarjeta className="resumen">
            <h2>Resumen de la llamada</h2>
            <Totales datos={totales} />
            <p className="nota">
              10% de descuento desde $30.000. Pago contra entrega; el stock y el
              precio definitivo se validan al confirmar.
            </p>
            <Boton
              type="submit"
              disabled={!comunas.datos?.length || operacion.enviando}
            >
              Revisar pedido telefónico
            </Boton>
          </Tarjeta>
        </Formulario>
      </div>
      {revision && (
        <Confirmacion
          titulo="Confirmar pedido por llamada"
          texto="Crear pedido telefónico"
          ocupado={operacion.enviando}
          cancelar={() => setRevision(null)}
          aceptar={confirmar}
        >
          <p>
            {revision.cliente.nombre} · {revision.cliente.telefono}
          </p>
          <p>
            {revision.cliente.direccion.calle}{' '}
            {revision.cliente.direccion.numero}
          </p>
          <p>{pago(revision.metodo_cobro)} contra entrega</p>
          <Totales datos={totales} />
        </Confirmacion>
      )}
    </>
  );
}
