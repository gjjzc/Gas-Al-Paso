# Continuidad — Gas al Paso

Fecha de entrega: 6 de noviembre de 2026 (Chile).
Repositorio: gjjzc/Gas-Al-Paso. Carpeta Windows habitual:
C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github.

Fases 0–4 implementadas y verificadas: infraestructura, bases, API, ventas y control diario.
FASE 5 incorpora sistema de diseño y flujo CLIENTE completo. Rama del entorno:
fase-5-frontend-cliente. Entregable: Gas-Al-Paso-fase5.zip. No se ha confirmado su
instalación local ni publicación remota; el usuario actualiza y sube desde PowerShell.
Pendientes fases 6 y 7: esperar su enunciado y revisión de esta fase antes de avanzar.

Para retomar: leer docs/FASE-5.md y README.md. La fase 5 no cambia el esquema de las
bases. Si falta fase 4, aplicar .scripts/aplicar-control.sh sin borrar volúmenes.
El frontend ahora tiene catálogo, login/registro, carrito, confirmación, mis pedidos
con historial, cancelación y consulta periódica de cambios. ADMIN y REPARTIDOR solo
tienen acceso/navegación base; las pantallas operativas se harán después. La guía
incluye PowerShell para asignar y entregar como repartidor y observar al cliente.

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
