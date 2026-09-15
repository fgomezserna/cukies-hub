# Cukies bridge relayer

Worker de producción para el bridge unidireccional `TRON mainnet -> BSC
mainnet`, reutilizando los contratos legacy desplegados. No existe canal de
vuelta y este worker no crea contratos ni ejecuta burns.

## Contratos aprobados

- TRON NFT: `TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe`.
- TRON bridge: `TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ`.
- BSC NFT: `0x0dbDeBCC62f11005BF434ABFad74564E896aC861`.
- BSC bridge: `0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E`.

El bridge TRON tiene el rol minter habilitado y el bridge BSC es owner y
minter del NFT de destino. Las direcciones están fijadas en `src/config.ts` y
no se pueden sustituir por configuración.

## Flujo

1. Lee únicamente eventos `JumpInBridge` confirmados desde TronGrid mainnet.
2. Deduplica por `sourceTxHash + sourceEventIndex` en
   `cukies_bridge_relayer_jobs`.
3. Comprueba que el NFT original sigue custodiado por el bridge TRON.
4. Consulta la metadata actual del NFT en TRON.
5. Antes de enviar ninguna transacción, consulta si el `tokenId` ya existe en
   BSC. Si existe, no llama a `jumpOutBridge` y deja el trabajo en revisión
   manual.
6. Solo cuando BSC confirma que el token no existe, simula y envía el
   `jumpOutBridge` legacy de siete argumentos.
7. Espera confirmaciones, exige el evento `JumpOutBridge` y verifica el owner
   final como comprobación posterior, no como criterio anti-replay.

La consulta `ownerOf(tokenId)` se usa como sonda de existencia porque el NFT
legacy no expone un `exists()` público. El revert conocido de token inexistente
se interpreta como ausencia; un fallo RPC o de transporte en esa sonda deja el
trabajo reintentable, pero nunca habilita un mint a ciegas. Si el trabajo ya
está `submitted`, cualquier error al inspeccionar el receipt se marca como
`manual_review`: el relayer no reintenta ni vuelve a llamar a `jumpOutBridge`
cuando no puede probar si la primera transacción llegó a minarse.

Los trabajos tienen leases atómicos, backoff, DLQ y revisión manual. Una
transacción BSC cuyo receipt sea ambiguo no se reenvía automáticamente.

## Verificación local

```bash
pnpm --filter @cukies/cukies-bridge-relayer typecheck
pnpm --filter @cukies/cukies-bridge-relayer test
pnpm --filter @cukies/cukies-bridge-relayer build
```

Las pruebas locales no firman ni emiten transacciones. El E2E firmado está
bloqueado deliberadamente en `src/e2e-real.ts` y requiere un runbook manual
aprobado; no se debe automatizar en CI.

## Configuración de producción

El servicio está en el profile Docker `bridge-relayer` y permanece apagado
salvo que se habilite explícitamente. El Compose oficial mantiene
`CUKIES_BRIDGE_RELAYER_ENABLED=false` por defecto y sus valores de seguridad
para Stage (`TRON Nile` y `BSC 97`); esos defaults no pueden activar este
relayer mainnet: la configuración los rechaza antes de abrir Mongo o RPC.
El relayer no forma parte del runtime Stage (incluido el overlay híbrido). La
única ejecución de producción prevista es el contenedor dedicado `CT2050`,
fuera del Compose Stage, con una release y secretos de producción revisados.

La configuración activa exige:

- `APP_ENV=production` y `STAGING_ONLY_GUARD=false`;
- si se inyecta `NEXT_PUBLIC_APP_ENV`, debe ser también `production`;
- `CUKIES_BRIDGE_RELAYER_ENABLED=true`;
- `CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM=ENABLE_TRON_MAINNET_TO_BSC_MAINNET_LEGACY_RELAYER`;
- Mongo privado con base `cukieshub-new`;
- timestamp de inicio aprobado inmediatamente antes de la activación;
- RPC HTTPS de BSC mainnet, wallet BSC autorizada y su address esperada.

Las claves privadas solo se inyectan como secretos de Coolify. No guardar
claves, URLs Mongo ni `.env` generados en Git.

## Activación segura

1. Desplegar la revisión con el profile presente pero el relayer desactivado.
2. Comprobar `/api/health`, SHA servido y logs del contenedor.
3. Fijar el timestamp de inicio aprobado y validar que el cursor no reprocese
   histórico no autorizado.
4. Habilitar el worker y realizar una única transferencia controlada.
5. Verificar evento TRON, job Mongo, `JumpOutBridge`, owner final y ausencia de
   una segunda representación.

Si una comprobación on-chain o RPC es ambigua, desactivar el worker y pasar el
job a revisión manual; nunca repetir el mint por suposición.
