import { mongoDb, conectarMongo } from '../config/databases.js';
let pendiente;
export async function asegurarIndiceClientes() {
  await conectarMongo();
  if (!pendiente)
    pendiente = (async () => {
      await mongoDb
        .collection('pedidos')
        .createIndex(
          { 'cliente.id_cliente': 1, creado_en: -1, _id: -1 },
          { name: 'ix_pedido_cliente_reciente' },
        );
    })().catch((error) => {
      pendiente = undefined;
      throw error;
    });
  return pendiente;
}
