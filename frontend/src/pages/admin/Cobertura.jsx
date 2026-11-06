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
import { AvisosAccion } from '../../components/Admin.jsx';
export function Cobertura() {
  const reps = useConsulta('/repartidores');
  const comunas = useConsulta('/comunas', { publico: true });
  const accion = useAccion();
  const [empleado, setEmpleado] = useState('');
  const [seleccion, setSeleccion] = useState([]);
  function elegir(id) {
    setEmpleado(id);
    setSeleccion(
      reps.datos
        ?.find((r) => r.id_empleado === Number(id))
        ?.comunas.map((c) => c.id_comuna) || [],
    );
    accion.limpiar();
  }
  async function guardar(e) {
    e.preventDefault();
    const r = await accion.ejecutar(
      `/repartidores/${empleado}/comunas`,
      'PUT',
      { comunas: [...seleccion].sort((a, b) => a - b) },
      'Cobertura guardada.',
    );
    if (r) reps.refrescar();
  }
  return (
    <>
      <Encabezado etiqueta="COBERTURA TERRITORIAL" titulo="Comunas de reparto">
        Cada repartidor puede cubrir varias comunas. La asignación las usa para
        ordenar sugerencias.
      </Encabezado>
      <AvisosAccion accion={accion} />
      <ErrorAviso mensaje={reps.error} reintentar={reps.refrescar} />
      <ErrorAviso mensaje={comunas.error} reintentar={comunas.refrescar} />
      {reps.cargando || comunas.cargando ? (
        <Cargando />
      ) : (
        <>
          <Tarjeta>
            <Campo
              label="Repartidor de la cobertura"
              value={empleado}
              onChange={(e) => elegir(e.target.value)}
            >
              <option value="">Selecciona repartidor</option>
              {reps.datos?.map((r) => (
                <option key={r.id_empleado} value={r.id_empleado}>
                  {r.nombre}
                </option>
              ))}
            </Campo>
            {empleado && (
              <Formulario onSubmit={guardar}>
                <fieldset className="comunas-check">
                  <legend>Comunas cubiertas</legend>
                  {comunas.datos?.map((c) => (
                    <label key={c.id_comuna}>
                      <input
                        type="checkbox"
                        checked={seleccion.includes(c.id_comuna)}
                        onChange={(e) =>
                          setSeleccion((a) =>
                            e.target.checked
                              ? [...a, c.id_comuna]
                              : a.filter((id) => id !== c.id_comuna),
                          )
                        }
                      />
                      {c.nombre}
                    </label>
                  ))}
                </fieldset>
                <p className="nota">
                  Guardar reemplaza la cobertura anterior. Ninguna marcada
                  significa sin cobertura asignada.
                </p>
                <Boton
                  type="submit"
                  disabled={accion.enviando || !!comunas.error || !!reps.error}
                >
                  Guardar comunas
                </Boton>
              </Formulario>
            )}
          </Tarjeta>
          <Tarjeta className="seccion-admin">
            <Tabla
              titulo="Cobertura de repartidores activos"
              columnas={['Repartidor', 'Comunas']}
            >
              {reps.datos?.map((r) => (
                <tr key={r.id_empleado}>
                  <td>{r.nombre}</td>
                  <td>
                    {r.comunas.map((c) => c.nombre).join(', ') ||
                      'Sin cobertura'}
                  </td>
                </tr>
              ))}
            </Tabla>
          </Tarjeta>
        </>
      )}
    </>
  );
}
