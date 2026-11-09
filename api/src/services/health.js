import { conectarMongo, redisClient } from '../config/databases.js';

export async function verificarBases() {
  // Una caída no impide comprobar la otra base. Redis falla rápido si está desconectado.
  const resultados = await Promise.allSettled([
    conectarMongo().then(db => db.command({ ping: 1 })),
    redisClient.withCommandOptions({ abortSignal: AbortSignal.timeout(5000) }).ping(),
  ]);
  const [mongo, redis] = resultados.map(resultado =>
    resultado.status === 'fulfilled' ? 'OK' : 'ERROR',
  );
  return { estado: mongo === 'OK' && redis === 'OK' ? 'OK' : 'ERROR', mongo, redis };
}
