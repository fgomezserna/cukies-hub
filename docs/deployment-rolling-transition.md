# Entrega gradual de imágenes

Staging usa la entrega gradual desde el 2026-09-09. Los ensayos de fallo y rollback
se completan antes de habilitar el mismo proceso en producción. El estado live y las evidencias finales se registran en
`antes-del-15-seguimiento.md`; la guía principal sigue siendo
[`deployment-environments.md`](deployment-environments.md).

## Recursos y responsabilidades

| Entorno | Web Docker Image | Workers Compose | Destino público |
| --- | --- | --- | --- |
| Staging | App32 `rwwsc4kkwc0ck84cgk40s8kk` | App28 `u4s804o4wwcckowgk0woo4wg` | `https://cukieshub.eurekand.com` |
| Producción | App33 `uo8gswsg84c488cowko0kkkg`, provisionada sin tráfico; activación pendiente | App12 `jookw8ow8woks088s44404ok` | `https://cukies.world` |

La web no publica un puerto del host ni usa un nombre fijo de contenedor.
Coolify arranca su reemplazo, exige `/api/ready` y después termina la instancia
anterior. `/api/ready` hace un ping read-only a Mongo con timeout; `/api/health`
identifica la release y el recurso, pero no prueba disponibilidad de Mongo.
Next.js recibe `deploymentId` al construir la imagen. El wrapper
`scripts/docker-dapp-server.mjs` recibe las señales como PID1: mantiene la web
sana 5 segundos, marca `/api/ready` como no disponible y conserva el servidor
otros 5 segundos antes de enviar SIGTERM a Next. Fuerza la salida a los 25
segundos si el hijo no termina. Coolify instalado ejecuta `docker stop --time=30`;
el `--stop-timeout=60` del contenedor no sustituye ese límite explícito.

Este cierre requiere health checks activos de Traefik sobre cada backend:
`loadbalancer.healthcheck.path=/api/ready`, `interval=2s`, `timeout=1s` y
`port=3000`. El health check de Docker, por sí solo, no retira a tiempo una
instancia que está terminando. No se añaden reintentos de escrituras.
Para introducir estas labels se usa un servicio y router nuevos
`cukies-staging-web-v2` con prioridad 91; el anterior conserva prioridad 90
durante el primer relevo y el juego sigue en 100. Así no coinciden dos
definiciones diferentes del mismo servicio. Las entregas posteriores conservan
esas labels, versionadas en
[`infrastructure/ci/staging-web.labels`](../infrastructure/ci/staging-web.labels)
y aplicadas sólo a app32 como `custom_labels` (base64 en la API de Coolify).
El primer retiro de una imagen sin wrapper no valida el cierre:
hay que repetir la sustitución cuando la instancia anterior también lo incluya.
Producción requiere su configuración equivalente antes de activar app33.

Hay que probar sesiones y
recursos de una pestaña abierta durante la transición, además de los probes HTTP.

Los workers permanecen en un único recurso. `docker-compose.workers.yml` se
genera desde `docker-compose.coolify.yml`; retira la web y sus dependencias y
envía las llamadas HMAC a `CUKIES_WEB_URL` a través del proxy, que selecciona
instancias sanas. `CUKIES_WEB_RESOURCE_UUID` identifica el destino esperado.
No se copian las credenciales ni los perfiles de staging a producción.

## CI y selección de componentes

`.github/workflows/cukies-images.yml` procesa pushes de `staging` y `main`.
Cada rama usa su GitHub Environment (`cukies-staging` / `cukies-production`),
configuración pública, secretos y estado durable independientes. Las PR ejecutan
las pruebas de invariantes sin credenciales de despliegue. La web afectada debe
pasar lint, typecheck y Jest antes de construir su imagen.

Variables del Environment:

- `CUKIES_BUILD_ENV_JSON`: exclusivamente configuración pública de build. El
  nombre anterior `CUKIES_STAGING_BUILD_ENV_JSON` sólo sirve para la transición.
- `CUKIES_IMAGE_DEPLOY_ENABLED=true`: permite entregar. Staging conserva
  temporalmente compatibilidad con `CUKIES_STAGING_IMAGE_DEPLOY_ENABLED`.
- `CUKIES_DELIVERY_MODE=rolling`: web gradual y workers independientes.
- Registry y API Coolify conservan sus variables y secretos existentes.

`legacy-images` es únicamente el modo de bootstrap de staging: permite publicar
la primera imagen que entiende app32 y contiene readiness antes de mover el
tráfico. En el ensayo inicial se deshabilita temporalmente la entrega CI para
construir ese candidato sin reiniciar el Compose que sigue atendiendo tráfico. No se admite en producción ni es el procedimiento de rollback del
nuevo carril. Después de validar el cambio, staging debe usar `rolling`.

Nx selecciona componentes y BuildKit conserva las cachés `staging-*` y
`production-*`. El manifest fija cada imagen por digest y distingue el commit
de release del `sourceSha` de cada imagen reutilizada. No se reconstruye la
imagen web para un rollback.

`deliver-release.mjs` omite la entrega si imágenes, configuración pública y
Compose de workers no cambiaron. Un cambio exclusivamente documental puede
quedar en HEAD sin alterar el SHA servido; el estado durable conserva el último
despliegue real. Si cambia sólo la imagen web, no se reinician workers. Si cambian
workers, la web se vuelve a desplegar con el digest reutilizado para actualizar
la metadata de release y se verifica antes de reconciliar su único recurso.
Seleccionar una sola imagen para build no garantiza que Coolify reinicie sólo
ese servicio del Compose: hay que comprobar los contenedores reales.

