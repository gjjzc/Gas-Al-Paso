# Alcance de FASE 0

Cuatro servicios, persistencia Oracle/MongoDB, API con comprobación real de ambas
bases y página inicial React. No incluye autenticación ni funciones comerciales.
Los directorios de componentes y servicios se reservan para fases posteriores.

## Validación realizada

- `docker compose config --quiet`: correcto.
- `docker compose up -d --build`: correcto, con imágenes preparadas usando el override cloud para la CA del proxy.
- Los cuatro servicios terminaron en estado `healthy`.
- `GET /api/health`: HTTP 200, Oracle OK y Mongo OK.
- Mongo detenido temporalmente: HTTP 503, Oracle OK y Mongo ERROR; tras reiniciarlo, HTTP 200.
- Frontend: HTTP 200, título y módulo React de inicio correctos.
- `npm run build` dentro del contenedor frontend: correcto.
- Inicialización Mongo con volumen aislado nuevo: colección `eventos_auditoria` creada y acceso autenticado correcto. El contenedor auxiliar quedó detenido; su volumen se conservó.
- SQL adjunto preservado byte por byte como `.sql.reference`.

El intento de pausar Mongo no estuvo soportado por cgroups del entorno; la prueba
real de indisponibilidad se hizo con stop/start y recuperación garantizada.
No se han implementado funcionalidades de las fases siguientes.
