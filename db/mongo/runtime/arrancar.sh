#!/usr/bin/env bash
set -euo pipefail

# El keyFile autentica a los miembros del replica set. Nunca se guarda en Git.
# Su volumen conserva la clave entre reinicios; down -v permite regenerarla.
umask 077
if [ ! -s /etc/mongo-keyfile/keyfile ]; then
  openssl rand -base64 756 > /etc/mongo-keyfile/keyfile
fi
chown -R mongodb:mongodb /etc/mongo-keyfile
chmod 700 /etc/mongo-keyfile
chmod 400 /etc/mongo-keyfile/keyfile

# El entrypoint oficial crea primero los usuarios y ejecuta las semillas.
# Esperamos su mongod definitivo antes de iniciar el replica set autenticado.
(
  # No crear archivos de mongosh como root dentro del HOME de mongodb (/data/db).
  export HOME=/tmp/mongo-bootstrap
  mkdir -p "$HOME"
  for intento in {1..150}; do
    if mongosh --quiet --file /opt/gas-mongo/iniciar-replica.js >/dev/null 2>&1; then
      echo 'Replica set rs0 listo.'
      exit 0
    fi
    sleep 2
  done
  echo 'No se pudo inicializar el replica set; revisar el estado de MongoDB.' >&2
  exit 1
) &

# Mantener el entrypoint oficial como PID 1 para recibir correctamente las señales.
exec /usr/local/bin/docker-entrypoint.sh "$@"
