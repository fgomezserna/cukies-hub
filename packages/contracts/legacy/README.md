# Contratos legacy de Cukies World

Archivo de fuentes y procedencia separado de los contratos nuevos de UKI.
Inventario y estado de migracion: [documento legacy](../../../docs/legacy-marketplace/README.md).

## Estructura

```text
packages/contracts/
  contracts/               contratos nuevos y fixtures; Hardhat actual
  legacy/
    bsc/
      token/contracts/     bundle verificado CukieToken
      points/contracts/    bundle verificado CukiesPoints
      staking_points/contracts/
      bridge/contracts/    bundle verificado CukiesNFTBridge
      */provenance.json    fuente, compiler/settings, deploy, hashes
    tron/                  estado de recuperacion de fuentes TRON
    reference/             material del repo antiguo sin deploy acreditado
```

Las cuatro carpetas BSC preservan bundles independientes de Sourcify, con sus
dependencias y licencias originales. `TOKEN`, `POINTS` y `BRIDGE` tienen
`exact_match`; `STAKING_POINTS` tiene `match`, que no acredita metadata exacta.
El compilador declarado es `solc 0.5.4+commit.9549d8ff`, optimizer 200 runs.
No se ha ejecutado compilacion local, firma ni despliegue de estos bundles.

`reference/MarketplaceInGame.sol` es una copia exacta del repo
`fgomezserna/cukiesworld-stack`, con commit y SHA-256 en `provenance.json`.
Es un marketplace ERC1155/ERC20 de referencia; no es la fuente acreditada de
ninguna de las 14 direcciones legacy.

## Registros y limites

- El registro unico de addresses, owners, fuentes y despliegues disponibles
  sigue en [contracts.json](../../../docs/legacy-marketplace/contracts.json).
  No mantener otra tabla manual de direcciones en este paquete.
- Las lecturas fechadas de mainnet viven en
  [evidence/2026-09-07-contracts.json](../../../docs/legacy-marketplace/evidence/2026-09-07-contracts.json).
- Las ABI importadas por la DApp siguen en
  [legacy-marketplace/abis](../../../dapp/src/lib/legacy-marketplace/abis).
  Centralizar esos imports requiere un cambio mecanico separado que actualice
  todos los consumidores y compruebe la compatibilidad; no crear otra copia.
- El Hardhat actual usa `sources: './contracts'` y Solidity `0.8.28`: excluye
  expresamente este arbol por su ubicacion. No mover aqui fuentes antiguas al
  directorio de compilacion moderno ni cambiarles el pragma para hacerlas compilar.
- Antes de operar un contrato: verificar red, address, runtime, roles y custodia,
  reproducir su compilacion en un flujo legacy aislado y probar la operacion.
- Las claves privadas, RPC keys y passwords se custodian fuera de Git. Registrar
  rol, address publica, ubicacion segura y estado de rotacion; nunca valores.

Pendientes de recuperar: fuente verificada BSC `BREEDING_POINTS` y `MARKETPLACE`,
y fuentes verificadas TRON. Una ABI o una respuesta con bytecode no sustituyen
la fuente ni prueban un despliegue reproducible.
