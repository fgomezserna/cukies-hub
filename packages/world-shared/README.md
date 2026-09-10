# World services

Estos paquetes portan la API de World y el matchmaking al stack pnpm del Hub.
Son servicios CommonJS independientes: `@cukies/world-api` escucha en `3010`,
`@cukies/world-matchmaking` en `3011` y ambos arrancan con
`node dist/main.js` después de construir `@cukies/world-shared`.

## Contrato de entorno

La configuración canónica está en `@cukies/world-shared`. Cada proceso debe
recibir dos Mongo distintos: `WORLD_DATA_MONGO_URL` para identidad/Cuki y
`WORLD_GAME_MONGO_URL` para el dominio de juego. Sus nombres deben ser
`cukies-world-data-$APP_ENV` y `cukies-world-game-$APP_ENV`.
`WORLD_REDIS_URL` apunta al Redis de la red privada; admite selección de base
y TLS, pero esta configuración rechaza credenciales dentro de la URL.
`WORLD_RUNTIME_ENABLED=true` es obligatorio fuera de tests.

La sesión nueva requiere `WORLD_SESSION_SECRET` (mínimo 32 caracteres),
`WORLD_SESSION_ISSUER`, `WORLD_SESSION_AUDIENCE`, `APP_ENV` (`staging` o
`production`) y `WORLD_NAMESPACE`. `WORLD_CORS_ORIGINS` es una allowlist
separada por comas. `WORLD_GAME_WRITES_ENABLED=false` mantiene bloqueadas las
mutaciones HTTP del API durante la reconciliación; activarlo no certifica
idempotencia ni paridad completa con el servicio legacy.

Los secretos de matchmaking y economía son independientes:
`WORLD_MATCHMAKING_REGISTRATION_TOKEN`, `WORLD_ISLAND_JOIN_SECRET`,
`WORLD_ISLAND_PERMISSION_SECRET` y, si se activa el dominio de economía,
`WORLD_ISLAND_ECONOMY_TOKEN`. No hay valores de producción por defecto.

## Verificación local

```bash
pnpm --filter @cukies/world-shared build
pnpm --filter @cukies/world-api typecheck
pnpm --filter @cukies/world-matchmaking typecheck
pnpm --filter @cukies/world-api build
pnpm --filter @cukies/world-matchmaking build
pnpm --filter @cukies/world-shared test
pnpm --filter @cukies/world-api test
pnpm --filter @cukies/world-matchmaking test
```

Los tests de estos paquetes usan mocks y fixtures offline. El
[runbook del runtime](../../infrastructure/world/README.md) define la prueba
Docker con Mongo/Redis desechables, el Compose único y el orden de activación.
Ninguna de estas pruebas demuestra un despliegue en staging o producción.

`world-port-provenance.json` registra origen, estado Git y hashes observados de
los archivos importados. Incluye trabajo local todavía no comprometido en el
repo de origen; no representa una release legacy limpia ni una copia atómica.
