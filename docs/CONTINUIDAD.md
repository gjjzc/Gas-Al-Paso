# Continuidad — Gas al Paso

Fecha de entrega: 6 de noviembre de 2026 (Chile).
Repositorio: gjjzc/Gas-Al-Paso. Carpeta Windows habitual:
C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github.

Fases 0–7 implementadas en el entorno. La entrega actual es FASE 7, frontend ADMIN.
Rama: fase-7-frontend-admin. ZIP: Gas-Al-Paso-fase7.zip. No se ha confirmado su
instalación local ni publicación remota: el usuario copia y sube desde PowerShell.
Validación de entrega: 19 pruebas de navegador, 98 de API base y 123 de control diario
aprobadas. Demostración real: $46.000 cobrados, tres gases y un accesorio, cierre en cero.
No iniciar fases adicionales sin nueva solicitud y revisión del usuario.

Para retomar leer docs/FASE-7.md y README.md. No hay migraciones nuevas sobre FASE 6;
reconstruir API y frontend. Si falta fase 4, aplicar .scripts/aplicar-control.sh sin
borrar volúmenes. El frontend ahora cubre los tres roles: CLIENTE, REPARTIDOR y ADMIN.
ADMIN tiene tablero/filtros, detalle y asignación, pedido por llamada, cargas acumuladas,
CRUD de catálogo, gestión de usuarios/cobertura, cuadratura y auditoría.
La guía describe una jornada completa con dos ventas, accesorio, descuento y cierre.

GET /usuarios admite rol/activo/buscar con binds y GET /catalogo buscar antes de paginar.
La cuadratura agrega productos_vendidos, incluidos accesorios. No se amplían permisos.
GET /cierre sigue privado del REPARTIDOR; GET /cuadratura y administración siguen ADMIN.
Cargas y pedidos telefónicos guardan clave/cuerpo para reintentos idempotentes;
CRUD no reintenta altas automáticamente: comprobar listado si se pierde la respuesta.
Las claves usan crypto.getRandomValues para funcionar también por HTTP con IP local.
Los contadores del tablero indican la página visible, no totales globales inventados.

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
