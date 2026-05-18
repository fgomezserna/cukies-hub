# Auditoria de trackers legacy Cukies World

Fecha: 2026-05-18

Origen revisado: `/Users/fgomezserna/Proyectos/cukies-world`

Objetivo: entender el pipeline legacy de eventos on-chain que alimenta Mongo y definir como reconstruirlo en `cukies-hub` con una arquitectura mas robusta, reintentable y auditable.

## Resumen ejecutivo

El legacy tiene dos pipelines distintos que intentan resolver el mismo problema:

1. **Pipeline runtime**: `producer-bsc` y `producer-tron` escuchan contratos con listeners, normalizan eventos, los meten en Redis/Bull, guardan una copia en `processedEvents` via GraphQL y un `consumer` aplica mutaciones sobre Mongo via GraphQL.
2. **Pipeline sync/backfill**: `apps/backend/sync/{bsc,tron}/getter.js` consulta eventos por polling y los inserta directamente en `processedEvents`; `setter.js` lee eventos no procesados y ejecuta handlers que mutan Mongo directamente.

La idea funcional es correcta: Mongo es la vista de lectura principal y la cadena es el origen de verdad. El problema es que el legacy no tiene un unico event store ni un unico projector. Hay divergencias entre senders y handlers, estados parcialmente idempotentes, timestamps mezclados entre segundos y milisegundos, secretos expuestos en codigo/config y fallos criticos en algunos eventos.

La nueva version debe separarse en cuatro capas claras:

- **Ingesta**: leer logs confirmados de BSC/TRON.
- **Event store**: guardar eventos normalizados e inmutables con claves idempotentes.
- **Projectors**: aplicar eventos a colecciones de lectura (`cukies`, `tx_nfts`, `points`, etc.) de forma determinista.
- **Reconciliacion**: comparar periodicamente Mongo contra estado on-chain y reparar diferencias.

## Flujo legacy detectado

### Runtime: producers + consumer

Archivos principales:

- `apps/backend/producer/bsc/src/app/cron/cron.service.ts`
- `apps/backend/producer/tron/src/app/cron/cron.service.ts`
- `apps/backend/consumer/src/app/app.service.ts`
- `libs/shared/backend/senders/src/lib/senders-manager.ts`
- `libs/shared/backend/api-calls/src/lib/shared-backend-api-calls.ts`

Flujo:

1. El producer instancia contratos de bridge, marketplace, points, staking, NFT y breeding.
2. Registra listeners `contract.on(...)`.
3. Cada evento se normaliza como `ProcessedEvent`.
4. El evento se envia a `processedEventsQueue` en Redis/Bull.
5. El producer tambien intenta persistir el evento en GraphQL con `createEvent`.
6. El consumer ejecuta `SendersManager.selectSender(event)`.
7. El sender llama mutaciones GraphQL que alteran `cukies`, `tx_nfts`, `tx_points`, etc.
8. Al final se crea un `completedEvent`.

Punto importante: el producer hace `queue.add()` antes de `createEvent()`. Si Redis acepta el job pero GraphQL falla, el evento puede mutar Mongo sin quedar guardado como evento raw en `processedEvents`.

### Sync/backfill: getters + setter

Archivos principales:

- `apps/backend/sync/bsc/getter.js`
- `apps/backend/sync/tron/getter.js`
- `apps/backend/sync/setter.js`
- `apps/backend/sync/events/*.js`

Flujo:

1. BSC consulta `queryFilter` por contrato/evento y avanza `settings.lastProcessedBlock`.
2. TRON consulta API de eventos con `only_confirmed=true`, `event_name`, `limit=200` y `min_block_timestamp`.
3. Ambos insertan eventos en `processedEvents` con `_id = txHash + "_" + logIndex/eventIndex`.
4. `setter.js` busca eventos con `processed != true`, los marca como `processing`, ejecuta un handler directo y marca `processed=true`.

Punto importante: `setter.js` no hace lock atomico. Si hay dos setters vivos, ambos pueden seleccionar el mismo lote y ejecutar efectos duplicados. Algunos handlers tienen proteccion parcial contra duplicados; otros no.

## Contratos y eventos monitorizados

| Area | Eventos |
| --- | --- |
| Bridge | `JumpInBridge`, `JumpOutBridge` |
| Marketplace | `TokenOnSale`, `TokenBought`, `MarketTokenSaleCancelled`, `MarketTokenPriceChanged` |
| Points | `Mint`, `Burn` |
| Staking | `Stake`, `Unstake` |
| NFT | `Transfer` |
| Breeding | `BreedStart`, `BreedFinish` |

