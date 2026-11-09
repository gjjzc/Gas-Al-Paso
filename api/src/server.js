import { asegurarIndiceClientes } from './services/indices-clientes.js';
import { app } from './app.js';
import { crearAdminInicial } from './scripts/crearAdmin.js';
import { conectarMongo, conectarRedis, mongoClient, redisClient } from './config/databases.js';

await Promise.all([conectarMongo(), conectarRedis()]);
await asegurarIndiceClientes();
await crearAdminInicial();

// Todas las operaciones persistentes utilizan MongoDB y Redis.
const servidor = app.listen(process.env.PORT || 4000, '0.0.0.0', () => {
  console.log('API Gas al Paso iniciada con MongoDB y Redis.');
});

function cerrar() {
  servidor.close(async () => {
    await Promise.allSettled([
      mongoClient.close(),
      redisClient.isOpen ? redisClient.quit() : Promise.resolve(),
    ]);
    process.exit(0);
  });
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
