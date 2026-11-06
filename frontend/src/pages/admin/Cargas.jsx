import { useState } from 'react';
import { useConsulta } from '../../hooks/useConsulta.js';
import { useOperacion } from '../../hooks/useOperacion.js';
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  ErrorAviso,
  Tabla,
  Tarjeta,
} from '../../components/UI.jsx';
import { SelectorItems } from '../../components/Admin.jsx';
import { OperacionPendiente } from '../../components/Repartidor.jsx';
import { Confirmacion } from '../../components/Confirmacion.jsx';
export function Cargas() {
  const [empleado, setEmpleado] = useState('');
  const [dia, setDia] = useState('');
  const [seleccion, setSeleccion] = useState({});
  const [confirmando, setConfirmando] = useState(false);
  const reps = useConsulta('/repartidores');
  const cargas = useConsulta(
    `/cargas?${new URLSearchParams({ ...(empleado ? { id_empleado: empleado } : {}), ...(dia ? { fecha: dia } : {}) })}`,
  );
  const operacion = useOperacion('admin-carga');
  const items = Object.values(seleccion).sort(
    (a, b) => a.id_producto - b.id_producto,
  );
  async function guardar() {
    const r = await operacion.ejecutar({
      ruta: '/cargas',
      body: {
        id_empleado: Number(empleado),
        fecha: cargas.datos.fecha,
        items: items.map((i) => ({
          id_producto: i.id_producto,
          cantidad_cargada: i.cantidad,
        })),
      },
      vista: {
        titulo: `Carga · ${reps.datos.find((r) => r.id_empleado === Number(empleado))?.nombre} · ${cargas.datos.fecha}`,
      },
    });
    setConfirmando(false);
    if (r) cargas.refrescar();
  }
  async function reintentar() {
    const r = await operacion.ejecutar();
    if (r) cargas.refrescar();
  }
  return (
    <>
      <Encabezado etiqueta="PREPARA EL REPARTO" titulo="Cargas diarias">
        Cada envío suma una carga o recarga; no reemplaza las cantidades
        anteriores.
      </Encabezado>
      <ErrorAviso mensaje={operacion.error} />
      <OperacionPendiente operacion={operacion} reintentar={reintentar} />
      {operacion.resultado && (
        <Tarjeta className="aviso-carga">
          <h2>Carga guardada</h2>
          <p className="aviso aviso-exito" role="status">
            Se sumaron las cantidades a la carga del {operacion.resultado.fecha}
            .
          </p>
          <ul>
            {operacion.resultado.items.map((i) => (
              <li key={i.id_producto}>
                {i.nombre}: +{i.cantidad_agregada} · Acumulado:{' '}
                {i.cantidad_cargada}
              </li>
            ))}
          </ul>
          <Boton
            onClick={() => {
              operacion.nueva();
              setSeleccion({});
            }}
          >
            Preparar otra carga
          </Boton>
        </Tarjeta>
      )}
      <ErrorAviso mensaje={reps.error} reintentar={reps.refrescar} />
      <div className="form-grid seccion-admin">
        <Campo
          label="Repartidor de la carga"
          value={empleado}
          disabled={!!operacion.pendiente || operacion.enviando}
          onChange={(e) => {
            setEmpleado(e.target.value);
            operacion.nueva();
            setSeleccion({});
          }}
        >
          <option value="">Selecciona un repartidor</option>
          {reps.datos?.map((r) => (
            <option key={r.id_empleado} value={r.id_empleado}>
              {r.nombre}
            </option>
          ))}
        </Campo>
        <Campo
          label="Fecha de carga"
          type="date"
          value={dia || cargas.datos?.fecha || ''}
          disabled={!!operacion.pendiente || operacion.enviando}
          onChange={(e) => {
            setDia(e.target.value);
            operacion.nueva();
          }}
        />
      </div>
      <ErrorAviso mensaje={cargas.error} reintentar={cargas.refrescar} />
      {!operacion.pendiente && !operacion.resultado && (
        <Tarjeta>
          <h2>Balones que salen a reparto</h2>
          <p className="nota">
            Solo balones activos de 5, 11, 15 y 45 kg. Este registro de control
            no cambia el stock global de la empresa.
          </p>
          <SelectorItems
            seleccion={seleccion}
            cambiar={setSeleccion}
            soloBalones
            tipo="carga"
          />
          <Boton
            className="seccion-admin"
            disabled={
              !empleado ||
              !items.length ||
              items.length > 100 ||
              !cargas.datos ||
              !!cargas.error ||
              operacion.enviando
            }
            onClick={() => setConfirmando(true)}
          >
            Revisar carga
          </Boton>
        </Tarjeta>
      )}
      <Tarjeta className="seccion-admin">
        <h2>Carga acumulada</h2>
        {cargas.cargando ? (
          <Cargando />
        ) : (
          cargas.datos && (
            <>
              <Tabla
                titulo={`Cargas del ${cargas.datos.fecha}`}
                columnas={['Repartidor', 'Producto', 'Cantidad cargada']}
              >
                {cargas.datos.cargas.map((c) => (
                  <tr key={c.id_carga}>
                    <td>{c.repartidor}</td>
                    <td>{c.producto}</td>
                    <td>{c.cantidad_cargada}</td>
                  </tr>
                ))}
              </Tabla>
              {!cargas.datos.cargas.length && (
                <p className="nota">No hay cargas para esta selección.</p>
              )}
            </>
          )
        )}
      </Tarjeta>
      {confirmando && (
        <Confirmacion
          titulo="Confirmar carga diaria"
          texto="Sumar carga"
          ocupado={operacion.enviando}
          cancelar={() => setConfirmando(false)}
          aceptar={guardar}
        >
          <p>
            {
              reps.datos?.find((r) => r.id_empleado === Number(empleado))
                ?.nombre
            }{' '}
            · {cargas.datos?.fecha}
          </p>
          <ul>
            {items.map((i) => (
              <li key={i.id_producto}>
                {i.cantidad} × {i.nombre}
              </li>
            ))}
          </ul>
          <p>Se sumará a lo ya cargado para ese día.</p>
        </Confirmacion>
      )}
    </>
  );
}
