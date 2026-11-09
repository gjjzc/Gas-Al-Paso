import { mongoDb } from '../config/databases.js';
import { consultar, conConexion, transaccion } from './oracle.js';
import { exigir } from '../middlewares/validar.js';
import { errorCampo } from '../middlewares/validar-cliente.js';
import { validarComuna } from './clientes.js';
import { auditar, estadoSincronizacion } from './sincronizacion.js';
import { asegurarIndiceClientes } from './indices-clientes.js';
const columnas = `SELECT c.id_cliente,c.nombre,c.telefono,c.telefono_revision,c.direccion_principal,c.id_comuna,
  co.nombre comuna,c.calle_principal,c.numero_principal,c.referencia_principal FROM Cliente c JOIN Comuna co ON co.id_comuna=c.id_comuna`;
async function fila(c, id, bloquear = false) {
  // El bloqueo solo afecta Cliente; no bloquea la tabla de comunas.
  if (bloquear) {
    const [r] = await consultar(
      c,
      'SELECT id_cliente FROM Cliente WHERE id_cliente=:id FOR UPDATE',
      { id },
    );
    exigir(r, 'Cliente no encontrado.', 404);
  }
  const [r] = await consultar(c, `${columnas} WHERE c.id_cliente=:id`, { id });
  exigir(r, 'Cliente no encontrado.', 404);
  return r;
}
async function resumen(ids) {
  await asegurarIndiceClientes();
  if (!ids.length) return new Map();
  const datos = await mongoDb
    .collection('pedidos')
    .aggregate([
      { $match: { 'cliente.id_cliente': { $in: ids } } },
      {
        $group: {
          _id: '$cliente.id_cliente',
          cantidad_pedidos: { $sum: 1 },
          fecha_ultimo_pedido: { $max: '$creado_en' },
        },
      },
    ])
    .toArray();
  return new Map(
    datos.map((d) => [
      d._id,
      {
        cantidad_pedidos: d.cantidad_pedidos,
        fecha_ultimo_pedido: d.fecha_ultimo_pedido,
      },
    ]),
  );
}
export async function buscar(telefono) {
  const filas = await conConexion((c) =>
    consultar(
      c,
      `${columnas} WHERE c.telefono_revision=0 AND INSTR(c.telefono,:telefono)>0
    ORDER BY CASE WHEN c.telefono=:telefono THEN 0 ELSE 1 END,c.nombre,c.id_cliente FETCH FIRST 10 ROWS ONLY`,
      { telefono },
    ),
  );
  const estadisticas = await resumen(filas.map((c) => c.id_cliente));
  return filas.map((c) => ({
    ...c,
    ...(estadisticas.get(c.id_cliente) || {
      cantidad_pedidos: 0,
      fecha_ultimo_pedido: null,
    }),
  }));
}
function sugerencia(cliente) {
  if (!cliente.calle_principal || !cliente.numero_principal) return null;
  return {
    calle: cliente.calle_principal,
    numero: cliente.numero_principal,
    id_comuna: cliente.id_comuna,
    comuna: cliente.comuna,
    referencia: cliente.referencia_principal || '',
  };
}
export async function obtener(id) {
  const cliente = await conConexion((c) => fila(c, id));
  const estadisticas = await resumen([id]);
  const pedidos = await mongoDb
    .collection('pedidos')
    .find(
      { 'cliente.id_cliente': id },
      {
        projection: {
          _id: 1,
          id_venta: 1,
          estado: 1,
          creado_en: 1,
          total: 1,
          canal: 1,
          direccion_entrega: 1,
          metodo_cobro: 1,
        },
      },
    )
    .sort({ creado_en: -1, _id: -1 })
    .limit(10)
    .toArray();
  let direccion = sugerencia(cliente);
  if (!direccion) {
    // Datos antiguos: solo reutilizar una direccion realmente registrada que coincida
    // con la principal. No separar calle/numero a partir de una expresion regular.
    const p = await mongoDb
      .collection('pedidos')
      .findOne(
        {
          'cliente.id_cliente': id,
          'direccion_entrega.comuna': cliente.comuna,
          $expr: {
            $eq: [
              {
                $trim: {
                  input: {
                    $concat: [
                      '$direccion_entrega.calle',
                      ' ',
                      '$direccion_entrega.numero',
                    ],
                  },
                },
              },
              { $literal: cliente.direccion_principal.trim() },
            ],
          },
        },
        {
          sort: { creado_en: -1, _id: -1 },
          projection: { direccion_entrega: 1 },
        },
      );
    if (p) direccion = { ...p.direccion_entrega, id_comuna: cliente.id_comuna };
  }
  return {
    ...cliente,
    ...(estadisticas.get(id) || {
      cantidad_pedidos: 0,
      fecha_ultimo_pedido: null,
    }),
    direccion_entrega_sugerida: direccion,
    pedidos_recientes: pedidos.map((p) => ({ ...p, _id: p._id.toHexString() })),
  };
}
export async function editar(id, datos, usuario) {
  const r = await transaccion(async (c) => {
    const anterior = await fila(c, id, true);
    let direccion;
    if (datos.direccion) {
      const d = datos.direccion;
      let comuna;
      if (d.nombre_comuna) {
        [comuna] = await consultar(
          c,
          'SELECT id_comuna,nombre FROM Comuna WHERE LOWER(nombre)=LOWER(:nombre)',
          { nombre: d.nombre_comuna },
        );
        if (!comuna) errorCampo('comuna', 'Selecciona una comuna existente.');
      } else comuna = await validarComuna(c, d.id_comuna);
      direccion = { ...d, id_comuna: comuna.id_comuna };
      await c.execute(
        `UPDATE Cliente SET direccion_principal=:principal,id_comuna=:comuna,calle_principal=:calle,
        numero_principal=:numero,referencia_principal=:referencia WHERE id_cliente=:id`,
        {
          principal: `${d.calle} ${d.numero}`,
          comuna: comuna.id_comuna,
          calle: d.calle,
          numero: d.numero,
          referencia: d.referencia || null,
          id,
        },
      );
    } else if (
      datos.direccion_principal !== undefined ||
      datos.id_comuna !== undefined
    ) {
      const comuna = datos.id_comuna ?? anterior.id_comuna;
      await validarComuna(c, comuna);
      await c.execute(
        `UPDATE Cliente SET direccion_principal=:direccion,id_comuna=:comuna,
        calle_principal=NULL,numero_principal=NULL,referencia_principal=NULL WHERE id_cliente=:id`,
        {
          direccion: datos.direccion_principal ?? anterior.direccion_principal,
          comuna,
          id,
        },
      );
    }
    if (datos.nombre !== undefined)
      await c.execute(
        'UPDATE Cliente SET nombre=:nombre WHERE id_cliente=:id',
        { nombre: datos.nombre, id },
      );
    const cliente = await fila(c, id);
    const eventos = [
      await auditar(c, 'CLIENTE_ACTUALIZADO', usuario, {
        id_cliente: id,
        campos: Object.keys(datos),
        antes: {
          nombre: anterior.nombre,
          direccion_principal: anterior.direccion_principal,
          id_comuna: anterior.id_comuna,
        },
        despues: {
          nombre: cliente.nombre,
          direccion_principal: cliente.direccion_principal,
          id_comuna: cliente.id_comuna,
        },
      }),
    ];
    return { cliente, eventos };
  });
  return {
    ...r.cliente,
    direccion_entrega_sugerida: sugerencia(r.cliente),
    sincronizacion: await estadoSincronizacion(r.eventos),
  };
}
