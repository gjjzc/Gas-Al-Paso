// Se ejecuta solo al crear un volumen nuevo. No crea datos de negocio.
const base = db.getSiblingDB('gas_al_paso');
base.createCollection('eventos_auditoria');
