// Además del ping, exigir primario y acceso con el usuario real de la aplicación.
try {
  const aplicacion = db.getSiblingDB('gas_al_paso');
  if (!aplicacion.auth(process.env.MONGO_APP_USER, process.env.MONGO_APP_PASSWORD)) quit(1);
  const estado = db.hello();
  quit(estado.setName === 'rs0' && estado.isWritablePrimary &&
    aplicacion.runCommand({ ping: 1 }).ok === 1 ? 0 : 1);
} catch {
  quit(1);
}
