# Inicialización Oracle

Este directorio se monta en `/container-entrypoint-initdb.d`.
La imagen crea el usuario de aplicación definido en `.env` en FREEPDB1.
En FASE 0 no se ejecutan migraciones de negocio.

`legacy/Gas_al_Paso.sql.reference` es una copia exacta del adjunto original.
La extensión `.reference` evita que el entrypoint lo ejecute como SYS.
Contiene borrado de tablas, dos sucursales y pruebas; su integración en el
esquema de aplicación corresponde a una fase posterior. No ejecutarlo en producción.
