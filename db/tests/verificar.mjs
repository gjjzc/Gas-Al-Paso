// Conserva el comando de verificación por stdin; delega en la suite actual de infraestructura.
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const proceso = spawn(process.execPath, ['--input-type=module'], { stdio: ['pipe', 'inherit', 'inherit'] });
proceso.stdin.end(await readFile('tests/infraestructura.mjs'));
proceso.on('exit', codigo => { process.exitCode = codigo ?? 1; });
