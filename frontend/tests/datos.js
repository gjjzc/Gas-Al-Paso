import { randomInt, randomBytes } from 'node:crypto';
// Cada cuenta temporal necesita un teléfono único.
export const telefonoTemporal = () => `9${randomInt(10000000, 89999999)}`;

// Claves aleatorias solo en memoria para usuarios creados por las verificaciones.
const claves = new Map();
export function claveTemporal(nombre) {
  if (!claves.has(nombre)) claves.set(nombre, randomBytes(24).toString('hex'));
  return claves.get(nombre);
}
