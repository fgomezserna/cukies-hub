# Disponibilidad de Cukies propios: revisión de alcance

Fecha: 2026-09-11. Código comprobado: `cb39b5575a38fe2ee91e388caffbc3a09282a0a6`; base de seguimiento `e4b158bb809e5bcf355a95fba5f0df13d13ce416`.
Estado y decisión pendiente: fila 3 de [seguimiento](../antes-del-15-seguimiento.md); coordinación y propuesta revisable [#412](https://github.com/fgomezserna/cukies-hub/issues/412), vinculada a #92/#93. Este documento es evidencia, no una nueva regla aprobada.

## Evidencia

- `docs/uki-current-operating-rules.md:349-427` define Pool de Cukies; la matriz diaria Original 2/4/6/8/10/12 y segunda generación 1/2/3/4/5/6 está bajo esa sección. OWN, líneas 621–627, fija elegibilidad y fallback, sin definir explícitamente cadencia o reinicio al transferir.
- Fuente contrastada: `/Users/fgomezserna/Downloads/cukies-world-brief-codex-v2.docx`, SHA-256 `78ccd5cbba44876ba36023fc8b4a26c295fbc33869fead18d5ba0b6311d33c85`. P164–185 corresponde a Pool y su matriz; P199–205 trata Cukies propios con partidas disponibles. No acredita extender sin decisión la regla del Pool.
- `dapp/src/lib/uki-economy/own-cukie/types.ts:16-39` y `service.ts:378-410`: cuota acumulada por `ownershipEventId`, sin periodo. `dapp/__tests__/lib/own-cukie-selection.test.ts:452-501` conserva ese comportamiento.
- La lectura de colección no expone cuota diaria propia. La elegibilidad actual excluye Master, Pool, venta, bridge, otra partida y estado desconocido (`own-cukie/rules.ts:81-115`).
- Añadir solo `epochId + periodId` podría reiniciar usos al transferir y devolver el NFT. La propuesta por confirmar usa identidad estable `assetId + periodId` para usos y mantiene separada la identidad de propiedad para autorizar la reserva.

## Propuesta lista para decidir

Aplicar a OWN la misma matriz de rareza/generación del Pool y renovarla al corte económico vigente; la cuota no se acumula y acompaña al NFT durante todo el periodo, aunque cambie de propietario. Mostrar antes de jugar los usos propios restantes, los Cukies elegibles y la próxima renovación, separados de créditos y del fallback al Pool/Seiku. Las cifras completas y criterios están en #412.

Después de confirmar: contador diario separado con índice único, CAS e idempotencia; periodo inmutable en cada reserva; una partida activa por NFT; liberación o consumo según el resultado ya definido. Activación versionada desde un corte futuro y compatibilidad con reservas previas, sin modificar históricos. Tests de concurrencia, replay, corte, release/consume, exclusión, transferencia y retorno; API privada y estados desconocidos sin ceros falsos. Esto no impone un límite global a partidas con créditos propios.

## Límites de la comprobación

Solo lectura de código/documentos y metadatos operativos. Web32 mantiene `ECONOMY_CYCLE_SECONDS=1800`; gates game-economy, weekly-ranking, accounting, payout, pool-tranches y publisher continúan `false`. Diez workers running/sin reinicios no acreditan liquidación de rewards. No se modificaron contratos, calendarios, saldos, sesiones, periodos ni gates. Producción permanece separada y el cambio de 30 a 15 minutos está cancelado.
