# UKI release candidate template

Estado: plantilla operativa.
Issue: #167 `UKI-090.5`.
Fecha: 2026-05-13.

## Objetivo

Una release candidate (RC) agrupa un conjunto cerrado de issues, PRs y commits para validarlos en staging y decidir si pueden pasar a produccion.

La RC no sustituye las issues. La RC coordina el paso entre entornos y deja evidencia de validacion, responsables, riesgos aceptados, rollback y cierre correcto de issues.

## Cuando abrir una RC

Abre una RC cuando se cumpla al menos una de estas condiciones:

- hay varias issues ya mergeadas en `main` que deben validarse juntas en staging,
- se quiere fijar un punto de release mientras `main` sigue recibiendo cambios,
- se va a promover algo hacia `production`,
- hay contratos, env vars, datos o comunicacion publica que requieren go/no-go explicito.

No abras una RC para una tarea docs interna que se pueda cerrar al merge sin deploy ni validacion de entorno.

## Plantilla

```markdown
# Release candidate: UKI <fase> <YYYY-MM-DD>

## Metadata

| Campo | Valor |
| --- | --- |
| Entorno objetivo | Staging / Production / Staging y despues production |
| Source ref | `main` / `release/staging-YYYY-MM-DD` / commit SHA |
| Target ref | `main` / `production` / tag `staging-*` / tag `prod-*` |
| Ventana propuesta | YYYY-MM-DD HH:mm UTC |
| Release owner | @... |
| Issue de coordinacion | #... |

## Alcance incluido

- #... Motivo de inclusion.
- #... Motivo de inclusion.

## Alcance excluido o aplazado

- #... Motivo de exclusion.
- #... Motivo de exclusion.

## PRs, commits y tags

- PR #...
- Commit `<sha>`
- Tag `staging-YYYYMMDD.N` o `prod-YYYYMMDD.N`, si aplica.

## Entorno

| Area | Staging | Production | Nota |
| --- | --- | --- | --- |
| App/ref |  |  |  |
| Coolify app |  |  |  |
| Dominio |  |  |  |
| DB hub |  |  | No escribir production desde staging. |
| DB legacy Cukies |  |  | Usar replica sanitizada en staging. |
| Chain | BSC testnet / N/A | BSC mainnet / N/A |  |
| Contratos |  |  | Direcciones y BscScan si aplica. |

## Validacion requerida

### Automatizada

- [ ] `pnpm dapp lint`
- [ ] `pnpm dapp typecheck`
- [ ] `pnpm dapp test`
- [ ] `pnpm --filter @cukies/contracts test`, si aplica.
- [ ] `pnpm --filter @cukies/contracts freeze:manifest`, si aplica.
- [ ] Otros:

### Staging smoke

- [ ] Landing y rutas publicas criticas cargan.
- [ ] Auth/wallet no rompe el shell.
- [ ] Flujo afectado por la RC probado en staging.
- [ ] APIs afectadas responden sin usar datos production por error.
- [ ] Juegos afectados cargan o quedan explicitamente fuera.
- [ ] Logs revisados tras smoke.

### Contratos, si aplica

- [ ] Deploy testnet registrado.
- [ ] BscScan testnet verificado.
- [ ] Roles/multisig revisados.
- [ ] Freeze checklist actualizado.
- [ ] Rollback/pausa on-chain definida.

### Datos, si aplica

- [ ] Staging DB refrescada o decision de no refrescar documentada.
- [ ] Sanitizacion confirmada.
- [ ] Conteos o queries de control adjuntas.

## Evidencias

- Staging URL:
- Deploy id / Coolify event:
- Commit desplegado:
- Capturas:
- Tx hashes / BscScan:
- Logs relevantes:
- QA notes:

## Riesgos y blockers

| Riesgo/blocker | Impacto | Mitigacion | Decision |
| --- | --- | --- | --- |
|  |  |  |  |

## Rollback

| Area | Accion | Responsable | Evidencia esperada |
| --- | --- | --- | --- |
| App | Redeploy de ref estable anterior o revert PR. | Tech/Ops | URL + commit. |
| Env/config | Restaurar valor anterior en proveedor, sin publicar secretos. | Ops | Nota de cambio logico. |
| API/backend | Revert deploy o feature flag off. | Tech/Ops | Smoke OK. |
| Contratos | Pause/revoke/env lock; no asumir rollback on-chain. | Contract owner/multisig | Tx hash. |
| Datos | Restaurar backup o ejecutar reconciliacion. | Tech/Ops | Conteos post-restore. |
| Comunicacion | Revert copy o publicar aclaracion. | Producto/comms | URL/captura. |

Ref estable anterior:

- App:
- Tag:
- Commit:
- Env snapshot logico:

## Go/no-go

Production no avanza si falta alguna de las tres decisiones obligatorias: tech, producto/QA y ops.

| Rol | Responsable | Decision | Fecha/hora | Nota |
| --- | --- | --- | --- | --- |
| Tech lead |  | Pending / Go / No-go |  |  |
| Producto/QA |  | Pending / Go / No-go |  |  |
| Ops |  | Pending / Go / No-go |  |  |
| Contract owner/multisig, si aplica |  | N/A / Pending / Go / No-go |  |  |
| Comms/legal, si aplica |  | N/A / Pending / Go / No-go |  |  |

Decision final:

- [ ] Go staging.
- [ ] No-go staging.
- [ ] Go production.
- [ ] No-go production.

## Regla de cierre de issues

| Tipo de issue | Cuando se cierra |
| --- | --- |
| Docs interna / tooling sin deploy | Al merge del PR si acceptance criteria esta cumplido. |
| Cambio validado solo en staging | Tras evidencia de staging si la issue no requiere production. |
| Cambio de producto/publico | Tras deploy production y smoke post-deploy registrados. |
| Contratos | Tras deploy/verificacion del entorno requerido y roles/freeze documentados. |
| Issue parcialmente cubierta | Permanece abierta con comentario de alcance pendiente. |
| No-go o blocker | Permanece abierta con decision exacta requerida. |

Issues que se cierran al merge:

- #...

Issues que se cierran tras staging validado:

- #...

Issues que se cierran tras production validado:

- #...

Issues que permanecen abiertas:

- #... Motivo.

## Log de ejecucion

| Hora UTC | Accion | Responsable | Resultado |
| --- | --- | --- | --- |
|  |  |  |  |

## Validacion post-deploy

- [ ] Dominio correcto responde.
- [ ] Commit/ref desplegado coincide con la RC.
- [ ] Smoke critico OK.
- [ ] Logs sin errores nuevos relevantes.
- [ ] Monitorizacion revisada.
- [ ] Issues actualizadas segun regla de cierre.
- [ ] Incidentes o desviaciones registrados.
```

## Issue form

Tambien existe la issue form `.github/ISSUE_TEMPLATE/release_candidate.yml` para abrir una RC desde GitHub con los campos obligatorios.

Si la RC se gestiona desde una issue normal, copia la plantilla markdown anterior en la descripcion o en el primer comentario.

## Reglas operativas

- La RC debe listar explicitamente lo incluido y lo excluido.
- La RC debe usar refs concretas: rama, tag o SHA.
- No se publica `production` sin go de tech, producto/QA y ops.
- Si la release toca contratos, el contract owner/multisig debe figurar como responsable adicional.
- Si la release toca copy publico, claims legales o disclaimers, comms/legal debe figurar como responsable adicional.
- Los secretos nunca se pegan en la RC; solo se documenta el nombre logico de la variable y el proveedor.
- Cualquier no-go mantiene la RC abierta o cerrada como no planificada, pero no promueve cambios.
- Las issues se cierran por la regla de entorno validado, no automaticamente por aparecer listadas en la RC.
