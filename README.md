# Gas al Paso — FASE 0

Infraestructura de desarrollo: React + Vite, Node.js + Express, Oracle Free (thin) y MongoDB 7.
Requisitos: Docker Engine con Compose v2, arquitectura amd64 y al menos 4 GB de RAM disponibles para Oracle.

## Descargar y abrir en VS Code

1. Instalar y abrir Docker Desktop (debe indicar que el motor está ejecutándose).
2. En GitHub, abrir `https://github.com/gjjzc/Gas-Al-Paso`, seleccionar **Code → Download ZIP** y descomprimir. Como alternativa, con Git instalado: `git clone https://github.com/gjjzc/Gas-Al-Paso.git`.
3. En VS Code, elegir **Archivo → Abrir carpeta** y seleccionar la carpeta que contiene este README y `docker-compose.yml` (el ZIP puede llamarla `Gas-Al-Paso-main`).
4. Abrir **Terminal → Nueva terminal**. Todos los comandos de Docker siguientes se ejecutan en esa carpeta, no dentro de `frontend` ni de `api`.

## Levantar

1. Copiar `.env.example` a `.env` (si aún no existe).
2. Abrir `.env` y completar `ORACLE_PASSWORD`, `APP_USER_PASSWORD` y `MONGO_INITDB_ROOT_PASSWORD` con tres contraseñas locales fuertes, distintas y de al menos 16 caracteres (letras y números son suficientes). Mantener los nombres de usuario que trae el ejemplo. Nunca subir `.env` a Git. En VS Code puedes copiar y pegar el archivo `.env.example` desde el explorador y renombrar la copia a `.env`.
3. Desde la raíz ejecutar:

```sh
docker compose up -d --build
docker compose ps
curl --fail http://localhost:4000/api/health
```

Oracle puede tardar varios minutos en su primer inicio. Compose espera la salud de las bases antes de iniciar la API, y la salud de la API antes del frontend.

Respuesta esperada (HTTP 200):

```json
{"estado":"OK","oracle":"OK","mongo":"OK","mensaje":"Oracle y MongoDB disponibles."}
```

Si una consulta falla, health devuelve HTTP 503 e identifica la base con `ERROR`.
Frontend en puerto 3000; API en 4000. Oracle: host 1522, servicio FREEPDB1; la API usa `oracle:1521/FREEPDB1`. MongoDB: host 27017, API usa `mongo:27017`, base `gas_al_paso` y autenticación en `admin`.
La FASE 0 muestra únicamente el nombre del proyecto.

## Operación

```sh
docker compose logs --tail=100 oracle api mongo
docker compose down
docker compose up -d
```

`down` conserva los volúmenes `oracle_data` y `mongo_data`. **`docker compose down -v` elimina todos los datos** y permite repetir la inicialización. Cambiar contraseñas en `.env` no actualiza usuarios de volúmenes existentes: deben cambiarse también en la base.

Los scripts de `db/oracle/` y `db/mongo/` se ejecutan solo con volúmenes nuevos. Consultar `db/oracle/README.md` para el SQL legacy adjunto, preservado sin ejecución automática. No se ha implementado todavía el modelo comercial.

Las imágenes instalan con `npm ci` usando los lockfiles. Para comprobar el build del frontend:

```sh
docker compose exec frontend npm run build
```

No se requieren secretos adicionales para esta fase. No se incluyen contraseñas en las imágenes ni en archivos versionados.

## Build en este entorno cloud

El proxy requiere su CA pública durante la instalación npm. Sin desactivar TLS ni
copiar certificados a las imágenes, usar el override opcional:

```sh
docker compose -f docker-compose.yml -f docs/compose.cloud.yml build
docker compose up -d --build
```

`CODEX_PROXY_CERT` debe apuntar a la CA proporcionada por la plataforma. En un PC
con acceso normal a Internet no se necesita el override.

## Ver la página y probar las bases desde tu computador

Cuando el arranque termine, abrir en el navegador:

- `http://localhost:3000`: página que muestra únicamente **Gas al Paso** (alcance de FASE 0).
- `http://localhost:4000/api/health`: JSON con `estado`, `oracle` y `mongo` en `OK`.

No se necesita la extensión Live Server. Si algo no abre, ejecutar `docker compose ps`:
los cuatro servicios deben estar `healthy`. Si están `starting`, esperar; si están
`unhealthy` o `restarting`, consultar `docker compose logs --tail=100 api oracle mongo frontend`.
En Windows, si Docker Desktop solicita WSL 2 o virtualización, completar primero su configuración.
Los puertos 3000, 4000, 1522 y 27017 deben estar libres.

## Editar React y ver los cambios al guardar

Para recarga automática, instalar Node.js 24 LTS en el computador. Mantener la API
y las bases en Docker, y ejecutar Vite desde VS Code:

1. En la terminal de la raíz: `docker compose stop frontend`.
2. En otra terminal:

```sh
cd frontend
npm ci
npm run dev
```

Abrir `http://localhost:3000` y editar `frontend/src/pages/Inicio.jsx`. Al guardar,
Vite actualiza la página. Para terminar, presionar Ctrl+C en esa terminal.
Para volver al frontend en Docker, desde la raíz ejecutar `docker compose up -d frontend`.
Si prefieres usar solo Docker, después de editar ejecutar desde la raíz
`docker compose up -d --build frontend` y recargar el navegador.
