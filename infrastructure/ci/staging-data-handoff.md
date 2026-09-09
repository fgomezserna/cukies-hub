# Mongo de staging en LXC 2007

Estado 2026-09-09: migración completada y live verificada. Las tres bases operan en el LXC;
el Mongo original está detenido con sus volúmenes conservados.

[Evidencia de reconciliación y servicio](2026-09-09-mongo-lxc-evidence.json):
577.434 documentos, hashes de colecciones, índices y vistas sin diferencias antes
de reabrir escrituras; cinco conexiones autenticadas, Prisma y avance del indexador
verificados. App 28 usa ahora `docker-compose.images.yml`; el primer rollout de
imágenes verificado es Coolify `1462`, SHA `0896fbd`. El Compose protegido
`/root/cukies-mongo-migration-20260909/runtime-lxc.json` conserva la configuración
del corte de Mongo previo a ese rollout. El flujo vigente y su evidencia están en
[`docs/deployment-environments.md`](../../docs/deployment-environments.md).

## Destino

- LXC `2007`, nodo `pve-04` (`192.168.1.199`), IP `192.168.1.221`.
- Instancia dedicada `mongod-cukies-staging.service`, puerto `27018`, Mongo 7.0.26.
- Replica set `cukies-staging-rs0`, autenticación obligatoria y keyfile local.
- Datos `/var/lib/cukies-staging-mongodb`; logs `/var/log/cukies-staging-mongodb`.
- Configuración y unidad de referencia: `mongod-cukies-staging.conf` y
  `mongod-cukies-staging.service` en este directorio. El keyfile nunca va en Git.
- El Mongo compartido existente en `27017`, sus bases y sus usuarios no se modifican.
  Contiene otras aplicaciones y copias históricas con los mismos nombres de staging.
- El LXC tiene 4 GiB de RAM. La instancia de staging limita su caché WiredTiger a
  0,5 GiB y su servicio a 1,5 GiB. El servicio existente mantiene su configuración.
- Mongo y cualquier Postgres quedan fuera del ciclo de despliegue de la aplicación.

## Migración histórica y repetición controlada

La migración descrita aquí ya está completada. Los pasos siguientes son el registro
histórico y solo sirven para repetir una operación controlada con una ventana,
backup, reconciliación y validación equivalentes; no son pasos pendientes de app 28.

1. Desactivar el autodeploy de app 28 y mantener
   `CUKIES_STAGING_IMAGE_DEPLOY_ENABLED=false` durante una repetición controlada. Esperar a que no haya despliegues
   activos ni en cola de app 28 antes de detener clientes.
2. Inventariar todos sus contenedores, configuración y variables en un directorio
   protegido del host; nunca imprimir credenciales ni persistirlas en el repo.
3. Parar los clientes de staging, bloquear brevemente las escrituras del Mongo
   original y guardar un dump completo consistente con oplog. Registrar hashes,
   recuentos, índices y vistas de las tres bases; liberar el bloqueo incluso si falla.
4. Convertir una copia aislada del dump en el builder: restaurar en 4.4.29 con las
   mismas herramientas de origen y recorrer 5.0, 6.0 y 7.0.26, avanzando FCV en cada
   salto. Mantener TTL desactivado durante la reconciliación. Ningún contenedor de
   conversión publica puertos. Comprobar cada apagado limpio.
5. Transferir los datos convertidos al directorio nuevo y vacío del LXC. Arrancar
   la instancia con autenticación, inicializar la replica en
   `192.168.1.221:27018` y verificar `PRIMARY`.
6. Reconciliar datos, índices y vistas antes de reactivar escrituras. Comprobar la
   conexión de los usuarios de aplicación a `cukies-hub-staging`,
   `cukies-legacy-staging` y `cukieshub-new-staging`.
7. Cambiar solo los endpoints de staging en Coolify y recrear sus clientes con las
   imágenes ya desplegadas. Retirar el servicio Mongo del Compose operativo, sin
   borrar sus volúmenes. Verificar web, consultas de aplicación y avance de workers.
8. Reactivar TTL tras reconciliar. El autodeploy Git de app 28 permanece desactivado;
   la entrega normal se habilita únicamente mediante el workflow de imágenes y su
   postflight verificado.

## Rollback y límites

Los datos originales y la configuración anterior permanecen en VM1001. El
contenedor preservado se llama `cukies-mongo-rollback-20260909`, está detenido
y tiene `restart=no`. Se recreó sin labels de Coolify/Compose tras el primer rollout,
que retiró el contenedor huérfano pero conservó sus dos volúmenes; así las siguientes
releases no lo asocian al proyecto. Sus volúmenes siguen montados y no se han eliminado. Antes de
aceptar escrituras en el destino, se puede volver a los endpoints originales y
arrancar los clientes con la configuración guardada. Tras aceptar escrituras en
el LXC, no volver al origen sin reconciliar el delta: hacerlo perdería datos nuevos.
No es un rollback a ciegas. No restaurar sobre el Mongo compartido de `27017` ni usar
`resync.sh`, que copia en la dirección histórica contraria. No limpiar los volúmenes
originales durante la validación. Cualquier rollback de imágenes conserva el manifest
previo y sus digests, reaplica el Compose de imágenes y vuelve a comprobar health; no
vuelve al Compose legacy ni cambia la base de datos.

## Evidencia

El inventario, backup y configuración protegida se conservan en VM1001 bajo
`/root/cukies-mongo-migration-20260909`. La conversión y su copia se conservan en
VM1012 bajo `/srv/cukies-ci/mongo-transfer-20260909`. Los dumps contienen datos y
credenciales de base de datos: acceso restringido al operador, sin artefactos
públicos de CI. El estado final y hashes no sensibles se registran al finalizar.
