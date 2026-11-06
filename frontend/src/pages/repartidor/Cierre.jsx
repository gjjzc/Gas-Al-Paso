import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useOperacion } from '../../hooks/useOperacion.js';
import { clp } from '../../services/api.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  ErrorAviso,
  Formulario,
  Tarjeta,
} from '../../components/UI.jsx';
import { Confirmacion } from '../../components/Confirmacion.jsx';
import { OperacionPendiente } from '../../components/Repartidor.jsx';
const diferencia = (a, b) => (Math.round(a * 100) - Math.round(b * 100)) / 100;
export function ResultadoCuadratura({ datos }) {
  return (
    <section
      aria-label="Resultado de cuadratura"
      className="cuadratura-resultado"
    >
      <div
        className={`aviso ${datos.descuadre ? 'aviso-error' : 'aviso-exito'}`}
        role="status"
      >
        <strong>
          {datos.estado === 'CUADRADO'
            ? 'Jornada cuadrada'
            : 'Cierre con descuadre'}
        </strong>
        <span>
          Cierre #{datos.cierre.id_cierre} · {datos.fecha}
        </span>
      </div>
      {datos.sincronizacion === 'PENDIENTE' && (
        <p className="aviso">
          El cierre quedó guardado en Oracle. Su auditoría se sincronizará
          cuando Mongo esté disponible.
        </p>
      )}
      {datos.cierre.desactualizado && (
        <p className="aviso aviso-error">
          Los movimientos actuales difieren del cierre guardado. Administración
          debe revisar la jornada.
        </p>
      )}
      <div className="indicadores-jornada">
        {['efectivo', 'transferencia', 'total'].map((k) => (
          <Tarjeta key={k}>
            <small>
              {k === 'efectivo'
                ? 'Efectivo'
                : k === 'transferencia'
                  ? 'Transferencia'
                  : 'Total dinero'}
            </small>
            <strong>{clp(datos.dinero[k].entregado)}</strong>
            <span>Esperado: {clp(datos.dinero[k].esperado)}</span>
            <p
              className={
                datos.dinero[k].descuadre ? 'texto-error' : 'texto-exito'
              }
            >
              Diferencia: {clp(datos.dinero[k].diferencia)}
            </p>
          </Tarjeta>
        ))}
      </div>
      <h2>Cuadratura de balones</h2>
      <div className="balones-cierre">
        {datos.balones.map((b) => (
          <Tarjeta key={b.id_producto}>
            <h3>{b.nombre}</h3>
            <dl className="datos-balon">
              <div>
                <dt>Cargado</dt>
                <dd>{b.cargado}</dd>
              </div>
              <div>
                <dt>Vendido</dt>
                <dd>{b.vendido}</dd>
              </div>
              <div>
                <dt>Devuelto</dt>
                <dd>{b.devuelto}</dd>
              </div>
              <div className={b.descuadre ? 'texto-error' : 'texto-exito'}>
                <dt>Diferencia</dt>
                <dd>
                  {b.diferencia > 0 ? '+' : ''}
                  {b.diferencia}
                </dd>
              </div>
            </dl>
            <p className={b.descuadre ? 'texto-error' : 'texto-exito'}>
              {b.descuadre ? 'Descuadre de balones' : 'Balones cuadrados'}
            </p>
          </Tarjeta>
        ))}
      </div>
      {!datos.balones.length && (
        <p className="nota">
          No hubo balones cargados ni vendidos para esta fecha.
        </p>
      )}
      {datos.cierre.observacion && (
        <Tarjeta>
          <h2>Observación</h2>
          <p>{datos.cierre.observacion}</p>
        </Tarjeta>
      )}
      <p className="nota">
        Dinero: entregado − esperado. Balones: vendido + devuelto − cargado. Un
        cero total no oculta diferencias entre métodos o productos. El cierre no
        modifica el stock global.
      </p>
    </section>
  );
}
export function Cierre() {
  const [dia, setDia] = useState('');
  const [revision, setRevision] = useState(null);
  const consulta = useConsulta(`/cierre${dia ? `?fecha=${dia}` : ''}`, {
    intervalo: 15000,
  });
  const operacion = useOperacion('cierre');
  const reporte = operacion.resultado || consulta.datos;
  async function guardar() {
    const r = await operacion.ejecutar({
      ruta: '/cierre',
      body: revision.body,
      vista: {
        titulo: `Cierre del ${revision.body.fecha}`,
        total:
          revision.body.entregado_efectivo +
          revision.body.entregado_transferencia,
      },
    });
    setRevision(null);
    if (r) consulta.refrescar();
  }
  async function reintentar() {
    const r = await operacion.ejecutar();
    if (r) consulta.refrescar();
  }
  function revisar(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      fecha: reporte.fecha,
      entregado_efectivo: Number(f.get('efectivo')),
      entregado_transferencia: Number(f.get('transferencia')),
      devueltos: reporte.balones.map((b) => ({
        id_producto: b.id_producto,
        devuelto: Number(f.get(`devuelto-${b.id_producto}`)),
      })),
      observacion: f.get('observacion'),
    };
    const difE = diferencia(
      body.entregado_efectivo,
      reporte.dinero.efectivo.esperado,
    );
    const difT = diferencia(
      body.entregado_transferencia,
      reporte.dinero.transferencia.esperado,
    );
    const balones = reporte.balones.map((b) => ({
      ...b,
      devuelto: body.devueltos.find((d) => d.id_producto === b.id_producto)
        .devuelto,
    }));
    setRevision({
      body,
      difE,
      difT,
      descuadre:
        difE !== 0 ||
        difT !== 0 ||
        balones.some((b) => b.vendido + b.devuelto - b.cargado !== 0),
    });
  }
  return (
    <>
      <Encabezado
        etiqueta="TERMINA TU JORNADA"
        titulo="Cierre de caja"
        accion={
          <Boton variante="secundario" onClick={consulta.refrescar}>
            Actualizar jornada
          </Boton>
        }
      >
        Cuenta el dinero y los balones que devuelves antes de cerrar.
      </Encabezado>
      <Campo
        label="Fecha de cierre"
        type="date"
        value={dia || reporte?.fecha || ''}
        disabled={!!operacion.pendiente || operacion.enviando}
        onChange={(e) => {
          setDia(e.target.value);
          operacion.nueva();
          setRevision(null);
        }}
      />
      <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
      <ErrorAviso mensaje={operacion.error} />
      <OperacionPendiente operacion={operacion} reintentar={reintentar} />
      {consulta.cargando && !reporte ? (
        <Cargando texto="Calculando tu jornada…" />
      ) : (
        reporte && (
          <>
            {reporte.cierre ? (
              <ResultadoCuadratura datos={reporte} />
            ) : (
              !operacion.pendiente && (
                <>
                  <div className="indicadores-jornada">
                    <Tarjeta>
                      <small>Efectivo esperado</small>
                      <strong>{clp(reporte.dinero.efectivo.esperado)}</strong>
                      <span>Ventas cobradas</span>
                    </Tarjeta>
                    <Tarjeta>
                      <small>Transferencia esperada</small>
                      <strong>
                        {clp(reporte.dinero.transferencia.esperado)}
                      </strong>
                      <span>Ventas cobradas</span>
                    </Tarjeta>
                    <Tarjeta>
                      <small>Total esperado</small>
                      <strong>{clp(reporte.dinero.total.esperado)}</strong>
                      <span>{reporte.ventas.cantidad} ventas cobradas</span>
                    </Tarjeta>
                  </div>
                  {reporte.pedidos_sin_resolver.length > 0 && (
                    <Tarjeta className="pendientes-cierre">
                      <h2>No puedes cerrar todavía</h2>
                      <p>
                        Tienes {reporte.pedidos_sin_resolver.length} pedidos
                        propios sin resolver, incluyendo otras fechas. Entrega
                        los pedidos o solicita a administración resolverlos.
                      </p>
                      <ul>
                        {reporte.pedidos_sin_resolver.map((p) => (
                          <li key={p.id_venta}>Pedido #{p.id_venta}</li>
                        ))}
                      </ul>
                      <Link
                        className="boton boton-principal"
                        to="/repartidor/pedidos"
                      >
                        Ir a mis pedidos
                      </Link>
                    </Tarjeta>
                  )}
                  <Formulario key={reporte.fecha} onSubmit={revisar}>
                    <Tarjeta className="declaracion-cierre">
                      <h2>Dinero que entregas</h2>
                      <p className="nota">
                        Ingresa los importes reales por método, aunque sean
                        cero. Las diferencias quedarán registradas.
                      </p>
                      <div className="form-grid">
                        <Campo
                          label="Efectivo entregado"
                          name="efectivo"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="9999999999.99"
                          step="0.01"
                          required
                        />
                        <Campo
                          label="Transferencia entregada"
                          name="transferencia"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="9999999999.99"
                          step="0.01"
                          required
                        />
                      </div>
                      <h2>Balones devueltos</h2>
                      <p className="nota">
                        Declara lo que contaste físicamente para cada producto,
                        incluso si es cero.
                      </p>
                      <div className="balones-cierre">
                        {reporte.balones.map((b) => (
                          <div className="devolucion-balon" key={b.id_producto}>
                            <h3>{b.nombre}</h3>
                            <p className="nota">
                              Cargados: {b.cargado} · Vendidos: {b.vendido} ·
                              Devolución esperada: {b.cargado - b.vendido}
                            </p>
                            <Campo
                              label={`Devueltos de ${b.nombre}`}
                              name={`devuelto-${b.id_producto}`}
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max="999999999"
                              step="1"
                              required
                            />
                          </div>
                        ))}
                      </div>
                      {!reporte.balones.length && (
                        <p className="nota">
                          No hay balones que declarar en esta fecha.
                        </p>
                      )}
                      <Campo
                        label="Observación (opcional)"
                        name="observacion"
                        maxLength={500}
                      />
                      <p className="aviso">
                        El cierre es definitivo para esa fecha: después no
                        podrás registrar más ventas ni entregas de ese día.
                      </p>
                      <Boton
                        type="submit"
                        disabled={
                          !!reporte.pedidos_sin_resolver.length ||
                          !!consulta.error ||
                          consulta.cargando ||
                          operacion.enviando
                        }
                      >
                        Revisar cierre de jornada
                      </Boton>
                    </Tarjeta>
                  </Formulario>
                </>
              )
            )}
          </>
        )
      )}
      {revision && (
        <Confirmacion
          titulo={
            revision.descuadre
              ? 'El cierre tiene diferencias'
              : 'Confirmar cierre de jornada'
          }
          texto={
            revision.descuadre
              ? 'Guardar cierre con diferencias'
              : 'Confirmar cierre'
          }
          cancelar={() => setRevision(null)}
          ocupado={operacion.enviando}
          aceptar={guardar}
        >
          <p>Fecha: {revision.body.fecha}</p>
          <p>
            Efectivo declarado:{' '}
            <strong>{clp(revision.body.entregado_efectivo)}</strong> ·
            Diferencia: {clp(revision.difE)}
          </p>
          <p>
            Transferencia declarada:{' '}
            <strong>{clp(revision.body.entregado_transferencia)}</strong> ·
            Diferencia: {clp(revision.difT)}
          </p>
          <p>
            {revision.descuadre
              ? 'Hay diferencias de dinero o balones. Se guardarán para que administración las revise.'
              : 'El dinero y los balones coinciden con lo esperado.'}
          </p>
          <p>
            Revisa los conteos antes de guardar. Esta acción no se puede
            deshacer desde la aplicación.
          </p>
        </Confirmacion>
      )}
    </>
  );
}
