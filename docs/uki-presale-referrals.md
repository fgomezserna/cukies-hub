# UKI Presale Referrals

## Objetivo

Crear un sistema de referidos nuevo para la preventa UKI, independiente del sistema legacy de referidos, XP, quests y `referralRewards` de Cukies Hub.

El sistema legacy queda fuera del flujo de preventa. No debe usarse para atribucion, desbloqueo de links, calculo de rewards ni reporting de compras.

El sistema de preventa es off-chain: no premia en el momento de la compra, no reparte comisiones automaticas y no necesita bloquear logica de premios en blockchain. Solo registra compras atribuidas por red de referidos para calcular rankings o valores acumulados al final de la campana. Los premios finales pueden ser Cukies asignados manual u operativamente segun el ranking/valor resultante.

## Comportamiento de producto

- Al conectar wallet, el usuario ve un modulo de referidos en la preventa.
- Si no ha comprado el minimo requerido, no se muestra link copiable.
- El modulo debe indicar que el link se desbloquea al comprar al menos `X` UKI.
- Cuando la wallet acumula compras de preventa por al menos `X` UKI, se desbloquea su link.
- Desde ese momento, el usuario puede invitar a otros compradores.
- Las compras de wallets referidas se acumulan para reporting y futura recompensa.
- El sponsor de una wallet compradora se bloquea en su primera compra, no antes.
- El sistema debe registrar contribuciones de referidos en 3 niveles.
- Cada nivel tiene un peso configurable.
- Cada nivel conserva el volumen bruto comprado por el referido.
- El valor final de un usuario se calcula aplicando pesos al volumen bruto acumulado en sus niveles 1, 2 y 3.
- Al final de la campana se revisan los valores acumulados y se asignan premios, por ejemplo Cukies, a los valores mas altos.

## Referencia legacy revisada

El legacy de Cukies World en `/Users/fgomezserna/Proyectos/cukies-world` tenia dos piezas relevantes:

- Contrato `Referrals` con `setSponsor`, `setSponsorOwner`, `getSponsor`, `haveSponsor` y `getReferrals`.
- Contrato `Mint` con `multiMint(num, sponsor)`, `userToSponsor`, `referralsBuyed` y evento `MintReferral(user, sponsor, num, value, comission, level)`.

La base legacy tambien tenia coleccion `referrals` con arrays separados para `referrals`, `referralstwo` y `referralsthree`, mas acumulados por nivel (`levelone`, `leveltwo`, `levelthree`, `comision_levelone`, `comision_leveltwo`, `comision_levelthree`) y flag `buyed`.

Conclusion para UKI: no se debe portar el modelo legacy tal cual. Solo conviene conservar la idea de red de 3 niveles y registro de contribucion por compra y nivel. La recompensa UKI no debe ejecutarse como comision on-chain en cada compra.

## Reglas

- El minimo `X` se define como cantidad de UKI comprada, no como XP ni puntos legacy.
- La atribucion se basa en wallet, no en username.
- El link publico no debe ser la wallet completa en claro. Debe ser un codigo estable que resuelva a wallet internamente.
- Una wallet no puede referirse a si misma.
- Una wallet puede tener un sponsor provisional antes de comprar.
- Si una wallet entra con link de Jairo, no compra, luego entra sin link y compra, se asigna Jairo.
- Si una wallet entra con link de Jairo, no compra, luego entra con link de Fran y compra, se asigna Fran.
- En la primera compra confirmada, el sponsor provisional pasa a sponsor bloqueado.
- Tras la primera compra, el sponsor bloqueado no cambia aunque la wallet entre con otros links.
- El referido solo cuenta como comprador cuando existe una compra de preventa confirmada.
- El link no debe aparecer bloqueado con valor copiable; debe ocultarse hasta que la wallet cumpla el minimo.
- Las compras posteriores de una wallet ya compradora siempre acumulan para su sponsor bloqueado.
- Las contribuciones se anotan en 3 niveles: sponsor directo, sponsor del sponsor y tercer nivel.
- Las contribuciones no generan premio inmediato.
- No hay descuento, cashback, comision ni claim automatico en la compra.
- Los pesos por nivel son configuracion de campana y deben guardarse con snapshot para poder auditar el calculo final.
- El volumen comprado por un referido no cambia por nivel: si Ana compra 1,000 UKI, se registran 1,000 UKI brutos para el nivel que corresponda a cada sponsor.

