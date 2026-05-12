# UKI NFT data quality report

Estado: informe inicial reproducible.
Issue: #21 `UKI-002.2`.
Fecha: 2026-05-12.

## Objetivo

Validar que las fuentes NFT actuales tienen datos suficientes para construir `NftInventoryService`, especialmente:

- owner por wallet,
- red BSC/TRON,
- `tokenId`,
- rareza,
- generacion,
- metadata,
- listing status,
- bridge status.

## Metodo seguro

Se añade `dapp/scripts/audit-nft-data-quality.mjs` para muestrear colecciones sin imprimir documentos completos, wallets, emails, metadata extensa ni cadenas de conexion.

Uso:

```bash
source ~/.zshrc >/dev/null 2>&1 && \
CUKIES_DATABASE_URL="$CUKIES_DATABASE_URL" \
pnpm --dir dapp node scripts/audit-nft-data-quality.mjs \
  --db cukies \
  --limit 200 \
  --collections cukies,originals,tx_nfts,txMarketplace,wallets
```

Salida esperada:

- conteo total por coleccion,
- conteo muestreado,
- clasificacion agregada BSC/TRON/unknown,
- presencia/ausencia por campo normalizado,
- campos fuente detectados,
- issues agregados tipo `missing_all`, `missing_partial`, `unknown_network`.

## Fuentes muestreadas

El muestreo debe cubrir estas colecciones, definidas en `docs/uki-nft-data-inventory.md`:

| Coleccion | Motivo | Campos criticos |
| --- | --- | --- |
| `cukies` | Candidata principal para NFT/personaje materializado. | network, contract, tokenId, owner, rarity, generation, metadata. |
| `originals` | Candidata para generacion original. | tokenId, owner, rarity, generation/coleccion, metadata. |
| `tx_nfts` | Historial de movimientos NFT. | network, contract, tokenId, from, to/owner, status, timestamp. |
| `txMarketplace` | Listing/ventas marketplace. | network, contract, tokenId, seller/buyer, listingStatus/status. |
| `wallets` | Relacion wallet usuario historico. | address, posible network/tipo. |

## Criterios de calidad

| Campo | Calidad minima | Bloquea implementacion si falla |
| --- | --- | --- |
| `network` | BSC/TRON identificable o derivable para NFTs elegibles. | Si, para pool/cupos/bridge. |
| `contractAddress` | Presente o derivable por coleccion/red. | Si, para reconciliacion y exploradores. |
| `tokenId` | Presente para cada NFT elegible. | Si. |
| `ownerWallet` | Presente o derivable desde wallet/ultimo evento. | Si, antes de cualquier lock economico. |
| `rarity` | Presente o derivable desde metadata. | Si, para puntos NFT y rewards ponderadas. |
| `generation` | Presente o derivable como Original/2a Gen. | Si, para prioridad de pool y reglas de Cukie Master. |
| `metadata` | Presente para UI o al menos asset lookup. | No bloquea contratos, pero bloquea UX completa. |
| `listingStatus` | Presente o derivable para detectar `listed`. | Si, antes de pool/staking NFT. |
| `bridgeStatus` | Presente o derivable para detectar `bridging`. | Si, antes de pool/staking NFT. |

## Resultado inicial desde repo

Sin ejecutar muestreo live, el repo confirma:

- `dapp/src/lib/mongodb-cukies.ts` expone helpers para `cukies`, `originals`, `wallets`, `tx_nfts` y `txMarketplace`.
- `dapp/src/lib/user-sync.ts` confirma que existen wallets TRON (`T...`) y BSC/EVM (`0x...`) y que la normalizacion difiere por red.
- `dapp/scripts/inspect-databases.mjs` demuestra que ya existia una inspeccion manual de bases, pero imprime muestras de documentos; no debe usarse para reportes compartidos sin sanitizar.
- `cukies-hub` no contiene modelos NFT actuales en Prisma; los nuevos modelos deben depender de una capa normalizada y no copiar ownership completo sin motivo.

## Riesgos detectados antes del muestreo live

1. `owner` puede no vivir directamente en `cukies`/`originals`; puede requerir cruce con `wallets` o ultimo evento `tx_nfts`.
2. `txMarketplace` puede ser historial de eventos y no estado activo materializado.
3. `bridgeStatus` no aparece como helper explicito; puede vivir en una coleccion no expuesta o dentro de metadata/status.
4. `rarity` y `generation` pueden estar anidados en metadata/attributes con nombres no uniformes.
5. La deteccion de red puede estar implícita por address (`0x...`/`T...`) o por coleccion, no como campo directo.

## Como interpretar el muestreo

Si el script devuelve:

- `missing_all:owner` en `cukies` y `originals`: usar `tx_nfts` o `wallets` como owner source y documentar precedencia en #22.
- `missing_all:rarity`: buscar rareza dentro de `metadata.attributes` o fuente externa antes de Cukie Master.
- `missing_all:generation`: derivar generacion por coleccion (`originals`) o mapping de contratos.
- `missing_all:listingStatus`: confirmar si hay coleccion de listings activa fuera de helpers.
- `missing_all:bridgeStatus`: confirmar fuente del bridge antes de permitir pool/staking NFT.
- `unknown_network` alto: no habilitar acciones economicas hasta definir mapping contract/red.

## Salida requerida para cerrar muestreo live

Cuando haya acceso controlado a Mongo, pegar en el issue o PR solo tablas agregadas como:

```text
Collection: cukies
Sampled: 200
Networks: BSC 120, Tron 74, unknown 6
owner: present 198 / missing 2
rarity: present 200 / missing 0
generation: present 185 / missing 15
listingStatus: present 0 / missing 200
bridgeStatus: present 0 / missing 200
Issues: missing_all:listingStatus, missing_all:bridgeStatus, unknown_network:6/200
```

No publicar:

- wallets completas,
- emails,
- nombres de usuarios,
- metadata completa,
- tx hashes completos,
- cadenas de conexion,
- documentos JSON sin redaccion.

## Decision para siguientes issues

- #22 debe diseñar `NftInventoryService` asumiendo que owner/listing/bridge pueden venir de varias colecciones.
- #21 queda listo para cerrarse cuando el muestreo live sanitizado confirme porcentajes reales o documente que el acceso a Mongo queda pendiente de ops.
- Si el muestreo descubre colecciones no inventariadas, actualizar `docs/uki-nft-data-inventory.md` antes de implementar.