Colecciones principales:

- `processedEvents`: evento normalizado/raw.
- `completedEvents`: marca de evento procesado por el consumer.
- `settings`: cursor legacy por contrato/evento.
- `blockTimestamps`: cache de timestamp de bloque BSC.
- `cukies`: vista materializada principal.
- `tx_nfts`: historial NFT.
- `points` y `tx_points`: historial de puntos.

## Efectos por evento

| Evento | Efecto esperado en Mongo |
| --- | --- |
| `Transfer` | Mint original crea `cuki`; transfer normal cambia owner y crea tx tipo `Gift`; ignora contratos especiales. |
| `TokenOnSale` | Pone `state=onSale`, guarda precio normalizado y precio original. |
| `TokenBought` | Cambia owner, pone `state=available`, limpia precio y crea tx tipo `Buy`. |
| `MarketTokenPriceChanged` | Deberia actualizar precio y mantener `state=onSale`. |
| `MarketTokenSaleCancelled` | Pone `state=available`, `price=0` y registra cancelacion. |
| `Stake` | Pone `state=staking`. |
| `Unstake` | Pone `state=available`; el evento trae `points`, pero no queda bien proyectado en todos los caminos. |
| `Mint` | Inserta puntos positivos en `points` y `tx_points`. |
| `Burn` | Inserta puntos negativos tipo `Breeding`. |
| `BreedStart` | Pone ambos padres en `state=breeding`. |
| `BreedFinish` | Crea/actualiza hijo, crea tx `Breed`, enlaza hijo a padres y libera padres. |
| `JumpInBridge` | Pone `state=inBridge`, crea tx `Bridge` y en algunos caminos intenta disparar `jumpOutBridge` en BSC. |
| `JumpOutBridge` | Pone `state=available`, cambia owner/red y crea tx `Bridge`. |

## Hallazgos criticos

### 1. No hay una unica fuente de verdad del procesamiento

Hay logica duplicada entre:

- `libs/shared/backend/senders/src/lib/senders/*.ts`
- `apps/backend/sync/events/*.js`

Los dos caminos no hacen exactamente lo mismo. Por ejemplo, el handler directo de `MarketTokenPriceChanged` esta practicamente vacio, mientras el sender intenta actualizar precio.

### 2. `JumpInBridge` no se procesa bien en producers live

En los producers BSC/TRON, `processJumpInBridgeEvent` solo hace `console.log`; no llama a `injectEvent`. En el getter BSC, `JumpInBridge` aparece comentado. Esto implica que parte del flujo de entrada al bridge depende del getter TRON/sync o de caminos manuales.

### 3. `MarketTokenPriceChanged` tiene bug de shape

Los producers guardan `data.newPrice` y `data.newFee`. El sender legacy mira `event.data.price` para actualizar precio. El handler directo no implementa la actualizacion. Resultado probable: cambios de precio no se reflejan de forma fiable.

### 4. `BreedFinish` cambia de shape segun el camino

El evento on-chain tiene `result`; algunos normalizadores lo guardan como `tokenId`, otros handlers esperan `result`. Esto fuerza logica defensiva y puede romper replays si no se unifica.

### 5. Idempotencia incompleta

Hay checks de duplicado en algunos `tx_nfts` y `tx_points`, pero no en todos:

- `Burn` inserta en `points` sin check previo.
- `JumpInBridge` inserta en `tx_nfts` sin check previo.
- `MarketTokenSaleCancelled` inserta transaccion sin una clave idempotente clara.
- `completedEvents` se crea al final, separado de los efectos de dominio.

Si un proceso cae despues de mutar `cukies` pero antes de marcar completion, un replay puede duplicar historial o puntos.

### 6. Timestamps inconsistentes

Algunos caminos guardan milisegundos; los handlers de sync convierten con `parseInt(timeStamp) / 1000` y luego guardan segundos. La UI actual ya tiene normalizadores para compensarlo. En el sistema nuevo debe haber una sola convencion: `timestampMs`.

### 7. Direcciones TRON/BSC inconsistentes

Hay mezcla de:

- TRON hex.
- TRON base58.
- Direcciones en lowercase.
- BSC checksum/lowercase.

La nueva capa debe guardar ambos formatos cuando aplique: `addressRaw`, `addressNormalized`, `chainAddress`.

### 8. Reorgs y confirmaciones insuficientes

Los listeners live procesan eventos inmediatamente. BSC backfill no espera confirmaciones ni guarda `blockHash`. TRON usa `only_confirmed=true`, pero el checkpoint por timestamp con `limit=200` necesita paginacion robusta.

### 9. Cursor TRON fragil

