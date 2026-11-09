import { randomBytes } from 'node:crypto';
const claves = new Map();
export function claveTemporal(nombre) {
  if (!claves.has(nombre)) claves.set(nombre, randomBytes(24).toString('hex'));
  return claves.get(nombre);
}
