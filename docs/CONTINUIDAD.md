# Continuidad — Gas al Paso

Fecha de entrega: 6 de noviembre de 2026 (Chile).
Repositorio: gjjzc/Gas-Al-Paso. Carpeta Windows habitual:
C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github.

Fases 0–5 implementadas y verificadas: infraestructura, bases, API, ventas y control diario.
FASE 6 incorpora la jornada completa del REPARTIDOR para celular. Rama del entorno:
fase-6-frontend-repartidor. Entregable: Gas-Al-Paso-fase6.zip. No se ha confirmado su
instalación local ni publicación remota; el usuario actualiza y sube desde PowerShell.
Pendiente FASE 7: esperar su enunciado y revisión de esta fase antes de avanzar.

Para retomar: leer docs/FASE-6.md y README.md. La fase 6 no cambia el esquema de las
bases. Si falta fase 4, aplicar .scripts/aplicar-control.sh sin borrar volúmenes.
El frontend tiene el flujo CLIENTE y el REPARTIDOR puede ver pedidos asignados, entregar
con pago real, registrar tarreo con vista previa de importes, revisar sus ventas y
cerrar caja/stock. ADMIN aún tiene navegación base; su frontend está pendiente.
GET /api/cierre se agregó exclusivamente para la lectura propia del REPARTIDOR;
GET /cuadratura y /cargas siguen siendo ADMIN. La guía incluye una preparación de
jornada desde PowerShell y la ejecución completa desde el navegador del celular.
Los reintentos de estado, tarreo y cierre conservan cuerpo y clave en sessionStorage.
Las claves se generan con crypto.getRandomValues para funcionar también por HTTP
con la IP local del PC (sin depender de randomUUID, que exige contexto seguro).

Decisiones del usuario: cargas suman recargas; cuadratura por fecha de cobro;
CLIENTE cancela solo RECIBIDO propio, ADMIN hasta EN_CAMINO; entregado es terminal.
Cada fase se entrega como ZIP con comandos completos para actualizar, probar y subir
una rama a GitHub conservando .env, .git y datos. No afirmar que la rama está publicada
sin comprobarlo. No avanzar de fase sin revisión.

Conexiones usuales: frontend localhost:3000; API localhost:4000/api/health;
Oracle localhost:1523, servicio FREEPDB1, usuario APP_USER del .env;
Compass localhost:27018, base gas_al_paso, authSource admin con usuario root del .env.
Confirmar puertos reales con docker compose ps: defaults 1522/27017, personalizados
por ORACLE_HOST_PORT/MONGO_HOST_PORT. API interna oracle:1521/FREEPDB1, mongo:27017.
No compartir .env ni modificar JWT_SECRET al actualizar. Git/ZIP no respaldan bases.

Para cerrar: guardar todo en VS Code, COMMIT de cambios SQL manuales que se quieran
conservar y guardar scripts; ejecutar docker compose stop en la raíz; después cerrar
Compass, SQL Developer y Docker Desktop. Los datos confirmados persisten en los
volúmenes locales. No usar down -v, eliminar volúmenes ni restablecer Docker borrando
datos. Los carritos sí vencen a los 30 minutos por TTL.

Para volver: abrir Docker Desktop, esperar, abrir la carpeta en VS Code y ejecutar
docker compose up -d, docker compose ps y consultar /api/health. Se puede editar y
compilar frontend sin Docker; probar el flujo real requiere API y ambas bases. Vite
local admite npm ci --prefix frontend y npm run dev --prefix frontend (Node 24).
No iniciar frontend local y Docker en el mismo puerto simultáneamente.
