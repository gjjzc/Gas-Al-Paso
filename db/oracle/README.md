# Inicialización Oracle — FASE 3

`00-inicializar.sh` conecta a FREEPDB1 con APP_USER/APP_USER_PASSWORD del entorno.
Ejecuta en orden los scripts 01–08 de `.scripts/`, una sola vez en volumen nuevo.
Cada fallo SQL/OS produce salida no cero; `06-verificar.sql` compila dependencias
legacy y verifica objetos y datos antes de crear el marcador de readiness.

La carpeta `.scripts/` es oculta porque el entrypoint oficial recorre subcarpetas
no ocultas y ejecuta sus `.sql` como SYS. Aquí NO queremos ese comportamiento.
`.tests/` tampoco se ejecuta automáticamente.

`legacy/Gas_al_Paso.sql.reference` es el adjunto original sin modificaciones. Su
extensión evita ejecución automática: el script 01 lo invoca por ruta absoluta.
Incluye DROP TABLE, datos de dos sucursales y pruebas con rollback. Los scripts
posteriores lo amplían y dejan una sola sucursal. No correr sobre datos reales.

Consulte el README principal para instalación limpia, usuarios demo, SQL Developer
y pruebas, y `docs/FASE-1.md` para los contratos PL/SQL.

Para actualizar una base de FASE 1 existente, ejecutar únicamente:

```sh
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.scripts/aplicar-api.sh
```

La migración 07 es aditiva e idempotente: crea secuencias nuevas y token_version,
sin borrar datos ni volver a ejecutar el legacy. Agregar JWT_SECRET antes de usar
el Compose de FASE 2. Ver docs/FASE-2.md.

FASE 3 actualiza con `.scripts/aplicar-ventas.sh` (07 y 08 idempotentes).
Agrega Solicitud_Venta e índice de snapshots por venta, sin borrar ni reiniciar datos.
No ejecutar 01–06 manualmente en una base existente. Ver docs/FASE-3.md.