## Modelo de datos propuesto

`PresaleParticipant`

- `id`
- `walletAddress`
- `normalizedWalletAddress`
- `totalUkiPurchased`
- `referralCode`
- `referralUnlockedAt`
- `referralMinimumUkiSnapshot`
- `pendingSponsorWalletAddress`
- `pendingSponsorCode`
- `pendingSponsorUpdatedAt`
- `lockedSponsorWalletAddress`
- `sponsorLockedAt`
- `firstPurchaseAt`
- `createdAt`
- `updatedAt`

`PresaleReferral`

- `id`
- `referrerWalletAddress`
- `referredWalletAddress`
- `referralCode`
- `attributedAt`
- `lockedAt`
- `firstPurchaseAt`
- `totalUkiPurchasedByReferred`
- `qualifiedAt`
- `rewardStatus`
- `createdAt`
- `updatedAt`

`PresaleReferralPurchase`

- `id`
- `referralId`
- `buyerWalletAddress`
- `presalePurchaseId`
- `ukiAmount`
- `paymentToken`
- `paymentAmount`
- `txHash`
- `confirmedAt`

`PresaleReferralContribution`

- `id`
- `purchaseId`
- `buyerWalletAddress`
- `directSponsorWalletAddress`
- `sponsorWalletAddress`
- `level`
- `levelWeightSnapshot`
- `ukiAmount`
- `weightedScore`
- `paymentToken`
- `paymentAmount`
- `txHash`
- `createdAt`

`PresaleReferralCampaignConfig`

- `id`
- `minimumUkiToUnlockLink`
- `levelOneWeight`
- `levelTwoWeight`
- `levelThreeWeight`
- `startsAt`
- `endsAt`
- `createdAt`
- `updatedAt`

## Flujo

1. Wallet conecta en la landing/preventa.
2. Backend carga o crea `PresaleParticipant`.
3. UI consulta `totalUkiPurchased`.
4. Si `totalUkiPurchased < X`, UI muestra estado bloqueado sin link.
5. Tras una compra confirmada, indexer/backend actualiza `totalUkiPurchased`.
6. Si `totalUkiPurchased >= X` y no existe `referralUnlockedAt`, se fija `referralUnlockedAt`.
7. UI muestra link activo.
8. Cuando otra wallet entra con ese link y aun no ha comprado, se guarda o reemplaza `pendingSponsorWalletAddress`.
9. Si esa wallet entra sin link despues, se conserva el sponsor provisional anterior.
10. Si esa wallet entra con otro link antes de comprar, se reemplaza el sponsor provisional por el nuevo.
11. En la primera compra confirmada, `pendingSponsorWalletAddress` se copia a `lockedSponsorWalletAddress`.
12. Desde ese momento, cualquier compra de esa wallet se atribuye al sponsor bloqueado.
13. Por cada compra atribuida, se crean contribuciones de nivel 1, 2 y 3 si existen sponsors ascendentes.
14. Cada contribucion guarda el volumen bruto comprado, el peso vigente de su nivel y el score ponderado calculado.
15. Al final de la campana, se agregan contribuciones por sponsor para decidir premios.

## Verificacion de compras

Las compras no se comprueban desde la UI. La fuente de verdad es el contrato de preventa en BSC y el evento:

`Purchased(buyer, asmAmount, ukiAmount, totalBuyerAsm, totalBuyerUki)`

El worker `@cukies/chain-indexer` debe monitorizar ese evento, esperar confirmaciones BSC y proyectarlo a Mongo. El flujo operativo es:

1. Usuario compra en el contrato `Presale`.
2. El contrato emite `Purchased`.
3. `chain-indexer` lee logs confirmados de BSC.
4. El evento se guarda en `chain_events`.
5. El projector crea/actualiza:
   - `presale_purchases`
   - `presale_participants`
   - `presale_referral_contributions`
6. La UI y el ranking leen Mongo, no la transaccion pendiente del navegador.

## Captura de sponsor provisional

La dapp expone una ruta publica de referido de preventa:

- `/ref/[code]`

Al entrar por esa ruta se guarda una cookie temporal `ukiReferralCode` y se redirige a la consola de preventa. Cuando el usuario conecta wallet y la UI consulta su estado de referido, el backend aplica ese codigo como sponsor provisional si cumple las reglas.

Endpoints implementados:

