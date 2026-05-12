# UKI technical disclaimers

Estado: borrador operativo.
Issue: #25 `UKI-003.2`.
Legal status: `needs-legal-validation`.
Fecha: 2026-05-12.

## Objetivo

Este documento define textos cortos para UI de preventa, vesting, staking, rewards, pools y claims. Los textos permiten implementar pantallas sin prometer rentabilidad, retorno garantizado ni resultados economicos no aprobados.

Todos los textos de este documento deben mostrarse o tratarse internamente como `needs-legal-validation` hasta revision legal/producto.

## Reglas de uso

- Usar lenguaje tecnico y descriptivo.
- Evitar promesas de beneficio, rentabilidad, APR, yield o ingresos pasivos.
- Distinguir siempre entre datos estimados, pendientes, confirmados y claimable.
- No presentar rewards calculadas off-chain como tokens recibidos hasta que exista claim on-chain confirmado.
- No ocultar estados de vesting, bloqueo, fecha futura o chain incorrecta.

## Textos cortos por superficie

| Superficie | Texto UI | Estado |
| --- | --- | --- |
| Preventa cerrada | La preventa aun no esta abierta. Podras conectar tu wallet y revisar las condiciones antes de comprar. | `needs-legal-validation` |
| Preventa abierta | Compra UKI segun las reglas activas del contrato de preventa. Revisa red, precio, allowance y vesting antes de confirmar. | `needs-legal-validation` |
| Compra pendiente | Tu transaccion esta pendiente de confirmacion en BNB Smart Chain. El balance final se actualizara cuando la red confirme la operacion. | `needs-legal-validation` |
| Compra confirmada | Compra confirmada on-chain. El UKI comprado seguira el calendario de vesting definido por contrato. | `needs-legal-validation` |
| Precio/ratio | El ratio mostrado corresponde a la configuracion activa de preventa. La transaccion final depende del contrato y la confirmacion de red. | `needs-legal-validation` |
| Allowance ASM | Debes aprobar ASM antes de comprar UKI. La aprobacion solo autoriza al contrato a usar el importe indicado. | `needs-legal-validation` |
| Chain incorrecta | Esta accion requiere BNB Smart Chain. Cambia de red en tu wallet para continuar. | `needs-legal-validation` |
| Wallet desconectada | Conecta una wallet compatible para ver datos personales y ejecutar acciones on-chain. | `needs-legal-validation` |
| Vesting comprador | El UKI comprado se libera segun el calendario de vesting. Los importes pendientes no estan disponibles hasta su desbloqueo. | `needs-legal-validation` |
| Vesting equipo/tesoreria | Las asignaciones internas siguen calendarios de bloqueo definidos por contrato o politica aprobada. | `needs-legal-validation` |
| Staking UKI | El staking puede habilitar acceso o cupos dentro de Cukie Master. No garantiza resultados, recompensas ni ranking. | `needs-legal-validation` |
| Unstaking UKI | Retirar UKI puede afectar cupos, acceso o beneficios activos dentro de la economia Cukies. | `needs-legal-validation` |
| Cukie Master | Cukie Master usa reglas de elegibilidad basadas en UKI, NFTs y configuracion vigente. Las reglas pueden cambiar antes del lanzamiento final. | `needs-legal-validation` |
| NFT utility | La utilidad de un NFT depende de ownership, rareza, estado de marketplace/bridge y reglas activas de la dapp. | `needs-legal-validation` |
| Pool de Cukies | Aportar un Cukie al pool bloquea su uso en otras acciones mientras la posicion este activa. | `needs-legal-validation` |
| Pool de creditos | Los creditos del pool se asignan segun disponibilidad y reglas del periodo. No representan tokens ni saldo transferible. | `needs-legal-validation` |
| Creditos diarios | Los creditos son recursos internos de juego. Pueden expirar o cambiar segun reglas operativas publicadas. | `needs-legal-validation` |
| Rewards estimadas | Esta cifra es una estimacion calculada off-chain y puede cambiar antes del cierre del periodo. | `needs-legal-validation` |
| Rewards pendientes | Las rewards pendientes aun no estan disponibles para claim. Deben cerrarse, validarse y publicarse en un batch. | `needs-legal-validation` |
| Rewards claimable | Estas rewards tienen datos de claim preparados. La recepcion final depende de la transaccion y confirmacion on-chain. | `needs-legal-validation` |
| Claim pendiente | El claim esta pendiente de confirmacion. No cierres el seguimiento hasta que la red confirme la transaccion. | `needs-legal-validation` |
| Claim confirmado | Claim confirmado on-chain. El estado puede tardar unos minutos en reflejarse en la dapp. | `needs-legal-validation` |
| Ranking semanal | El ranking se calcula por periodo y puede requerir validacion de partidas, creditos y reglas antifraude. | `needs-legal-validation` |
| Score en revision | Tu resultado esta en revision tecnica antes de aplicarse a ranking o rewards. | `needs-legal-validation` |
| Datos sincronizando | Estamos sincronizando datos de wallet, NFTs o contratos. Algunas acciones pueden estar bloqueadas temporalmente. | `needs-legal-validation` |
| Datos inconsistentes | Hay una diferencia entre fuentes de datos. La accion se bloquea hasta completar reconciliacion. | `needs-legal-validation` |
| Feature en testnet | Esta funcionalidad puede estar conectada a testnet o configuracion provisional. No representa disponibilidad final. | `needs-legal-validation` |

## Textos largos opcionales

### Rewards y calculos off-chain

```text
Las rewards pueden calcularse off-chain a partir de reglas de juego, creditos, ranking y snapshots del periodo. Una reward no se considera disponible hasta que exista un batch validado y, cuando aplique, una transaccion de claim confirmada on-chain.
```

Estado: `needs-legal-validation`.

### Staking y cupos

```text
El staking de UKI puede usarse como criterio de acceso o cupos dentro de Cukie Master. La participacion no garantiza resultados economicos, posicion en ranking ni asignaciones futuras.
```

Estado: `needs-legal-validation`.

### NFTs y pool

```text
Los NFTs usados en Cukie Master o pools deben tener ownership y estado validos. Si un NFT aparece listado, en bridge, bloqueado o con ownership inconsistente, la dapp puede limitar acciones hasta completar reconciliacion.
```

Estado: `needs-legal-validation`.

### Preventa

```text
La compra de UKI depende de la configuracion activa del contrato de preventa, la red seleccionada, la aprobacion del token de compra y la confirmacion de la transaccion. Revisa los detalles antes de firmar.
```

Estado: `needs-legal-validation`.

## Copy prohibido o pendiente de aprobacion

No usar en UI sin validacion legal explicita:

- ingresos pasivos,
- retorno garantizado,
- rentabilidad,
- APR,
- yield,
- beneficio asegurado,
- gana dinero,
- profit,
- guaranteed rewards,
- risk-free.

Alternativas preferidas:

- rewards,
- asignaciones,
- creditos,
- cupos,
- participacion,
- claim,
- distribucion segun reglas,
- estimacion,
- pendiente de validacion,
- confirmado on-chain.

## Requisitos de implementacion

- Cada texto debe poder etiquetarse como `needs-legal-validation`.
- Las pantallas deben distinguir `estimated`, `pending`, `claimable`, `claimed` y `confirmed`.
- Los botones de accion on-chain deben enlazar o exponer tx hash cuando exista.
- Las APIs deben devolver codigos de estado que permitan mostrar disclaimers correctos.
- No mezclar creditos internos con UKI transferible.

