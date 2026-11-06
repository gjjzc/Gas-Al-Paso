#!/usr/bin/env bash
set -euo pipefail
# Actualizacion aditiva. No vuelve a ejecutar datos legacy ni borra ventas/cierres.
sqlplus -s /nolog <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET ECHO OFF VERIFY OFF DEFINE OFF
CONNECT ${APP_USER}/"${APP_USER_PASSWORD}"@//localhost:1521/FREEPDB1
@/container-entrypoint-initdb.d/.scripts/07-api.sql
@/container-entrypoint-initdb.d/.scripts/08-ventas-api.sql
@/container-entrypoint-initdb.d/.scripts/09-control-diario.sql
EXIT SUCCESS
SQL
