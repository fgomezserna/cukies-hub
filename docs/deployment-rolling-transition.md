# Entrega gradual de imágenes

La implementación se valida primero en staging antes de habilitar el mismo
proceso en producción. El estado live y las evidencias finales se registran en
`antes-del-15-seguimiento.md`; la guía principal sigue siendo
[`deployment-environments.md`](deployment-environments.md).

## Recursos y responsabilidades

| Entorno | Web Docker Image | Workers Compose | Destino público |
| --- | --- | --- | --- |
| Staging | App32 `rwwsc4kkwc0ck84cgk40s8kk` | App28 `u4s804o4wwcckowgk0woo4wg` | `https://cukieshub.eurekand.com` |
| Producción | Pendiente de provisión y ensayo previo | App12 `jookw8ow8woks088s44404ok` | `https://cukies.world` |

La web no publica un puerto del host ni usa un nombre fijo de contenedor.
Coolify arranca su reemplazo, exige `/api/ready` y después termina la instancia
anterior. `/api/ready` hace un ping read-only a Mongo con timeout; `/api/health`
identifica la release y el recurso, pero no prueba disponibilidad de Mongo.
Next.js recibe `deploymentId` al construir la imagen y conserva su manejo de
SIGTERM para terminar las solicitudes pendientes. Hay que probar sesiones y
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
workers, la web se verifica antes de reconciliar su único recurso.

## Migración y ensayo

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
