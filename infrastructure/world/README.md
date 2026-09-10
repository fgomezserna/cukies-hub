# World en el CI común

El catálogo de `infrastructure/ci/components.json` registra `world-api` y
`world-matchmaking` en `.github/workflows/cukies-images.yml`. Se construyen con
`Dockerfile.ci`, se publican por digest y conservan su `sourceSha` individual.
Los cambios compartidos World invalidan ambas imágenes. Registrar imágenes
no activa procesos ni conecta las bases de datos del entorno.

El perfil `world-runtime` añade `world-api`, `world-matchmaking` y un Redis
efímero. Redis queda únicamente en `world-private`; las dos APIs también usan
esa red privada y la red externa `coolify` para alcanzar sus Mongo explícitas y
futuros upstreams internos. Está desactivado por defecto y no publica puertos
ni añade labels de Traefik; sus aliases en `coolify` incluyen el UUID del
recurso.

La entrega vigente aplica `withoutWorldRuntime` antes de comparar o enviar
el Compose a Coolify: excluye los tres servicios y la red `world-private`.
Cambiar únicamente `COMPOSE_PROFILES` o una variable no activa World. Hace
falta un cambio de entrega revisado que incorpore su validación operativa.

Para una futura activación, Coolify deberá proporcionar explícitamente:

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

Los targets `world-api` y `world-matchmaking` de `Dockerfile.ci` instalan
el grafo World con lock congelado y usan Nx para compilar el paquete y shared.
La imagen final conserva `dist`, dependencias de producción, usuario `node`,
entrypoint, revisión OCI y readiness de su puerto; no incluye la DApp.
El Dockerfile original del port se conserva como referencia histórica: no
es otra ruta de publicación. Redis usa `--appendonly no`, sin snapshot
y `tmpfs`, porque su registro es efímero y depende de TTL.

Desarrollo y verificación desde la raíz del Hub:

```bash
pnpm --filter nextn --filter '@cukies/world-api...' --filter '@cukies/world-matchmaking...' install --frozen-lockfile --ignore-scripts
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

Smoke local con las imágenes del constructor común y datos desechables:

```bash
WORLD_VERIFY_SHA="$(git rev-parse HEAD)"
docker build --platform linux/amd64 -f Dockerfile.ci --target world-api --build-arg "IMAGE_REVISION=$WORLD_VERIFY_SHA" -t world-api:local .
docker build --platform linux/amd64 -f Dockerfile.ci --target world-matchmaking --build-arg "IMAGE_REVISION=$WORLD_VERIFY_SHA" -t world-matchmaking:local .
WORLD_API_IMAGE=world-api:local WORLD_MATCHMAKING_IMAGE=world-matchmaking:local \
WORLD_API_SOURCE_SHA="$WORLD_VERIFY_SHA" WORLD_MATCHMAKING_SOURCE_SHA="$WORLD_VERIFY_SHA" \
WORLD_SMOKE_SKIP_PULL=true node scripts/ci/world-runtime-smoke.mjs
```

El wrapper exige ambas referencias y sus SHAs completos, valida cada revisión
OCI y ejecuta `infrastructure/world/tests/runtime-smoke.mjs`. No invoques el
harness directamente como gate: sin referencias puede omitirse con salida 0.
En CI de publicación, las referencias y los SHAs salen del manifiesto; se
descargan también las imágenes reutilizadas y no se omite el pull. El SHA de
una imagen reutilizada puede diferir del commit de la nueva release.

El smoke usa Mongo 8/Redis 7 sintéticos y una red propia. Comprueba auth,
bloqueo administrativo/de escrituras y caída/recuperación de dependencias;
elimina sus contenedores al terminar. El runtime se habilita solo dentro de
esa prueba aislada y las escrituras de juego siguen bloqueadas. No usa datos
ni secretos de Coolify.

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
   sintéticos y revisión OCI que ejecuta `Cukies immutable images`.
2. Preparar los destinos del entorno, reconciliar datos/IDs y validar la
   emisión de identidad. Provisionar credenciales nuevas por entorno.
3. Integrar el soporte de entrega/rollback World con sus gates de readiness
   e identidad de imagen. Después habilitar el perfil y
   `WORLD_RUNTIME_ENABLED=true`, manteniendo `WORLD_GAME_WRITES_ENABLED=false`
   durante la validación de lecturas.
4. Verificar cliente Unreal y prefijos públicos contra estos procesos, así
   como permisos, reintentos, concurrencia y recuperación de dependencias.
5. Pasar las escrituras a un único servicio tras reconciliar los datos y
   detener los escritores anteriores. Confirmar tráfico y sesiones drenadas
   antes de retirar cada upstream.

El CRUD administrativo genérico queda bloqueado. Su futura sustitución debe
definir recursos, campos y permisos permitidos. Habilitar el proceso o su
health no acredita paridad de datos ni autoriza el corte de producción.

El estado vigente y las evidencias de integración se siguen en
[`docs/antes-del-15-seguimiento.md`](../../docs/antes-del-15-seguimiento.md),
filas D e INFRA. El inventario y traspaso inicial de `integration/` son
registros históricos; no sustituyen esa tabla.
