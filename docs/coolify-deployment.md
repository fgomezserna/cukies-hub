# Coolify deployment

El procedimiento vigente de imágenes, separación web/workers, bootstrap y rollback
vive en [deployment-rolling-transition.md](deployment-rolling-transition.md).

Push a `main` y `staging` dispara `.github/workflows/cukies-images.yml`, con GitHub
Environments y cachés separados. Coolify consume imágenes fijadas por digest del
registry; la construcción ocurre en VM1012. La web tiene recurso Docker Image
(app33 producción / app32 staging); el Compose de workers queda en app12 / app28.
Mongo permanece fuera. No se habilitan perfiles ni se promueve producto de staging
como parte del cambio de infraestructura.

Durante el bootstrap productivo app33 permanece privada y app12 sigue sirviendo
la versión anterior. Git autodeploy de app12 debe apagarse antes del primer push
con el nuevo workflow. La variable `CUKIES_IMAGE_DEPLOY_ENABLED=false` permite
construir y probar el candidato antes de activar entrega automática.

`docker-compose.coolify.yml` es la fuente de topología; regenerar derivados con
`node scripts/ci/generate-images-compose.mjs --write` y comprobar `--check`.
La operación gradual usa `docker-compose.workers.yml`. Las BBDD, secretos, guards,
gates y perfiles de cada entorno se conservan.
