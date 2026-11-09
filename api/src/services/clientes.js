import { consultar, salidaNumero } from './oracle.js';
import { errorCampo } from '../middlewares/validar-cliente.js';
// El indice unico coordina altas concurrentes; bloquear la fila serializa su vinculacion.
export async function buscarOCrearCliente(c, datos) {
  const buscar = async () =>
    (
      await consultar(
        c,
        'SELECT * FROM Cliente WHERE telefono=:telefono FOR UPDATE',
        { telefono: datos.telefono },
      )
    )[0];
  let cliente = await buscar();
  if (cliente) return { cliente, creado: false };
  try {
    const r = await c.execute(
      `INSERT INTO Cliente(nombre,telefono,direccion_principal,id_comuna,calle_principal,numero_principal,referencia_principal)
      VALUES(:nombre,:telefono,:direccion,:comuna,:calle,:numero,:referencia) RETURNING id_cliente INTO :id`,
      {
        nombre: datos.nombre,
        telefono: datos.telefono,
        direccion: datos.direccion_principal,
        comuna: datos.id_comuna,
        calle:datos.calle_principal || null,numero:datos.numero_principal || null,referencia:datos.referencia_principal || null,
        id: salidaNumero(),
      },
    );
    cliente = (
      await consultar(c, 'SELECT * FROM Cliente WHERE id_cliente=:id', {
        id: r.outBinds.id[0],
      })
    )[0];
    return { cliente, creado: true };
  } catch (error) {
    if (error.errorNum !== 1) throw error;
    cliente = await buscar();
    if (!cliente) throw error;
    return { cliente, creado: false };
  }
}
export async function validarComuna(c, id) {
  const [comuna] = await consultar(
    c,
    'SELECT id_comuna,nombre FROM Comuna WHERE id_comuna=:id',
    { id },
  );
  if (!comuna) errorCampo('comuna', 'Selecciona una comuna existente.');
  return comuna;
}
export function exigirContactoRevisado(cliente) {
  if (cliente.telefono_revision === 1)
    errorCampo(
      'telefono',
      'Este contacto histórico requiere revisión del administrador antes de reutilizar su teléfono.',
      409,
    );
}
