import { useState } from 'react';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useAccion } from '../../hooks/useAccion.js';
import { fecha } from '../../services/api.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  ErrorAviso,
  Formulario,
  Tarjeta,
} from '../../components/UI.jsx';
import { AvisosAccion, Paginacion } from '../../components/Admin.jsx';
const tipos = [
  'CAMBIO_PRECIO',
  'CAMBIO_STOCK',
  'ASIGNACION',
  'CAMBIO_ESTADO',
  'ENTREGA',
  'CANCELACION',
  'CIERRE_CAJA',
  'CARGA_DIARIA',
  'VENTA_TARREO',
  'VENTA_CREADA',
  'VENTA_RECHAZADA_STOCK',
  'EDICION_CATALOGO',
];
export function Auditoria() {
  const [filtros, setFiltros] = useState({});
  const [pagina, setPagina] = useState(0);
  const accion = useAccion();
  const consulta = useConsulta(
    `/auditoria?${new URLSearchParams({ ...filtros, limite: 15, offset: pagina * 15 })}`,
  );
  async function sincronizar() {
    const r = await accion.ejecutar(
      '/sincronizacion/reintentar',
      'POST',
      undefined,
      'Reintento de sincronización ejecutado.',
    );
    if (r) consulta.refrescar();
  }
  return (
    <>
      <Encabezado
        etiqueta="TRAZABILIDAD"
        titulo="Auditoría"
        accion={
          <Boton
            variante="secundario"
            disabled={accion.enviando}
            onClick={sincronizar}
          >
            Reintentar sincronización
          </Boton>
        }
      >
        Cambios de precio y stock, ventas, asignaciones y cierres registrados.
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
            label="Tipo de evento"
            name="tipo"
            list="tipos-auditoria"
            maxLength={40}
          />
          <datalist id="tipos-auditoria">
            {tipos.map((t) => (
              <option value={t} key={t} />
            ))}
          </datalist>
          <Campo label="Fecha del evento (UTC)" name="fecha" type="date" />
          <Campo
            label="ID de usuario (opcional)"
            name="id_usuario"
            type="number"
            inputMode="numeric"
            min="1"
            max="999999999"
            step="1"
          />
          <Campo
            label="ID de empleado (opcional)"
            name="id_empleado"
            type="number"
            inputMode="numeric"
            min="1"
            max="999999999"
            step="1"
          />
          <Boton type="submit">Filtrar auditoría</Boton>
        </Formulario>
      </Tarjeta>
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      {consulta.cargando ? (
        <Cargando />
      ) : (
        consulta.datos && (
          <>
            <p className="nota">
              {consulta.datos.length} eventos en esta página. Las fechas del
              filtro usan UTC; las horas se muestran según tu navegador.
            </p>
            <div className="eventos-admin">
              {consulta.datos.map((e) => (
                <Tarjeta as="article" key={e._id}>
                  <header>
                    <span className="insignia">{e.tipo}</span>
                    <time dateTime={e.fecha}>{fecha(e.fecha)}</time>
                  </header>
                  <p className="nota">
                    Usuario #{e.usuario.id} · {e.usuario.rol}
                  </p>
                  <details>
                    <summary>Ver detalle del evento</summary>
                    <pre>{JSON.stringify(e.detalle, null, 2)}</pre>
                  </details>
                </Tarjeta>
              ))}
            </div>
            {!consulta.datos.length && (
              <Tarjeta className="vacio">
                <h2>No hay eventos para estos filtros</h2>
              </Tarjeta>
            )}
            <Paginacion
              pagina={pagina}
              cambiar={setPagina}
              longitud={consulta.datos.length}
            />
          </>
        )
      )}
    </>
  );
}
