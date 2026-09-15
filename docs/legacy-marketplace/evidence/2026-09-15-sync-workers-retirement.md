# Retirada de getters/setter históricos — 15/09/2026

## Alcance

Se retiraron exclusivamente los workers off-chain `getter-bsc`, `getter-tron`
y `setter`. Se conservaron `legacy-chain-indexer`, bridge/relayer, contratos,
ABIs, APIs legacy y el generador de imágenes.

La retirada reproducible del código está en `cukiesworld-stack` PR #19, commit
`d52916fcfebb15a0deac4c46e8aca07c31b5839f`.

## Estado observado antes del corte

- CT2051 Stage: los tres contenedores estaban `Exited (137)` desde hacía ocho
  horas y pertenecían al Compose `cukies-legacy-stage`.
- CT2050 Producción: los tres contenedores estaban `Exited (137)` desde hacía
  veintidós horas y seguían declarados en la release
  `101936aeee43e53ba286e238167114d4424e5a4a`.
- El `legacy-chain-indexer` de Stage estaba `Exited (1)`; por tanto esta retirada
  no acredita sincronización ni paridad.

## Cambio aplicado

- CT2051: se eliminaron los tres contenedores detenidos y se archivaron el
  Compose dedicado y sus tres ficheros de entorno en
  `/opt/cukies/stage/legacy/retired-getter-setter-d52916fc/`.
- CT2050: se archivó la configuración previa en
  `/opt/cukies/prod/retired-sync-workers/d52916fc/`; se retiraron los tres
  servicios del Compose efectivo, sus referencias de imagen, sus ficheros de
  entorno y los tres contenedores detenidos.
- No se eliminaron imágenes, volúmenes ni datos Mongo.

## Incidente durante el corte de Stage

El primer comando de retirada usó `docker compose down --remove-orphans` sobre
el Compose dedicado. Aunque ese fichero declaraba solo los tres workers, el
proyecto compartía el nombre `cukies-legacy-stage`; Docker eliminó también diez
contenedores legacy ajenos al alcance.

Se restauraron inmediatamente, sin `--remove-orphans`, con las fuentes ya
existentes:

```bash
docker compose --env-file production-selected.env \
  -f docker-compose.yml \
  -f docker-compose.legacy.lxc.yml \
  -f docker-compose.production-data.lxc.yml \
  -f docker-compose.codex-matchmaking.yml up -d
```

Servicios restaurados: `marketplace`, `login`, `game-api`, `auth-api`,
`data-graphql-api`, `data-rest-api`, `data-rest-learn-api`,
`data-rest-ludo-api`, `learn-bot-worker` y `matchmaking-api`.

## Verificación final

- CT2051: los diez servicios anteriores quedaron `Up`; no existe ningún
  contenedor getter/setter ni el Compose activo que podía recrearlos.
- CT2050: los demás servicios conservaron su estado; no existe ningún
  contenedor ni declaración activa getter/setter.
- `https://cukieshub.eurekand.com/api/health` y `/api/ready`: HTTP 200.
- `https://cukies.world/api/health` y `/api/ready`: HTTP 200.

Esta evidencia cierra solo la retirada de los workers antiguos. La incidencia
principal continúa abierta hasta que el indexer BSC/TRON avance cursores y se
demuestre `on-chain = Mongo = API`.
