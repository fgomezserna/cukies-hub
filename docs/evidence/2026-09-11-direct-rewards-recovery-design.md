# #418 — diseño de recuperación de cinco rewards históricos (solo diseño)

**Alcance.** Staging BSC Testnet 97, `cukieshub-new-staging`, ciclo de 1.800 s. No se modifica repo, Mongo, reloj, regla, periodo, gate, contrato, saldo, firma ni publicación. Diseño contrastado contra `03de2a7030aad3dbcf3f5bb5fd36fbbb5b84490e`; los archivos de rewards conservan la versión de `31e558cb97e858a398d4d212458213fca495ad6a`. El censo RO del 11-09 07:35:36 UTC precede al despliegue de web `03de2a7`. La lista y la regla proceden de `docs/evidence/2026-09-11-direct-rewards-readiness.json`.

## Resumen (≤300 palabras)

La ruta vigente sí puede liquidar una fuente mientras la reserva presupuestaria devuelve `RESERVED`: `loadSettlementRewardSnapshot` valida la sesión, la reserva de crédito, el Cukie y la regla; el coordinador calcula y `persistAllocationSet` escribe manifest, allocations, accruals y el evento canónico de presupuesto en una transacción. No existe una ruta canónica para aplicar una reserva cuando el decisor devuelve `DAY_CLOSED`. El censo final, sin embargo, muestra `budget state/day/events=0`: ese motivo para S1/S2 fue una evaluación RO y no un evento bloqueado persistido.

La extensión mínima para el lote exacto de cinco es una operación interna HMAC, de un solo source y con plan hash, que vuelva a ejecutar el coordinador y el decisor con el reloj real. Si el motivo actual es `RESERVED`, usa la ruta normal; si es exactamente `DAY_CLOSED`, permite una reserva en la misma colección/evento canónico mediante metadata `operatorRecovery` (caso, aprobación, plan hash y motivo original). No añade otra colección, ledger ni capa Merkle. Cualquier evento existente incompatible se rechaza y nunca se reescribe.

Los cinco IDs forman dos periodos: S1/S2 en `C1800-W:2026-09-08T12:00:00.000Z` y S3–S5 en `C1800-W:2026-09-10T09:30:00.000Z`; el sexto (`ceff…0839`, score 0) queda fuera. `seal_period` y `createDraft` pueden producir proofs tras reconciliar manifests y eventos canónicos, pero `createDraft` deja `previewOnly=true`, `publishAuthorized=false` y `signature=null`. El claim on-chain exige un batch publicado y evento BSC; la materialización diaria completa es un lote posterior.

## Fuentes exactas y cantidades esperadas

| ID | `sessionId` / `sourceId` canónico | Periodo | Crédito / fuente NFT | Score | Allocation jugador esperada* |
|---|---|---|---|---:|---:|
| S1 | `game-session:412dfbfccef619e0452992c9f181907915257d3aeb7998f21524a3164e8db7f9` / `game-session:game-session:412dfbfccef619e0452992c9f181907915257d3aeb7998f21524a3164e8db7f9` | `C1800-W:2026-09-08T12:00:00.000Z` | `own` / `seiku` | 43 | 0.05375 UKI |
| S2 | `game-session:5024d0013ce78a516fbdc2445e0aa7f7c38e8ccd4c6f57512cfd18f709840a52` / `game-session:game-session:5024d0013ce78a516fbdc2445e0aa7f7c38e8ccd4c6f57512cfd18f709840a52` | `C1800-W:2026-09-08T12:00:00.000Z` | `own` / `seiku` | 2 | 0.00250 UKI |
| S3 | `game-session:e29ec49ed3fb1bac136731be3340e6c5ff3d6776ebc9344e61681b5efedbb6d4` / `game-session:game-session:e29ec49ed3fb1bac136731be3340e6c5ff3d6776ebc9344e61681b5efedbb6d4` | `C1800-W:2026-09-10T09:30:00.000Z` | `own` / `pool_original` | 6 | 0.00750 UKI |
| S4 | `game-session:9864a7d4ebe69efc09b167354b00d9ece218507df3a4300eb4f375b00d3ea3df` / `game-session:game-session:9864a7d4ebe69efc09b167354b00d9ece218507df3a4300eb4f375b00d3ea3df` | `C1800-W:2026-09-10T09:30:00.000Z` | `own` / `pool_original` | 117 | 0.14625 UKI |
| S5 | `game-session:ef7bf6f01a00306f067284ad2ab627682eef6e7511c4b63ee5e2c7371be87ca3` / `game-session:game-session:ef7bf6f01a00306f067284ad2ab627682eef6e7511c4b63ee5e2c7371be87ca3` | `C1800-W:2026-09-10T09:30:00.000Z` | `own` / `pool_original` | 6 | 0.00750 UKI |

