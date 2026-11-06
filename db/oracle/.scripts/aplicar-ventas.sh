#!/usr/bin/env bash
set -euo pipefail
# Actualizacion aditiva FASE 2 -> FASE 3; no ejecuta el legacy.
sqlplus -s /nolog <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET ECHO OFF VERIFY OFF DEFINE OFF
CONNECT ${APP_USER}/"${APP_USER_PASSWORD}"@//localhost:1521/FREEPDB1
@/container-entrypoint-initdb.d/.scripts/07-api.sql
@/container-entrypoint-initdb.d/.scripts/08-ventas-api.sql
EXIT SUCCESS
SQL
