# Redis: carrito y caché

Abrir la consola autenticada sin escribir la clave en el historial:

```sh
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" exec redis-cli --no-auth-warning'
```

Usar un cliente aislado. El HASH real tiene un campo por producto, cuyo valor es
JSON con nombre, cantidad y precio unitario. Las modificaciones renuevan 1800 s.

```text
127.0.0.1:6379> HSET carrito:990000010 2 '{"nombre":"Gas Familiar","cantidad":2,"precio_unitario":15000}'
(integer) 1
127.0.0.1:6379> EXPIRE carrito:990000010 1800
(integer) 1
127.0.0.1:6379> TTL carrito:990000010
(integer) 1800
127.0.0.1:6379> HGETALL carrito:990000010
1) "2"
2) "{\"nombre\":\"Gas Familiar\",\"cantidad\":2,\"precio_unitario\":15000}"
127.0.0.1:6379> HINCRBY carrito:990000010 2 1
(error) ERR hash value is not an integer
```

HINCRBY incrementa enteros, no propiedades de JSON. Ese error es esperado y no
modifica el carrito. Para cambiar la cantidad usar `PATCH /carrito/items/2`, que
actualiza el JSON atómicamente y renueva su TTL. También se puede sustituir el
valor completo en esta consola aislada:

```text
127.0.0.1:6379> HSET carrito:990000010 2 '{"nombre":"Gas Familiar","cantidad":3,"precio_unitario":15000}'
(integer) 0
127.0.0.1:6379> EXPIRE carrito:990000010 1800
(integer) 1
127.0.0.1:6379> HDEL carrito:990000010 2
(integer) 1
127.0.0.1:6379> TTL carrito:990000010
(integer) -2
127.0.0.1:6379> DEL carrito:990000010
(integer) 0
```

Al quitar el último campo desaparece el HASH. TTL devuelve -2 si no existe y -1 si
una clave carece de expiración. Para ver HINCRBY con un entero sin mezclar formatos,
usar un HASH efímero de laboratorio y borrarlo al terminar:

```text
127.0.0.1:6379> HSET laboratorio:contador unidades 2
(integer) 1
127.0.0.1:6379> HINCRBY laboratorio:contador unidades 1
(integer) 3
127.0.0.1:6379> DEL laboratorio:contador
(integer) 1
```

Ese contador solo ilustra el comando; no es un tercer uso de Redis en la aplicación.
La aplicación conserva exclusivamente carrito y caché de catálogo.

```text
127.0.0.1:6379> SET catalogo:publico '[{"id_producto":2,"nombre":"Gas Familiar","precio":15000,"stock":10,"activo":true}]' EX 30
OK
127.0.0.1:6379> GET catalogo:publico
"[{\"id_producto\":2,\"nombre\":\"Gas Familiar\",\"precio\":15000,\"stock\":10,\"activo\":true}]"
127.0.0.1:6379> DEL catalogo:publico
(integer) 1
```

La lista pública completa es escrita por la API. Crear, editar o desactivar un
producto invalida esa clave. La validación definitiva de stock siempre ocurre
en MongoDB al confirmar, aunque la lista tenga hasta 30 s de desfase.