- `GET /api/presale/referral/status?walletAddress=...`
  - Crea o carga `presale_participants`.
  - Aplica `ukiReferralCode` si existe en cookie.
  - Devuelve link solo si `referralUnlockedAt` existe.
- `POST /api/presale/referral/attribution`
  - Body: `{ walletAddress, referralCode }`.
  - Guarda o reemplaza sponsor provisional si la wallet aun no ha comprado.
  - Ignora codigos bloqueados/no desbloqueados, self-referral y wallets con sponsor ya bloqueado.
- `GET /api/presale/referral/ranking?limit=100`
  - Devuelve ranking ordenado por `weightedScore`.
  - Con `format=csv`, descarga CSV para decidir premios finales.

Variables necesarias:

- `CHAIN_INDEXER_PRESALE_ADDRESS` o `NEXT_PUBLIC_UKI_PRESALE_ADDRESS`: contrato `Presale` en BSC.
- `CHAIN_INDEXER_BSC_CONFIRMATIONS`: confirmaciones antes de considerar compra final.
- `CHAIN_INDEXER_START_BSC_BLOCK`: bloque inicial de indexacion.

El worker es idempotente:

- `presale_purchases` usa `eventId` y `(txHash, logIndex)` como claves unicas.
- `presale_referral_contributions` usa `(eventId, level)` como clave unica.
- Si el worker reintenta un evento, no debe duplicar compras ni sumar dos veces el volumen de referidos.

## Colecciones generadas por el worker

`presale_purchases`

- Compra confirmada desde evento on-chain.
- Guarda wallet compradora, `txHash`, `logIndex`, bloque, cantidades raw y cantidades humanas.
- Sirve como auditoria de compra.

`presale_participants`

- Estado acumulado por wallet.
- Guarda compras totales, sponsor provisional, sponsor bloqueado, desbloqueo de link y agregados de referidos.

`presale_referral_contributions`

- Una fila por compra atribuida y nivel.
- Guarda volumen bruto comprado por el referido en ese nivel.
- Guarda `weightedScore` calculado con el peso vigente.

## Ejemplo de atribucion

Caso A:

1. Ana entra con link de Jairo.
2. Ana no compra.
3. Ana vuelve sin link y compra.
4. La compra queda atribuida a Jairo.

Caso B:

1. Ana entra con link de Jairo.
2. Ana no compra.
3. Ana vuelve con link de Fran y compra.
4. La compra queda atribuida a Fran.

Caso C:

1. Ana compra por primera vez con sponsor Fran.
2. Ana vuelve otro dia con link de Jairo.
3. Ana compra de nuevo.
4. La compra sigue contando para Fran.

## Ejemplo de 3 niveles

Si Fran invita a Jairo, Jairo invita a Marta y Marta invita a Ana:

- Ana compra 1,000 UKI.
- Marta tiene 1,000 UKI comprados por un referido en su nivel 1.
- Jairo tiene 1,000 UKI comprados por un referido en su nivel 2.
- Fran tiene 1,000 UKI comprados por un referido en su nivel 3.

Si la campana define pesos 1.0, 0.5 y 0.25:

- Marta suma 1,000 valor ponderado.
- Jairo suma 500 valor ponderado.
- Fran suma 250 valor ponderado.

Esto no entrega premio en ese momento. El volumen bruto por nivel se conserva, y el valor ponderado se calcula aparte para revisar al cierre de la campana.

## Pendientes de decision

- Valor exacto de `X` UKI.
- Pesos exactos de niveles 1, 2 y 3.
- Criterio final de premios: top N, tramos, sorteo ponderado, asignacion manual o combinacion.
- Numero y tipo de Cukies a regalar.
- Si compras hechas antes de abrir un link deben contar retroactivamente.
- Si se admiten codigos personalizados o solo codigos generados.
- Si el codigo se genera aleatoriamente, se deriva de wallet o permite alias personalizados.
- Si se muestra desglose por referidos conectados, compradores y volumen por nivel.
- Si el ranking final muestra valor ponderado publico o solo estado interno.

## Cambios previos realizados

- La entrada legacy `Referidos` se oculta de la navegacion principal.
- `/referrals` queda oculto y responde como pagina no encontrada.
- `/r/[code]` deja de capturar referidos legacy.
- `/api/referral/[code]` limpia la cookie legacy y redirige a home.
- El login deja de procesar `referrerUsername` y no asigna `referredById` ni XP legacy.
