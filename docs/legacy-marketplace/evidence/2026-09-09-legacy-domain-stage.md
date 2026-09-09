# Legacy por dominio en Stage — primer lote

Fecha: 2026-09-09. Rama: `codex/legacy-domain-stage`. Base de `origin/staging`:
`16466025030bfb9a0a3c784431988c5840430f93`.

Este registro cubre el primer lote de LEG de la tabla canónica. El cambio es
local y no certifica publicación, reconciliación histórica ni activación live.
No se ejecutaron transacciones, signers, relayers, escrituras Mongo ni cambios
de Coolify.

| ID | Comprobación | Estado local | Evidencia principal | Bloqueo o siguiente paso |
| --- | --- | --- | --- | --- |
| LEG01 | Identidades Legacy BSC/TRON por dominio | Implementado | `dapp/src/lib/legacy-marketplace/config.ts`; `bridge-runtime.ts` | Contrastar la configuración servida y los cursores Stage después del despliegue. |
| LEG02 | Lectura Legacy separada de operaciones | Implementado | `runtime.ts`: `legacyMainnetReadEnabled` / `legacyMainnetOperationsEnabled` | El gate de operaciones Stage queda falso hasta revisión de relayer/custodia. |
| LEG03 | Bridge con modo `legacy-readonly` | Implementado | `bridge-runtime.ts`; `bridge-client.tsx` | No habilitar `requestBridge`, approval ni relayer sin topología E2E revisada. |
| LEG04 | No falsear disponibilidad operativa | Implementado | `bridge-client.tsx`, `breeding-client.tsx` | La vista puede leer; las transacciones permanecen bloqueadas. |
| LEG05 | Bridge BSC/TRON usa direcciones Legacy existentes | Implementado | `contracts.json`; evidencia de contratos 2026-09-07 | La evidencia de bytecode no sustituye una prueba de custodia o E2E. |
| LEG06 | Lecturas BSC fijadas a la red Legacy | Implementado | `breeding-client.tsx`, `cukiepoints-client.tsx` con `chainId: 56` | Validar con RPC/contratos servidos; no cambiar a la red de economía nueva. |
| LEG07 | Cukie Points consultable en Stage | Implementado | `cukiepoints-client.tsx`; `/api/cukies/points` | Reconciliar historial, claimed/pending y cutoff; un conjunto vacío no es saldo cero. |
| LEG08 | Crías consultables en Stage | Implementado | `breeding-client.tsx`; rutas `/api/cukies/breeding/*` | Validar datos y cursores por BSC/TRON; no declarar paridad por lectura de contrato. |
| LEG09 | Escrituras de Crías conservan gate | Implementado | `legacyMainnetOperationsEnabled` y guards de `approve/start/breed` | Requiere decisión operativa explícita y pruebas controladas antes de activar. |
| LEG10 | Rutas comunes para Bridge/Crías/Points | Implementado | `app-layout.tsx`: `/bridge`, `/breeding`, `/cukiepoints` | Verificar navegación en el SHA servido de Stage, incluida la vista móvil. |
| LEG11 | Misma navegación desktop/móvil | Implementado | `navigationGroups` compartido | No mantener un menú Legacy paralelo por entorno. |
| LEG12 | Datos Stage aislados | Preservado | `docs/deployment-environments.md`; rutas API existentes | Activar worker dedicado solo con Mongo/cursor Stage explícitos. |
| LEG13 | RPC archive para backfill Legacy | Bloqueado externo | Issue #321 y `evidence/2026-09-07-indexer-archive-rpc.json` | Resolver proveedor archive y límites antes de ingerir; no saltar bloques ni resetear cursores. |
| LEG14 | Manifiesto y ABIs Legacy | Inventariado | `docs/legacy-marketplace/contracts.json`, `abis/`, evidencia de contratos 2026-09-07 | Completar replay/idempotencia/orden tardío/reorg por contrato y red. |
| LEG15 | Identidad contractual Bread | Sin verificar | `cukies-world/scripts/assets/items.csv` y `output/items/`: IDs 10178–10181 y 10214–10217 | Obtener address, bytecode y ABI de Bread; no equipararlo a Breeding ni declararlo off-chain solo por el nombre. |

## Verificación local

- `pnpm --dir dapp test -- --runInBand __tests__/lib/legacy-marketplace-runtime.test.ts __tests__/lib/cukies-bridge-runtime.test.ts __tests__/components/cukiepoints-client.test.tsx` — 3 suites, 15 tests OK.
- `pnpm --dir dapp exec jest --runInBand` — suite completa: 234 suites, 1.887 tests OK.
- Compilación focal de `runtime.ts` y `bridge-runtime.ts` con TypeScript — OK.
- `pnpm --dir dapp lint` — OK, sin warnings ni errores.
- `pnpm --dir dapp typecheck` — OK después de ejecutar `pnpm --dir dapp exec prisma generate` (necesario porque la instalación inicial usó `--ignore-scripts`).
- `pnpm --dir dapp build` — OK: compilación, 92 páginas estáticas y trazas finalizadas.
- Guard TRON: helper de origen RPC y regresiones mainnet/Nile; las lecturas limpian el snapshot y muestran cambio de red cuando TronLink no está en la red Legacy esperada.

La presencia de un endpoint HTTP, una ruta o un contrato con bytecode no acredita
que el worker avance, que el relayer custodie activos o que una operación sea
segura para firmar. La activación requiere además el inventario de proveedores,
destino/cursor Stage, replay y reconciliación por wallet/colección/contrato.
