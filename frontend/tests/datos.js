import { randomInt } from 'node:crypto';
// Cada cuenta ficticia necesita un telefono propio desde la migracion 10.
export const telefonoPrueba = () => `9${randomInt(10000000, 89999999)}`;
