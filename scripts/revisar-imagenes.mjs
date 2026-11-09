import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const raiz = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../frontend/public/productos/', import.meta.url));
const archivos = [];
async function recorrer(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const archivo = path.join(dir, entry.name);
    if (entry.isDirectory()) await recorrer(archivo);
    else if (/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(entry.name)) {
      const { size } = await stat(archivo);
      archivos.push({ archivo: path.relative(raiz, archivo), bytes: size });
    }
  }
}
await recorrer(raiz);
if (!archivos.length) console.log('PENDIENTE: no hay imágenes en frontend/public/productos/. No se descargó ninguna.');
for (const f of archivos) console.log(`${f.bytes > 200000 ? 'OPTIMIZAR (>200 KB)' : 'OK'} | ${f.archivo} | ${(f.bytes / 1000).toFixed(1)} KB`);
console.log(`${archivos.length} imágenes revisadas; ${archivos.filter(f => f.bytes > 200000).length} superan 200 KB (200.000 bytes).`);
