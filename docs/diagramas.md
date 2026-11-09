# Arquitectura y modelo

```mermaid
flowchart LR
  Persona[Cliente / repartidor / administrador] --> Frontend[Frontend React + Vite]
  Frontend -->|HTTP y JWT| API[API Node.js + Express]
  API -->|Transacciones y auditoría| Mongo[(MongoDB 7: rs0 autenticado)]
  API -->|HASH de carrito y STRING de catálogo| Redis[(Redis 7: contraseña y AOF)]
```

```mermaid
flowchart TD
  Contadores[contadores: secuencias numéricas atómicas]
  Comunas[comunas]
  Catalogo[catalogo: precio, stock y atributos embebidos]
  Clientes[clientes: dirección principal embebida]
  Empleados[empleados: IDs de comunas embebidos]
  Usuarios[usuarios: identidad, rol y hash generado en ejecución]
  Pedidos[pedidos: cliente instantáneo, dirección, items e historial embebidos]
  Cargas[cargas_diarias: items embebidos]
  Cierres[cierres_caja: dinero por método y balones embebidos]
  Auditoria[eventos_auditoria: actor y detalle embebidos]
  Idempotencia[idempotencia: alcance, clave y resultado embebido; TTL 7 días]
  Usuarios -->|id_cliente| Clientes
  Usuarios -->|id_empleado| Empleados
  Empleados -->|comunas: IDs| Comunas
  Clientes -->|dirección.comuna: ID| Comunas
  Pedidos -->|cliente.id_cliente: referencia e instantánea| Clientes
  Pedidos -->|items.id_producto: referencia e instantánea| Catalogo
  Pedidos -->|repartidor.id_empleado| Empleados
  Cargas -->|id_empleado| Empleados
  Cargas -->|items.id_producto| Catalogo
  Cierres -->|id_empleado| Empleados
  Cierres -->|balones.id_producto| Catalogo
  Auditoria -.->|IDs dentro del detalle| Pedidos
  Idempotencia -.->|resultado de la operación| Pedidos
  Contadores -.-> Catalogo
  Contadores -.-> Clientes
  Contadores -.-> Empleados
  Contadores -.-> Usuarios
  Contadores -.-> Pedidos
```

Las referencias son IDs numéricos, no claves foráneas. Las instantáneas conservan
nombre, precio y dirección aunque los documentos de origen cambien. Cada carga y
cierre es único por fecha y empleado. Los once esquemas e índices están en
`db/mongo/init.js`. Los carritos no son una colección MongoDB.
