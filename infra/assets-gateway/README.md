# Cukies assets gateways

Estos Compose son servicios independientes del hub Next.js. Cada entorno usa un
bucket, prefijo, credencial de lectura y hostname distintos. El gateway sólo
permite `GET`, `HEAD` y `OPTIONS`; el listado y el índice están desactivados.

La imagen NGINX S3 Gateway queda fijada por digest en los dos Compose. Las
credenciales se montan como Docker secrets desde archivos locales `0444` que no
se guardan en Git. El worker escribe directamente contra MinIO por LAN; el
gateway sólo lee.

Despliegue controlado en VM1001:

```bash
docker compose --env-file /etc/cukies/assets-gateway/staging.env \
  -f docker-compose.staging.yml up -d
docker compose --env-file /etc/cukies/assets-gateway/production.env \
  -f docker-compose.production.yml up -d
```

Antes de activar un entorno se debe probar `/health`, una clave controlada,
`GET`/`HEAD`/`OPTIONS`, un `404` para una clave inexistente y un rechazo de
listado. El prefijo interno se oculta mediante `PREFIX_LEADING_DIRECTORY_PATH`;
por eso el worker de ese entorno debe usar el mismo valor en
`CARD_WORKER_PUBLIC_KEY_PREFIX`.