El getter TRON usa `min_block_timestamp` y `limit=200`. Si hay mas de 200 eventos en la misma ventana o mismo timestamp, puede duplicar, retrasarse o quedarse procesando la misma pagina si la API devuelve siempre el mismo subconjunto.

### 10. Secretos y claves privadas en legacy

Hay secretos, tokens, claves API y claves privadas hardcodeadas en codigo/config legacy. No deben migrarse. Antes de activar cualquier worker nuevo hay que rotar credenciales y usar variables de entorno gestionadas.

## Diseno recomendado para `cukies-hub`

### Estructura propuesta

Crear un paquete/app worker propio, no meter el tracking dentro de rutas Next.js:

```text
packages/chain-indexer/
  src/
    chains/
      bsc.ts
      tron.ts
    config/
      contracts.ts
      events.ts
    ingest/
      poller.ts
      cursors.ts
      normalize.ts
    projectors/
      cuki-projector.ts
      points-projector.ts
      marketplace-projector.ts
      bridge-projector.ts
    replay/
      backfill.ts
      replay.ts
      reconcile.ts
    storage/
      mongo.ts
      collections.ts
    cli.ts
```

Se puede exponer con scripts `pnpm --filter @cukies/chain-indexer dev`, `backfill`, `project`, `reconcile`.

### Estado implementado en `cukies-hub`

Se ha creado una primera vertical operativa en:

- `packages/chain-indexer`: ingesta BSC/TRON, event store Mongo, cursors y projectors.
- `dapp/src/app/(app)/indexer/page.tsx`: viewer interno para inspeccionar la base nueva.
- `dapp/src/lib/indexer-db/mongodb.ts`: conexion del viewer a `cukieshub-new`.

Scripts disponibles desde raiz:

```bash
pnpm indexer:setup
pnpm indexer:ingest
pnpm indexer:import:legacy
pnpm indexer:project
pnpm indexer:status
pnpm indexer:dev
```

La base nueva por defecto es `cukieshub-new`. El indexer usa `CHAIN_INDEXER_MONGO_URL` o, si no existe, `DATABASE_URL`.

Nota operativa: BSC arranca en modo live por defecto (`CHAIN_INDEXER_START_BSC_BLOCK=0`) porque los RPC publicos normales no permiten backfill historico fiable de logs antiguos. Para reconstruir BSC desde el bloque legacy (`16906879`) hay que configurar un archive RPC o una API de logs dedicada. TRON puede backfillear por TronGrid, pero sin `TRON_API_KEY` se respeta rate limit y avanza por tandas.

Tambien existe `pnpm indexer:import:legacy`, que importa `processedEvents` desde `CUKIES_DATABASE_URL` hacia `chain_events` y permite sembrar la nueva base con historico legacy sin depender de rate limits de scan/RPC.

### Modelo de datos minimo

Coleccion `chain_events`:

```ts
{
  _id: "BSC:0x...:TokenBought:0xTx:12",
  chain: "BSC" | "TRON",
  contractAlias: "MARKETPLACE" | "TOKEN" | "BRIDGE" | "...",
  contractAddress: string,
  eventName: string,
  txHash: string,
  logIndex: number,
  blockNumber: number,
  blockHash?: string,
  timestampMs: number,
  args: object,
  normalized: object,
  status: "ingested" | "projecting" | "projected" | "failed" | "ignored",
  attempts: number,
  lastError?: string,
  schemaVersion: 1,
  createdAt: Date,
  updatedAt: Date
}
```

Indices obligatorios:

- unique `_id`
- `{ chain: 1, blockNumber: 1, logIndex: 1 }`
- `{ status: 1, blockNumber: 1, logIndex: 1 }`
- `{ eventName: 1, "normalized.tokenId": 1, timestampMs: -1 }`

Coleccion `chain_cursors`:

```ts
{
  _id: "BSC:MARKETPLACE:TokenBought",
  chain: "BSC" | "TRON",
  contractAlias: string,
  eventName: string,
  nextBlock?: number,
  nextTimestampMs?: number,
  pageToken?: string,
  safeBlock?: number,
  updatedAt: Date
}
```

Colecciones de lectura:

- `cukies`
- `tx_nfts`
- `points` / `tx_points` o una unica `point_transactions`
- `indexer_runs`
- `indexer_dead_letters`

### Pipeline nuevo

1. **Poller confirmado**  
   Lee por rangos seguros. BSC: `getLogs`/`viem` con `confirmations`. TRON: endpoint de eventos con paginacion completa y `only_confirmed`.

2. **Upsert raw event**  
   Guarda evento con `_id` determinista. Si ya existe, no pasa nada.

