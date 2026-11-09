#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# El mismo archivo debe usarse al levantar Compose. No imprimir su contenido.
entorno_tests="${TEST_ENV_FILE:-$PWD/.env}"
entorno_tests="$(realpath "$entorno_tests")"
export TEST_ENV_FILE="$entorno_tests"
node --test api/tests/importes.test.mjs
for suite in infraestructura modelo api imagenes telefonico clientes ventas control redis; do
  echo "Suite API: $suite"
  docker compose --env-file "$entorno_tests" exec -T api node --input-type=module < "api/tests/$suite.mjs"
done
export E2E_REAL=1
if [ -z "${CHROMIUM_PATH:-}" ] && command -v chromium >/dev/null; then
  export CHROMIUM_PATH="$(command -v chromium)"
fi
npm run test:e2e --prefix frontend
