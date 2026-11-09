#!/usr/bin/env bash
set -euo pipefail
sqlplus -s /nolog <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET ECHO OFF VERIFY OFF DEFINE OFF SERVEROUTPUT ON
CONNECT ${APP_USER}/"${APP_USER_PASSWORD}"@//localhost:1521/FREEPDB1
@/container-entrypoint-initdb.d/.scripts/10-cliente-telefono.sql
@/container-entrypoint-initdb.d/.scripts/11-direccion-cliente.sql
EXIT SUCCESS
SQL