\* Inferencia determinista de la regla activa, no crédito persistido. Cada source reserva `10 UKI` (`10000000000000000000` raw); total de los cinco: `50 UKI`. Jugador: `0.21750 UKI`; Cukie Pool: `0.16125 UKI` para los tres `pool_original`; reserve weekly nominal: `10 UKI`; reserve ambassador nominal: `2.5 UKI`, sujeto a sus snapshots. Los `seiku` no se convierten en accrual Pool. El sourceSetHash, calculation hashes y cantidades finales deben salir del calculador canónico, nunca de esta tabla.

Regla a conservar literalmente: `rewards-staging-cycle-v1`, config hash `7c7a816ebbafebf0b58dcf10424a562ae0eb915a1591e28a99f570efbfbb307f`, activa desde `2026-09-07T11:30:00Z`; calendario `cycle-v1`, chain 97, 1.800 s, anchor `2026-09-07T11:30:00Z`; `dailyCapRaw=500000000000000000000000` (500.000 UKI), `lifetimeCapRaw=450000000000000000000000000` (450.000.000 UKI), `lateReservationGraceSeconds=86400`, `unusedDailyCapacity=materialize_undistributed`, `overflowPolicy=block`.

## Vía actual y extensión mínima

### Lo que ya es canónico

1. Para cada ID se invoca internamente `loadSettlementRewardSnapshot` y se vuelve a ejecutar `calculateSettlementRewardAllocations`. Se comparan sesión `settled`, `settlementCommand`, reserva de crédito consumida, evidencia de crédito/Cukie, `resultHash`, calendario, regla y config hash.
2. Si el presupuesto puro resulta `RESERVED`, se usa el comando existente `settle_game` con payload exacto `{sessionId, periodId, expectedRuleVersion}`. La transacción existente crea un único manifest `_id=sourceId`, allocations/accruals y el evento de presupuesto; el replay exige los mismos hashes.
3. El source no se procesa si ya tiene manifest, allocation, accrual, incidente abierto, sello o un evento incompatible. El censo completo del periodo debe coincidir exactamente con `{S1,S2}` o `{S3,S4,S5}` antes del sello; el candidato `ceff2ddbd6c414bad952287bb0927f87fb0a7d2a092dad51439aee5821330839` y su periodo `C1800-W:2026-09-10T06:00:00.000Z` permanecen fuera.

### Excepción operatoria para `DAY_CLOSED`

El snapshot final reporta `budget state/day/events=0`: no hay un bloqueado que conservar ni que emparejar. `DAY_CLOSED` por sí solo en una evaluación RO no autoriza una arquitectura nueva; la operación debe volver a calcular el motivo con tiempo real. La excepción no cambia `now`, `lateReservationGraceSeconds`, `dayId`, `ruleEffectiveAt`, regla, periodo ni evento existente. Propongo:

