import 'dotenv/config';

export const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('Configura JWT_SECRET con al menos 32 bytes aleatorios en .env.');
}
export const jwtOpciones = { algorithm: 'HS256', issuer: 'gas-al-paso', audience: 'gas-al-paso-api', expiresIn: '1h' };
