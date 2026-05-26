# UKI Presale Referrals

## Objetivo

Crear un sistema de referidos nuevo para la preventa UKI, independiente del sistema legacy de referidos, XP, quests y `referralRewards` de Cukies Hub.

El sistema legacy queda fuera del flujo de preventa. No debe usarse para atribucion, desbloqueo de links, calculo de rewards ni reporting de compras.

## Comportamiento de producto

- Al conectar wallet, el usuario ve un modulo de referidos en la preventa.
- Si no ha comprado el minimo requerido, no se muestra link copiable.
- El modulo debe indicar que el link se desbloquea al comprar al menos `X` UKI.
- Cuando la wallet acumula compras de preventa por al menos `X` UKI, se desbloquea su link.
- Desde ese momento, el usuario puede invitar a otros compradores.
- Las compras de wallets referidas se acumulan para reporting y futura recompensa.

## Reglas

- El minimo `X` se define como cantidad de UKI comprada, no como XP ni puntos legacy.
- La atribucion se basa en wallet, no en username.
- Una wallet no puede referirse a si misma.
- Una wallet referida solo debe tener un referrer activo.
- Si se permite caducidad o reatribucion, debe definirse explicitamente antes de implementar.
- El referido solo cuenta como comprador cuando existe una compra de preventa confirmada.
- El link no debe aparecer bloqueado con valor copiable; debe ocultarse hasta que la wallet cumpla el minimo.

## Modelo de datos propuesto

`PresaleParticipant`

- `id`
- `walletAddress`
- `normalizedWalletAddress`
- `totalUkiPurchased`
- `referralCode`
- `referralUnlockedAt`
- `referralMinimumUkiSnapshot`
- `createdAt`
- `updatedAt`

`PresaleReferral`

- `id`
- `referrerWalletAddress`
- `referredWalletAddress`
- `referralCode`
- `attributedAt`
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

## Flujo

1. Wallet conecta en la landing/preventa.
2. Backend carga o crea `PresaleParticipant`.
3. UI consulta `totalUkiPurchased`.
4. Si `totalUkiPurchased < X`, UI muestra estado bloqueado sin link.
5. Tras una compra confirmada, indexer/backend actualiza `totalUkiPurchased`.
6. Si `totalUkiPurchased >= X` y no existe `referralUnlockedAt`, se fija `referralUnlockedAt`.
7. UI muestra link activo.
8. Cuando otra wallet entra con ese link, se guarda atribucion si es valida.
9. Cuando la wallet referida compra, se acumula el importe en `PresaleReferral`.

## Pendientes de decision

- Valor exacto de `X` UKI.
- Si el reward sera NFT, UKI, ranking, sorteo o combinacion.
- Si una atribucion caduca.
- Si compras hechas antes de abrir un link deben contar retroactivamente.
- Si se admiten codigos personalizados o solo codigos generados.
- Que ocurre si un usuario entra con link A, no compra, y despues entra con link B.

## Cambios previos realizados

- La entrada legacy `Referidos` se oculta de la navegacion principal.
- `/referrals` queda oculto y responde como pagina no encontrada.
- `/r/[code]` deja de capturar referidos legacy.
- `/api/referral/[code]` limpia la cookie legacy y redirige a home.
- El login deja de procesar `referrerUsername` y no asigna `referredById` ni XP legacy.