1. Añadir un comando HMAC separado, por ejemplo `recover_late_settlement`, con claves exactas `{sessionId, periodId, expectedRuleVersion, recoveryCaseId, approvalId, planHash}`. Solo acepta uno de los cinco IDs, el plan aprobado y un source por transacción; scheduler y publisher no lo llaman. `approvalId` y `approvedBy` son metadatos, no autorización por sí mismos: el servidor debe validar un plan aprobado fuera del payload de la solicitud, vinculado al entorno, los IDs, la regla, los hashes y el límite de importes.
2. En la misma transacción ejecutar snapshot y cálculo canónicos y llamar al decisor normal con reloj real. `RESERVED` sigue la ruta normal. Solo `DAY_CLOSED` puede usar el plan; cap, futuro, regla, binding o cualquier otro motivo detienen la operación. Si aparece un evento existente, solo se acepta un replay con el mismo plan y hashes; cualquier bloqueado/reservado incompatible se rechaza sin mutarlo.
3. Cuando no exista evento, insertar **un único** `RewardEmissionBudgetEvent` en la colección canónica, con `reason=RESERVED` para conservar los validadores existentes y un campo opcional `operatorRecovery={recoveryCaseId, approvalId, planHash, originalReason:DAY_CLOSED, approvedAt, approvedBy}`. La implementación debe incluir esa metadata en el payload hash canónico. Estado y día se actualizan atómicamente con revisiones esperadas y los mismos caps; no se crea `reward_emission_budget_recoveries`. Con el snapshot actual y sin nuevas fuentes, las reservas del lote sumarían `20 UKI` el 8-Sep y `30 UKI` el 10-Sep (50 UKI total), pero cada transacción reserva solo sus `10 UKI` y debe comprobar de nuevo los contadores.
4. Reutilizar `persistAllocationSet` después de esa reserva efectiva para escribir manifests, allocations y accruals. La implementación debe consumir la reserva en la misma transacción o evitar una segunda reserva; no se escriben allocations manuales. La idempotencia se decide por `sourceId`, plan hash, sourceSetHash y hashes de cálculo; cualquier drift devuelve conflicto sin pagar.
5. Ajustar solo el tipo/validador y el cálculo de payload hash del evento para exigir metadata y autorización cuando `originalReason=DAY_CLOSED`. `assertPeriodSourceManifests`, `validatePeriodAllocationSet` y `buildRewardPeriodAllocationHash` siguen usando el evento canónico: su `payloadHash` entra en el hash del periodo. No se añade una pareja bloqueado+recovery ni una rama Merkle nueva; el sello conserva censo y hashes exactos.

Esta vía respeta la inmutabilidad del `RewardEmissionBudgetEvent`: mutar `status/reason/payloadHash`, insertar allocations directamente o reservar otro día siguen siendo caminos rechazados.

### Decisión de arquitectura

Con cero eventos presupuestarios persistidos, se propone un plan aprobado y metadata opcional en el evento canónico, conservando sus contadores y hashes. No se justifica añadir una segunda colección de cobertura. Si antes de aplicar aparece cualquier evento incompatible, se cierra en falso y se pide un diseño revisado; no se decide por un `DAY_CLOSED` observado únicamente en RO.

### Mínimos verificados y límites

- **Verificado:** evidencia final con state/day/events=0; caps y gracia de la regla; funciones canónicas de snapshot, cálculo, reserva, sello y hash; `createDraft` devuelve `status=draft`, `previewOnly=true`, `publishAuthorized=false`, `signature=null`.
- **Propuesto, no verificado en runtime:** comando/plan `recover_late_settlement`, metadata `operatorRecovery`, cambios de tipos/validador y su idempotencia. No se ejecutó pipeline canónico, no se escribió DB y no se validó el publisher, la firma, el broadcast ni que exista un camino directo desde el draft al claim.

## Secuencia hasta el claim

