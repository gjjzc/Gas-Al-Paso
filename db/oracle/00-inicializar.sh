#!/usr/bin/env bash
set -euo pipefail
# El entrypoint de la imagen ejecuta SQL como SYS. Aquí nos conectamos como APP_USER.
# .scripts es oculto para que el entrypoint no ejecute las migraciones otra vez como SYS.
: "${APP_USER:?Falta APP_USER}"
: "${APP_USER_PASSWORD:?Falta APP_USER_PASSWORD}"
if [[ ! "$APP_USER" =~ ^[A-Za-z][A-Za-z0-9_]{0,29}$ ]]; then
  echo 'APP_USER debe ser un identificador Oracle simple.' >&2
  exit 1
fi
# Evitar interpretación de comandos SQLPlus en credenciales multilínea o entrecomilladas.
if [[ "$APP_USER_PASSWORD" == *'"'* || "$APP_USER_PASSWORD" == *$'\n'* || "$APP_USER_PASSWORD" == *$'\r'* ]]; then
  echo 'La contraseña Oracle no puede contener comillas dobles ni saltos de línea.' >&2
  exit 1
fi
sqlplus -s /nolog <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET ECHO OFF VERIFY OFF DEFINE OFF SERVEROUTPUT ON
CONNECT ${APP_USER}/"${APP_USER_PASSWORD}"@//localhost:1521/FREEPDB1
@/container-entrypoint-initdb.d/.scripts/01-legacy.sql
@/container-entrypoint-initdb.d/.scripts/02-modelo.sql
@/container-entrypoint-initdb.d/.scripts/03-ventas.sql
@/container-entrypoint-initdb.d/.scripts/04-resumenes.sql
@/container-entrypoint-initdb.d/.scripts/05-datos.sql
@/container-entrypoint-initdb.d/.scripts/06-verificar.sql
@/container-entrypoint-initdb.d/.scripts/07-api.sql
@/container-entrypoint-initdb.d/.scripts/08-ventas-api.sql
EXIT SUCCESS
SQL
# Solo se publica readiness cuando todas las migraciones terminaron sin errores.
touch /opt/oracle/oradata/.gas-al-paso-fase1
