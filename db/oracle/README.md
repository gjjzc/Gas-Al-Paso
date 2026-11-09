# Inicialización Oracle — migraciones 01–11

`00-inicializar.sh` conecta a FREEPDB1 con APP_USER/APP_USER_PASSWORD del entorno.
Ejecuta en orden los scripts 01–11 de `.scripts/`, una sola vez en volumen nuevo.
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

FASE 4 actualiza con `.scripts/aplicar-control.sh` (07, 08 y 09). Agrega fecha_cobro
y Solicitud_Control, actualiza vistas/resúmenes por fecha de cobro y no borra datos.
No ejecuta el legacy. Ver docs/FASE-4.md.

CAMBIO 1 agrega `.scripts/10-cliente-telefono.sql`. Sobre FASE 7 aplicar
`.scripts/aplicar-telefono.sh` con API/frontend detenidos: normaliza y hace únicos
los teléfonos, conservando clientes/cuentas/ventas y marcando conflictos para revisión.
La tabla Cliente_telefono_revision conserva los valores originales; los provisionales
no se usan para autovincular cuentas. Ver docs/CAMBIO-1-pedido-telefonico.md.

CAMBIO 2 agrega 11-direccion-cliente.sql: campos opcionales de principal estructurada.
No interpreta ni reescribe direcciones antiguas. `.scripts/aplicar-clientes.sh` ejecuta 10 y 11
de forma idempotente con API/frontend detenidos. Ver docs/CAMBIO-2-buscar-cliente-telefono.md.