1. **Plan offline.** Generar un JSON sin secretos con `recoveryCaseId`, `planHash`, los cinco IDs, sus dos periodos, regla/config hash, `sourceTotalRaw=10e18`, hashes de evidencia disponibles y la exclusión del sexto. Requiere aprobación explícita de raíz antes de cualquier escritura.
2. **Preflight por source.** Ejecutar funciones puras/canónicas; comprobar que los periodos siguen `open`, `allocationRevision=0`, sin seals/incidentes y que el censo completo del periodo es exacto. Guardar los hashes de cada salida; no tocar #414 ni OWN NFT.
3. **Settlement acotado.** Ejecutar `settle_game` solo si el presupuesto sigue `RESERVED`; para cada `DAY_CLOSED`, usar exclusivamente `recover_late_settlement` con el plan aprobado. Una operación por source, orden determinista S1→S5, transacción y replay verificable. Mantener `GAME_ECONOMY_RUNTIME_ENABLED=false` y todos los `REWARD_*` false.
4. **Reconciliación.** Leer manifests, allocations, accruals, eventos canónicos (incluida la metadata `operatorRecovery` cuando aplique) y sus hashes por source. Esperar cinco manifests `allocated`, una cobertura presupuestaria efectiva por source y cero incidentes. No incluir el sexto candidato ni ninguna otra fuente.
5. **Sello por periodo.** Calcular `expectedPeriodAllocationHash` con la función canónica sobre **todos** los artefactos del periodo y usar `seal_period` por separado para los dos periodos, con `expectedSourceIds` exactos. No sellar si el censo descubre otra sesión, si existe un evento bloqueado o incompatible, o si el hash no coincide.
6. **Draft y proofs.** Usar `createDraft` por periodo con la identidad BSC configurada y el hash del sello. El resultado debe quedar `status=draft`, `previewOnly=true`, `publishAuthorized=false`, `signature=null`; comprobar proofs y que la wallet del jugador tiene el amount esperado. No confundir draft con cobro.
7. **Publicación/claim posterior.** La revisión raíz del preparer confirma que lee `reward_accounting_allocations` y exige un `reward_daily_accounting` o `reward_weekly_prize_accounting` sellado. El publisher consume `reward_publication_plans`, no cualquier draft creado por `createDraft`. Por tanto, los pasos de sello/draft anteriores solo preparan evidencia; no resuelven el cobro. Antes de implementar el apply se debe preparar el cierre contable canónico y su censo completo, calcular efectos de capacidad no utilizada, tesorería, marketing y burn, y obtener un plan de publicación reproducible. Después: preflight on-chain, financiación del operador y publisher aislado, firma/broadcast, proyección de batch publicado, proofs y `chain_event`. Mantener `REWARD_BATCH_PUBLISHER_ENABLED=false` durante este diseño.

## Efectos contables y límites

| Efecto | Importe/condición | Tratamiento en #418 |
|---|---:|---|
| Allocation jugador de las cinco | 0.21750 UKI esperado | Importe esperado del jugador; su inclusión en un proof/publicación requiere validación del recorrido final. |
| Accrual Cukie Pool | 0.16125 UKI esperado | Tres `pool_original`; no mezclar con el claim del jugador. |
| Reserva weekly | 10 UKI nominal | Queda en accrual/accounting hasta el cierre weekly. |
| Reserva ambassador | 2.5 UKI nominal | Se decide con snapshots; S1/S2 no tienen wallet ambassador según evidencia. |
| Reserva presupuestaria | 50 UKI raw total | Revisión atómica por dos días; no rebasa los caps actuales. |
| Capacidad diaria materializada | `dailyCapRaw=500.000 UKI` y `lifetimeCapRaw=450.000.000 UKI`; dos días llenados nominalmente: `1.000.000 UKI` | Es compatible con el lifetime actual, no un bloqueo. Las reservas de las cinco (`50 UKI`) quedan dentro de esos caps; capacidad residual teórica `999.950 UKI` si no aparecen otras fuentes. No ejecutar `closeNextDaily` como parte de esta recuperación: su censo global y accounting requieren otro lote. |

El código permite preparar un sello y un draft sin ejecutar `closeNextDaily`/`closeWeeklyPeriod`: `RewardPeriodSealService` exige manifests, eventos canónicos válidos y periodo terminado, y `RewardClaimBatchService.createDraft` exige el sello. Esto no acredita un camino directo hasta el publisher operativo; hay que contrastar sus gates y el preparer antes de autorizar publicación o presentar premios cobrables. El accounting diario/semanal y la materialización de capacidad deben permanecer como un lote posterior con su propio preflight de todas las fuentes; habilitar sus gates durante #418 ampliaría el alcance.

