# World runtime integrado

El perfil `world-runtime` añade `world-api`, `world-matchmaking` y un Redis
efímero. Redis queda únicamente en `world-private`; las dos APIs también usan
esa red privada y la red externa `coolify` para alcanzar sus Mongo explícitas y
futuros upstreams internos. Está desactivado por defecto y no publica puertos
ni añade labels de Traefik; sus aliases en `coolify` incluyen el UUID del
recurso.

Al habilitarlo, Coolify debe proporcionar explícitamente:

- `WORLD_RUNTIME_ENABLED=true`.
- `APP_ENV=staging` o `production` y `WORLD_NAMESPACE=cukies-world-$APP_ENV`.
- `WORLD_DATA_MONGO_URL` con la base `cukies-world-data-$APP_ENV`.
- `WORLD_GAME_MONGO_URL` con la base `cukies-world-game-$APP_ENV`.
- `WORLD_REDIS_URL` (por defecto del Compose: `redis://world-redis:6379/0`).
- `WORLD_SESSION_SECRET` (mínimo 32 caracteres), `WORLD_SESSION_ISSUER` y
  `WORLD_SESSION_AUDIENCE`, además de `WORLD_SESSION_EXPIRES_IN` y
  `WORLD_SESSION_MAX_TTL_SECONDS`.
- `WORLD_CORS_ORIGINS` y, cuando apliquen, los tokens
  `WORLD_MATCHMAKING_REGISTRATION_TOKEN` y `WORLD_ISLAND_ECONOMY_TOKEN`,
  además de la URL `WORLD_AGONES_API_SERVER`.
- Para admisión de islas, `WORLD_ISLAND_JOIN_SECRET` en ambos servicios y
  `WORLD_ISLAND_PERMISSION_SECRET` solo en matchmaking. Son claves nuevas,
  separadas de la sesión y de las credenciales de registro/economía.

No se reutilizan `DATABASE_URL`, `CUKIES_DATABASE_URL`, `NEXTAUTH_SECRET` ni
credenciales OAuth. La validación canónica de URLs, nombres de base,
namespace, credenciales y `WORLD_GAME_WRITES_ENABLED` pertenece a
`@cukies/world-shared` y ocurre durante el bootstrap de Nest, antes de abrir
Mongo o Redis. El entrypoint de infraestructura solo rechaza el runtime si no
se ha habilitado explícitamente.

La imagen copia únicamente los tres paquetes World y sus manifests. El build
espera `@cukies/world-api` o `@cukies/world-matchmaking` con `tsc` y salida
`dist/main.js`; el lockfile debe estar actualizado por la integración del
monorepo antes de construir la imagen. Redis usa `--appendonly no`, sin snapshot
y `tmpfs`, porque su registro es efímero y depende de TTL.

Desarrollo y verificación desde la raíz del Hub:

```bash
pnpm install --frozen-lockfile --filter '@cukies/world-api...' --filter '@cukies/world-matchmaking...'
pnpm build:world
pnpm typecheck:world
pnpm test:world
```

El build compila primero los tipos y servicios compartidos. Los cambios de
schemas requieren su migración e índices explícitos: los procesos no crean
colecciones ni índices automáticamente al arrancar fuera de tests.

Comprobaciones de infraestructura sin arrancar servicios:

```bash
node --test infrastructure/world/tests/*.test.mjs
docker compose -f docker-compose.coolify.yml config --no-interpolate --quiet
```

La resolución interpolada completa depende de las variables ya obligatorias de
Coolify para el dapp; el workflow valida la forma del perfil sin inyectar
secretos.

Smoke de ejecución con Docker y datos desechables:

```bash
docker build -f infrastructure/world/Dockerfile --build-arg WORLD_PACKAGE=world-api -t world-api:local .
docker build -f infrastructure/world/Dockerfile --build-arg WORLD_PACKAGE=world-matchmaking -t world-matchmaking:local .
WORLD_API_IMAGE=world-api:local WORLD_MATCHMAKING_IMAGE=world-matchmaking:local node infrastructure/world/tests/runtime-smoke.mjs
```

El smoke comprueba autenticación, bloqueo de administración/escrituras, caída
de Mongo y caída/recuperación de Redis. Usa una red propia y elimina sus
contenedores al terminar. El workflow ejecuta las mismas imágenes y prueba;
no despliega ni necesita secretos de Coolify.

## Alcance y activación

El código de Game y matchmaking se mantiene en `packages/world-api`,
`packages/world-matchmaking` y `packages/world-shared`. Las imágenes se
construyen desde este repositorio. Los contratos BSC/TRON existentes y los
workers del Hub conservan su ciclo actual; este perfil no migra Learn, el
servidor Unreal/Agones ni las APIs GraphQL/auth antiguas.

Las bases World necesitan una copia reconciliada de los datos necesarios del
juego, con sus IDs y relaciones. No hay importación al arrancar, ni se
convierte `CUKIES_DATABASE_URL` en destino World. La identidad World requiere
un vínculo verificado antes de emitir una sesión nueva; este traslado no
publica un emisor de sesiones Hub ni reabre el login antiguo.

Antes del corte de tráfico:

1. Construir y probar las imágenes, incluido el smoke Docker con datos
   sintéticos que ejecuta el workflow `World runtime`.
2. Preparar los destinos del entorno, reconciliar datos/IDs y validar la
   emisión de identidad. Provisionar credenciales nuevas por entorno.
3. Habilitar el perfil con `WORLD_RUNTIME_ENABLED=true` y mantener
   `WORLD_GAME_WRITES_ENABLED=false` durante la validación de lecturas.
4. Verificar cliente Unreal y prefijos públicos contra estos procesos, así
   como permisos, reintentos, concurrencia y recuperación de dependencias.
5. Pasar las escrituras a un único servicio tras reconciliar los datos y
   detener los escritores anteriores. Confirmar tráfico y sesiones drenadas
   antes de retirar cada upstream.

El CRUD administrativo genérico queda bloqueado. Su futura sustitución debe
definir recursos, campos y permisos permitidos. Habilitar el proceso o su
health no acredita paridad de datos ni autoriza el corte de producción.
