# Coolify deployment

> Transición de producción (14-09-2026): el servicio live sigue en Coolify
> mientras se prepara el destino directo `pve-04`/LXC `2050`
> (`192.168.1.245`). No se ha cambiado DNS ni el Cloudflare Tunnel. El runbook
> del destino está en [deploy/lxc/README.md](../deploy/lxc/README.md).

El procedimiento vigente de imágenes, separación web/workers, bootstrap y rollback
vive en [deployment-rolling-transition.md](deployment-rolling-transition.md).

Push a `main` y `staging` dispara `.github/workflows/cukies-images.yml`, con GitHub
Environments y cachés separados. El builder de VM1012 publica imágenes fijadas por
digest en el registry. Durante esta transición Coolify sigue siendo el runtime
live (web Docker Image y workers); el destino LXC solo hace `pull` y `up` de esas
imágenes. Mongo permanece fuera y no se habilitan perfiles de staging en
producción.

Durante el bootstrap productivo app33 permanece privada y app12 sigue sirviendo
la versión anterior. Git autodeploy de app12 debe apagarse antes del primer push
con el nuevo workflow. La variable `CUKIES_IMAGE_DEPLOY_ENABLED=false` permite
construir y probar el candidato antes de activar entrega automática.

`docker-compose.coolify.yml` es la fuente de topología; regenerar derivados con
`node scripts/ci/generate-images-compose.mjs --write` y comprobar `--check`.
La operación gradual de Coolify usa `docker-compose.workers.yml`; el despliegue
directo usa el mismo `docker-compose.images.yml` más
`docker-compose.production.lxc.yml`. Las BBDD, secretos, guards, gates y
perfiles de cada entorno se conservan. El cambio de Tunnel a `.245` solo se hace
después del smoke de health/ready, indexer, relayer y marketplace, manteniendo
Coolify como rollback.