## Archivos y guardas para una implementación futura

| Área | Cambio acotado | Guardas obligatorias |
|---|---|---|
| `rewards/types.ts`, `emission-budget.ts` | Campo opcional `operatorRecovery` y su inclusión en el payload hash del evento canónico; sin colección ni índice nuevos | Metadata obligatoria y estable para `originalReason=DAY_CLOSED`; el hash cambia de forma determinista. |
| `rewards/emission-budget.ts`, `repository.ts` | Rama de reserva explícita con plan y revisiones state/day sobre el ledger existente | Solo `DAY_CLOSED` autorizado; caps; mismo día histórico; reloj real; rechazar cualquier evento incompatible. |
| `rewards/coordinator.ts`, `service.ts` | Método explícito que reutiliza snapshot/calculador/persistencia | Allowlist de cinco, planHash, sourceSetHash y hashes de cálculo; cero artifacts previos; idempotencia. |
| `rewards/internal-command.ts`, `api/.../commands/route.ts` | Parser/dispatch `recover_late_settlement` | HMAC, nonce, case/approval, un source por request; gates no se leen como autorización. |
| `rewards/merkle.ts` | Mantener hash de payload/evento y hash de periodo existentes; sin nueva rama Merkle | Sin duplicados/ocultación; sello y draft solo con censo canónico exacto. |
| Operación/validación | Plan JSON y RO postflight; tests puros antes de apply | Rechazar sexto source, caps, drift, incidentes, seals y accounting global. |

No se propone editar `game_economy_sessions`, `reward_weekly_game_sources`, reservas de créditos, asignaciones NFT, la regla activa, cierres históricos ni el publisher. La publicación y cualquier firma quedan fuera de esta entrega de diseño.

## Inferencias y evidencias

- Confirmado por código: la ruta normal termina en `settlePendingTreasureHuntRewards → rewardCalculationCoordinator.settleGame`; el gate runtime está OFF y `DAY_CLOSED` se calcula contra `reservationClosesAt`, no contra el inicio del periodo.
- Confirmado por la evidencia final: `budget state/day/events=0`; por ello el `DAY_CLOSED` de S1/S2 fue solo una evaluación RO, no un evento persistido. También están confirmados `dailyCap=500.000 UKI` y `lifetimeCap=450.000.000 UKI`.
- Inferido de la regla y pesos: importes de la tabla y `50 UKI` de source totals; no son balances, claims ni cobros. Los `1.000.000 UKI` de dos cierres son una proyección de materialización, no una escritura ejecutada.
- Propuesto, no implementado ni probado: comando HMAC, metadata `operatorRecovery`, guardas de plan e idempotencia. `createDraft` y sus flags `previewOnly` sí fueron leídos; publisher, firma, broadcast y claim real no fueron validados.
- Evidencia principal: `docs/evidence/2026-09-11-direct-rewards-readiness.json`; issue: [#418](https://github.com/fgomezserna/cukies-hub/issues/418). No se hicieron nuevas lecturas remotas de datos ni escrituras en este tramo.

## Revisión raíz del recorrido de publicación

`dapp/scripts/lib/reward-publication-preparer.mjs:53` selecciona asignaciones contables vencidas y construye artefactos desde el cierre sellado; `dapp/scripts/lib/reward-batch-publication.mjs:466` rechaza cierres inexistentes/no sellados o reglas desalineadas. `dapp/scripts/reward-batch-publisher.mjs:178` toma un plan operativo o ejecuta ese preparer. El diseño de excepción de reserva puede servir como base de implementación, pero no queda aprobado para aplicar ni publicar hasta concretar el cierre y las salidas contables. No se propone insertar un plan de publicación artificial para omitir esas validaciones.