3. **Projector ordenado**  
   Procesa `chain_events.status=ingested` ordenado por `chain`, `blockNumber`, `logIndex`.

4. **Lock atomico**  
   `findOneAndUpdate({ status: "ingested" }, { $set: { status: "projecting" }})`.

5. **Efectos idempotentes**  
   Cada escritura usa claves deterministas:
   - `tx_nfts._id = chain:txHash:logIndex:effect`
   - `point_transactions._id = chain:txHash:logIndex`
   - historial con `$addToSet`
   - estado de Cuki solo avanza si `event.timestampMs >= cuki.lastEventTimestampMs`

6. **Completion atomico por evento**  
   El evento pasa a `projected` solo despues de completar efectos. Si falla, queda `failed` con `attempts` y se reintenta.

7. **Reconciliacion**  
   Jobs periodicos verifican owner/state de tokens importantes contra on-chain y generan alertas o reparaciones.

### Regla clave

La UI nunca debe depender de listeners live. La UI lee Mongo. El indexer puede estar unos segundos por detras, pero debe ser recuperable con replay.

## Mapeo de eventos para el nuevo projector

### NFT/ownership

- `Transfer`
  - Mint original: crear Cuki si no existe.
  - Transfer normal: actualizar owner y crear tx `Gift`.
  - Transfer desde/hacia contratos internos: normalmente ignorar como cambio visible, salvo bridge.

### Marketplace

- `TokenOnSale`: `state=onSale`, `price`, `priceOriginal`.
- `TokenBought`: owner nuevo, `state=available`, `price=0`, tx `Buy`.
- `MarketTokenPriceChanged`: usar `newPrice`, no `price`.
- `MarketTokenSaleCancelled`: `state=available`, `price=0`, tx `CancelSale`.

### Points

- `Mint`: puntos positivos.
- `Burn`: puntos negativos tipo breeding.
- `Unstake`: revisar si los puntos emitidos por unstake deben generar transaccion de puntos; el legacy no es consistente aqui.

### Breeding

- `BreedStart`: padres a `breeding`.
- `BreedFinish`: crear hijo, crear tx, enlazar padres, liberar padres.
- Normalizar siempre `result` como `tokenId` en `normalized`.

### Bridge

- `JumpInBridge`: `state=inBridge`, tx `Bridge`.
- `JumpOutBridge`: owner/red final, `state=available`, tx `Bridge`.
- Cualquier transaccion firmada por backend para `jumpOutBridge` debe estar en un worker separado de tipo executor, no en el indexer de lectura.

## Decisiones pendientes

1. Si la nueva base de datos canonica sera `cukies-hub` o si se seguira leyendo `cukies` legacy durante una fase de transicion.
2. Si `points` y `tx_points` se mantienen por compatibilidad o se consolidan en una coleccion nueva.
3. Cuantos bloques de confirmacion usar en BSC.
4. Como paginar TRON de forma oficial y estable en produccion.
5. Si el bridge backend debe ejecutar `jumpOutBridge` automaticamente o quedar como operacion controlada/manual.
6. Si los Cukies legacy se migran una vez por snapshot o se reconstruyen 100% desde eventos.

## Plan de migracion recomendado

1. **Rotar secretos legacy** antes de desplegar nada basado en este codigo.
2. Crear `@cukies/chain-indexer` con configuracion de contratos, ABIs y normalizadores.
3. Implementar `chain_events` y `chain_cursors` en Mongo.
4. Backfill historico en entorno local/staging sin tocar `cukies` de produccion.
5. Implementar projectors con fixtures reales de `processedEvents`.
6. Comparar estado reconstruido contra Mongo legacy: owners, estados, precios, puntos, hijos, historial.
7. Cambiar endpoints actuales de `legacy-marketplace` para leer del nuevo store cuando este completo.
8. Activar pollers live con confirmaciones y monitorizacion.
9. Mantener reconciliacion diaria hasta que el delta sea cero de forma sostenida.

## Criterios de aceptacion

- Un replay desde cero reconstruye el mismo estado de `cukies` para una muestra representativa.
- Reejecutar el mismo rango de bloques no duplica `tx_nfts`, puntos ni historial.
- Si el proceso cae a mitad de un evento, el retry deja el estado correcto.
- Todos los eventos tienen `_id` determinista y cursor recuperable.
- No hay claves privadas, tokens ni URLs secretas hardcodeadas.
- La UI sigue funcionando leyendo Mongo aunque los pollers esten pausados.
- Hay comandos de backfill, replay de un evento, replay de rango y reconciliacion.
