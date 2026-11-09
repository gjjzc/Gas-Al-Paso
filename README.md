# Gas al Paso

Sistema académico de venta y reparto de gas en balones: catálogo, carrito, pedidos web y telefónicos, reparto, ventas en calle y cierre de caja.

React y Vite en el frontend; Node.js y Express en la API; MongoDB 7 para los documentos y transacciones; Redis 7 para carritos y caché. Docker Compose levanta cuatro servicios. MongoDB usa un replica set de un nodo con autenticación y un usuario de aplicación limitado a `gas_al_paso`. Redis persiste con AOF.

## Inicio

Requiere Docker con Compose.

```sh
cp .env.example .env
# Completar las variables vacías del archivo local antes de continuar.
docker compose up -d --build --wait
curl http://localhost:4000/api/health
```

Abrir http://localhost:3000. Completar credenciales distintas para MongoDB root, usuario de aplicación y Redis, además de `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `JWT_SECRET`. El secreto JWT debe ser aleatorio de al menos 32 bytes. La clave inicial debe tener al menos 8 caracteres y como máximo 72 bytes. No publicar `.env`.

Al iniciar, la API crea el ADMIN indicado por el entorno únicamente si todavía no existe ninguno. Iniciar sesión con esas credenciales; cambiar el entorno después no reemplaza una cuenta existente. Los datos iniciales incluyen comunas, productos y repartidores, sin cuentas precargadas.

## Verificaciones

Requiere Node.js 24 y Chromium, además de los servicios activos. Para una ejecución desde cero en una instalación aislada, el siguiente comando elimina los datos locales:

```sh
docker compose down -v
docker compose up -d --build --wait
npm ci --prefix frontend
cd frontend
npx playwright install chromium
cd ..
bash scripts/probar.sh
```

El script ejecuta unidades, suites de API y Playwright contra los servicios reales. `TEST_ADMIN_EMAIL` y `TEST_ADMIN_PASSWORD` deben coincidir con la cuenta inicial; si están vacías, se usan `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Las cuentas temporales reciben claves aleatorias en memoria. La suite de modelo valida la semilla antes de las suites que crean datos.

Opcionales: `TEST_ENV_FILE` selecciona otro archivo local de entorno; `CHROMIUM_PATH` indica un navegador instalado. `CHROMIUM_NO_SANDBOX=1` permite ejecutarlo en un contenedor que lo requiera.

## Documentación

- [CRUD MongoDB](docs/crud-mongo.md) y [script de operaciones](docs/crud-operaciones.js).
- [CRUD Redis](docs/crud-redis.md).
- [Arquitectura y modelo de datos](docs/diagramas.md).
- [Solicitudes HTTP](docs/api.http).
- [Procedencia de imágenes](docs/creditos-imagenes.md).

Los carritos caducan a los 1800 segundos y cada cambio renueva ese plazo. El catálogo público se guarda en caché durante 30 segundos; las modificaciones del ADMIN la invalidan. La confirmación siempre verifica stock en MongoDB. Confirmar, cancelar y entregar registran sus cambios y auditoría en una transacción.
