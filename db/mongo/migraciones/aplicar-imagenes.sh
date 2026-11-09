#!/usr/bin/env bash
set -euo pipefail
mongosh --quiet --eval 'if (!db.getSiblingDB("admin").auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD)) { throw new Error("No se pudo autenticar en Mongo"); } load("/docker-entrypoint-initdb.d/migraciones/01-imagenes-locales.js");'