## Migración y ensayo

### Juego independiente

`treasure-hunt` se construye desde `games/sybil-slayer` con Nx y una caché Next
propia. Su imagen standalone incluye servidor, chunks y assets públicos; Coolify
sólo debe descargar el digest. Los cambios del juego seleccionan esa imagen sin
reiniciar app32 ni app28. El manifest conserva por separado el commit agregado,
`webCommit`, `gameCommit` y el `sourceSha` de cada imagen: una imagen reutilizada
puede ser anterior a la metadata de su despliegue.

El primer paso desde Nixpacks exige snapshot privado de app31, imagen previa y
variables existentes; se desactiva su autodeploy Git y se prepara el recurso como
Docker Image, sin iniciarlo ni retirar el contenedor actual. El bootstrap exige
`git_commit_sha=HEAD` y ausencia de imagen del juego en el estado previo; si ya
hay un SHA fijado sin manifest verificable, se reconcilia antes de continuar.
El siguiente push construye el candidato en CI, fija digest/SHA e inicia el
relevo con health check. El entregador no convierte por sí solo un recurso
Nixpacks. App31 conserva puerto 3000 y el basePath
`/treasurehunt-game`; sus endpoints son `/treasurehunt-game/api/health` y
`/treasurehunt-game/api/ready`. Comprueban HTTP, versión y drenaje, sin afirmar
salud de las APIs del Hub ni de Mongo.

Las [labels de staging](../infrastructure/ci/staging-game.labels) mantienen host
y ruta. El router nuevo tiene prioridad 101 para superar al antiguo 100 durante
el relevo y al Hub 91; usa nombre de servicio independiente para introducir
health checks activos sin colisionar con la configuración anterior. Las
[labels de producción](../infrastructure/ci/production-game.labels) están
preparadas para app13, sin cambiar el servicio live.

Antes de registrar la migración como activa: verificar digest/SHA/guard,
health/ready, página y assets bajo basePath, manifest y CSP `frame-ancestors`;
después ensayar un cambio sólo del juego y un push documental sin reinicios.
La prueba de HTTP no sustituye jugar una sesión autenticada completa.

### Hub y workers

1. Conservar snapshots privados de configuración, último manifest y estado
   durable. Mantener Mongo externo, volúmenes y credenciales existentes.
2. Construir la primera imagen desde la rama de ese entorno y validar la web
   paralela sin tráfico público ni duplicar writers.
3. Mantener probes continuos y una sesión autenticada abierta. Cambiar el router
   del Hub cuando el candidato esté listo; conservar el router del juego
   independiente y su prioridad. No cambiar DNS para este relevo.
4. Dar tiempo a terminar solicitudes de la web anterior. Aplicar el Compose de
   workers al recurso anterior y verificar sus imágenes, índices, heartbeats y
   guards de capacidad. Persistir el manifest como `deliveryMode=rolling` sólo
   al cerrar ambas partes.
5. Ensayar otra entrega, un candidato cuyo health check falle y un rollback al
   digest anterior. Un candidato fallido no debe retirar la web que funciona.
6. Confirmar que una entrega documental no cambia contenedores ni SHA servido.

## Recuperación

Coolify conserva la instancia anterior cuando el candidato no supera su health
check. La restauración de campos de configuración por la API no equivale a un
rollback runtime: hay que comprobar qué imagen está sirviendo tráfico.
Si Coolify termina pero falla la comprobación pública, el entregador intenta
una sola recuperación de la web al digest previo y comprueba su respuesta.
Un resultado desconocido conserva la configuración y exige reconciliación.

La entrega crea un journal durable `release.json.pending.json` antes de mutar
Coolify. Registra qué web ha sido verificada antes de iniciar workers y sólo se
retira después de guardar el estado de éxito. Si queda pendiente, el siguiente
run se bloquea antes de construir; hay que comprobar el runtime, completar o
recuperar la entrega y archivar el journal antes de reanudar. No se elimina para
silenciar un fallo.

Si una operación sigue en progreso o su estado es desconocido, reconciliarla
antes de cambiar su configuración o lanzar otra. Una entrega con workers
parcialmente actualizados no se registra como éxito; exige comprobar el estado
real antes de repetirla. Las migraciones de datos deben ser compatibles con las
dos versiones durante el relevo y no se revierten automáticamente.

Para volver a una release previa se usa su manifest verificado y el mismo
procedimiento de entrega por digest. La retención debe preservar las imágenes
activas y las de recuperación; no ejecutar una limpieza global como parte del
despliegue. La ausencia de cortes se declara únicamente sobre los flujos y el
intervalo efectivamente medidos durante el ensayo.

## Capacidad del builder

VM1012 dispone de 12 GiB de RAM; BuildKit tiene un límite de 9 GiB y
`max-parallelism=1`. El 2026-09-09, el límite anterior de 6 GiB agotó memoria
al ejecutar `pnpm deploy` de schedulers y produjo exit 137/EOF antes de desplegar.
La caché reside en el volumen persistente del builder. El descriptor de
`docker buildx inspect` puede conservar una configuración antigua: contrastar
los límites del contenedor y `/etc/buildkit/buildkitd.toml` del daemon activo.
`prepare-buildx.sh` usa 9 GiB al crear un builder; los existentes se revisan antes
de modificarlos, con el runner inactivo y conservando su volumen de caché.
