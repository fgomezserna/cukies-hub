# Cukies bridge relayer

Worker Stage-only para la migracion unidireccional `TRON Nile -> BSC Testnet`.
Permanece desactivado por defecto y no soporta mainnet ni el camino de vuelta.

## Flujo

1. Lee exclusivamente `BridgeRequested` confirmados desde TronGrid Nile.
2. Deduplica por `transferId` en `cukies_bridge_relayer_jobs`.
3. Comprueba que el NFT original sigue en custodia del endpoint Nile.
4. Carga la metadata completa desde la copia aislada `cukieshub-new-staging` y
   exige que coincida con el hash on-chain.
5. Simula y envia `completeBridge` al endpoint BSC Testnet allowlisted.
6. Espera el numero configurado de confirmaciones y reconcilia simultaneamente:
   original custodiado en Nile, `processedTransfers=true` y owner BSC correcto.
7. Registra la evidencia de que existe una sola representacion circulante.

Los fallos definidos se reintentan con backoff. Una transaccion enviada cuyo
receipt queda ambiguo nunca se reenvia automaticamente: termina en DLQ para evitar
doble ejecucion. Los eventos malformed tambien se conservan en DLQ sin bloquear el
cursor completo.

## Verificacion local sin firmas

```bash
pnpm --filter @cukies/cukies-bridge-relayer test
pnpm --filter @cukies/cukies-bridge-relayer typecheck
pnpm staging:bridge:verify-local
```

Estas comprobaciones usan fakes/in-memory y no necesitan RPC, Mongo ni private key.

## Activacion Testnet

El servicio Docker usa el profile `bridge-relayer`. Ademas del profile, exige:

- `APP_ENV=staging`, `STAGING_ONLY_GUARD=true` y la identidad Coolify de app 28;
- `CUKIES_BRIDGE_RELAYER_ENABLED=true`;
- `CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM=ENABLE_TRON_NILE_TO_BSC_TESTNET_RELAYER`;
- Mongo y DB exactamente `cukieshub-new-staging`;
- TRON `nile`, `https://nile.trongrid.io` y endpoints Nile propios;
- BSC chain `97`, endpoints BSC Testnet propios y RPC que responda chain `97`;
- private key BSC de un relayer efimero/operativo ya allowlisted.

No guardar la private key en Git ni en archivos generados. Configurarla solo como
secreto de Coolify. Antes de activar hay que desplegar y verificar ambos endpoints,
transferir la capacidad de mint correcta, fijar el bloque/timestamp inicial y
realizar el E2E manual con un NFT fixture.
