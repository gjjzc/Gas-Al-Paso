# Continuidad — Gas al Paso

Entrega base: 6 de noviembre de 2026. Imágenes finales agregadas tras recuperar el entorno.
Repositorio: gjjzc/Gas-Al-Paso. Carpeta Windows habitual:
C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github.

Fases 0–7 y CAMBIOS 1–2 implementados. Entrega actual: código del CAMBIO 3, imágenes locales.
Rama feature/imagenes-productos basada en feature/buscar-cliente-telefono (7dc259b).
ZIP acumulativo con imágenes incluye las tres mejoras; ver nombre actualizado abajo.
No publicar: el usuario quiere revisar las tres y subirlas juntas después.
Imágenes completadas: el usuario autorizó generación profesional cuando las fotos
reales no fueran presentables. Se descartaron todas las fotografías reales buscadas.
Se incluyen seis PNG nuevos generados con OpenAI, fondo blanco, azul/naranja y sin
marcas; originales sin editar. Créditos no inventan licencias CC de terceros.
Nombres: balon-5kg/11kg/15kg/45kg.png, regulador.png, manguera.png, bajo /productos/.
La API normaliza los seis JPG reservados de la entrega inicial a sus PNG, también en
pedidos antiguos. Migración Mongo nueva 02 actualiza solo imagen del catálogo y
preserva rutas locales personalizadas. No se reejecutaron migraciones SQL anteriores.
ZIP nuevo: Gas-Al-Paso-cambios-1-2-3-con-imagenes.zip, acumulativo y sin publicar.
Los seis PNG superan 200 KB (1,16–1,50 MB); usuario pidió optimizarlos él.
Validación final de imágenes: 31 checks API, cuatro pruebas base de imágenes y
cuatro de archivos finales/vistas (una usa API/Oracle/Mongo reales), todas aprobadas.
Nuevo script 02 aplicado al proyecto demo: seis rutas y luego cero al repetir.
Build Vite correcto; PNG íntegros en dist/productos. Capturas de escritorio y móvil
fuera del repositorio. No se hizo push, publicación ni reejecución de SQL previo.
Leer docs/CAMBIO-3-imagenes-productos.md para instalación acumulativa PowerShell.
Migración Mongo 01-imagenes-locales.js y helper aplicar-imagenes.sh idempotentes,
actualizan solo imagen sin borrar pedidos/carritos ni colecciones. Oracle sigue 01–11.
Rutas /productos/... locales, fallback SVG Balon existente, 4:3, cover, lazy, alt.
Carritos/pedidos guardan imagen; antiguos sin campo se enriquecen al leer. Precios,
stock, idempotencia y autorizaciones se conservan. Script revisar-imagenes.mjs avisa
>200.000 bytes sin tocar originales; permite directorio opcional para correr en Docker.
Validación CAMBIO 3: API imágenes 28, API base 98, ventas 181; navegador general 28
y siete pruebas focalizadas tras ajuste del selector ADMIN, todas aprobadas. Migración
Mongo repetida modifica cero documentos; build Vite y comprobador de pesos correctos.
No se ha confirmado instalación local ni fusión/publicación remota.

Leer docs/CAMBIO-2-buscar-cliente-telefono.md. Helper aplicar-clientes.sh ejecuta 10 y 11
con API/frontend detenidos; conservar .env y volúmenes. Instalación nueva 01–11.
Migración 10 mantiene ventas/cuentas/IDs, normaliza teléfonos únicos y marca conflictos
para revisión. Migración 11 agrega calle/número/referencia opcionales sin alterar el
texto principal anterior. El índice Mongo por cliente.id_cliente/creado_en/_id se crea
al iniciar/consultar. No requiere borrar bases ni crear otras colecciones.

ADMIN: /clientes?telefono= requiere 4–9 dígitos y devuelve máximo 10 coincidencias de
Oracle con contador/última fecha desde Mongo por ID. GET /clientes/:id muestra últimos
10 pedidos y PATCH corrige nombre/principal sin reescribir snapshots. Teléfonos no se
registran en logs; proxy Vite redacta el parámetro en errores. Mongo caído devuelve
503, sin fingir lista vacía; recuperación sin reiniciar API.
Frontend: menú Clientes por teléfono, buscador 300ms, ficha/edición/historial y CTA de
nuevo pedido; mismo componente dentro de Pedido por llamada, preserva selección de
productos. La precarga no adivina números de direcciones antiguas: usa estructura o
un pedido que coincida con la principal; en caso contrario pide verificar el número.
Se conserva CAMBIO 1: Cliente sin Usuario, buscar/crear por teléfono, principal opcional,
registro web vinculado e idempotencia de llamadas. Guías y ejemplos en docs/api.http.


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
