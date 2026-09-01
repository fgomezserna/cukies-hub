# UKI release candidate template

Estado: plantilla operativa para `staging` -> `main`.
Issue original: #167 `UKI-090.5`. Gate actual: #232.
Actualizado: 2026-08-08.

## Objetivo

Una release candidate (RC) agrupa un conjunto cerrado de issues, PRs y commits ya integrados en
`staging`. Su identidad tecnica es el SHA completo desplegado y sirve para decidir si ese mismo SHA
puede entrar por PR de `staging` a `main`/live.

La RC no sustituye las issues. La RC coordina el paso entre entornos y deja evidencia de validacion, responsables, riesgos aceptados, rollback y cierre correcto de issues.

## Cuando abrir una RC

Abre una RC cuando se cumpla al menos una de estas condiciones:

- hay varias issues ya mergeadas en `staging` que deben validarse juntas,
- se quiere fijar un SHA mientras `staging` sigue recibiendo cambios,
- se va a abrir el PR de promocion `staging` -> `main`,
- hay contratos, env vars, datos o comunicacion publica que requieren go/no-go explicito.

No abras una RC para una tarea docs interna que se pueda cerrar al merge sin deploy ni validacion de entorno.

## Plantilla

```markdown
# Release candidate: UKI <fase> <YYYY-MM-DD>

## Metadata

| Campo | Valor |
| --- | --- |
| Entorno objetivo | Staging / Main-live |
| Source ref | `staging@<SHA completo>` |
| Target ref | `main` / tag `prod-*`, si aplica despues del merge |
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
- Tag `staging-YYYYMMDD.N` o `prod-YYYYMMDD.N`, si aplica al mismo SHA.

## Entorno

| Area | Staging | Main/live | Nota |
| --- | --- | --- | --- |
| App/ref |  |  |  |
| Coolify app |  |  |  |
| Dominio |  |  |  |
| DB hub |  |  | No escribir live desde staging. |
| DB legacy Cukies |  |  | Usar replica sanitizada en staging. |
| Chain | BSC testnet / N/A | BSC mainnet / N/A | Mainnet permanece congelada hasta autorizacion. |
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
- [ ] APIs afectadas responden sin usar datos live por error.
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
- Health/version exacto (`status`, app, environment, SHA, ref, UUID y FQDN):
- Deploy id / Coolify event:
- Commit desplegado:
- Status `release/staging-deployed`:
- Status `release/staging-validated`:
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

`main`/live no avanza si falta alguna de las tres decisiones obligatorias: tech, producto/QA y ops.

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
- [ ] Go promocion `staging` -> `main`.
- [ ] No-go promocion `staging` -> `main`.

## Regla de cierre de issues

| Tipo de issue | Cuando se cierra |
| --- | --- |
| Docs interna / tooling sin deploy | Al merge del PR si acceptance criteria esta cumplido. |
| Cambio validado solo en staging | Tras evidencia de staging si la issue no requiere main/live. |
| Cambio de producto/publico | Tras promocion a `main`, deploy live y smoke post-deploy registrados. |
| Contratos | Tras deploy/verificacion del entorno requerido y roles/freeze documentados. |
| Issue parcialmente cubierta | Permanece abierta con comentario de alcance pendiente. |
| No-go o blocker | Permanece abierta con decision exacta requerida. |

Issues que se cierran al merge:

- #...

Issues que se cierran tras staging validado:

- #...

Issues que se cierran tras `main`/live validado:

- #...

Issues que permanecen abiertas:

- #... Motivo.

## Log de ejecucion

| Hora UTC | Accion | Responsable | Resultado |
| --- | --- | --- | --- |
|  |  |  |  |

## Validacion post-deploy

- [ ] Dominio correcto responde.
- [ ] `/api/health` responde y expone el commit/ref esperado sin secretos.
- [ ] Commit/ref desplegado coincide con la RC.
- [ ] Ambos statuses release pertenecen al mismo SHA completo.
- [ ] Smoke critico OK.
- [ ] Logs sin errores nuevos relevantes.
- [ ] Monitorizacion revisada.
- [ ] Issues actualizadas segun regla de cierre.
- [ ] Incidentes o desviaciones registrados.
```

## Issue form

Tambien existe la issue form `.github/ISSUE_TEMPLATE/release_candidate.yml` para abrir una RC desde GitHub con los campos obligatorios.

Si la RC se gestiona desde una issue normal, copia la plantilla markdown anterior en la descripcion o en el primer comentario.

## Metadata del PR de promocion

El PR normal solo puede tener head `staging` y base `main`. El hotfix solo puede usar `hotfix/*`.
La autorizacion no se lee del body ni de labels mutables: vive en
`.github/release/promotion.json`, protegido por CODEOWNERS, dentro del SHA head exacto. El fichero
se crea despues de conocer el numero del PR y debe cumplir `.github/release/promotion.schema.json`.
En una promocion normal, se incorpora mediante un PR corto de metadata hacia `staging`; nunca se
hace push directo a la rama protegida. Ese merge actualiza el head del PR de promocion y obliga a
desplegar y validar de nuevo el SHA que ya contiene el manifiesto.

Promocion normal:

```json
{
  "schemaVersion": 1,
  "mode": "normal",
  "pullRequest": 123,
  "baseSha": "0123456789abcdef0123456789abcdef01234567",
  "stagingEvidence": [
    "https://github.com/fgomezserna/cukies-hub/actions/runs/123456",
    "https://cukieshub.eurekand.com/api/health"
  ],
  "rollback": "Revertir el merge de main y redesplegar la ultima imagen estable conocida."
}
```

Hotfix:

```json
{
  "schemaVersion": 1,
  "mode": "hotfix",
  "pullRequest": 124,
  "baseSha": "0123456789abcdef0123456789abcdef01234567",
  "incident": "INC-481 - el checkout de preventa esta bloqueado para usuarios activos.",
  "urgency": "El impacto esta activo y requiere restaurar el servicio inmediatamente.",
  "whyStagingCannotWait": "La causa depende del routing exclusivo de produccion y bloquea compras ahora.",
  "rollback": "Revertir el merge del hotfix y redesplegar la ultima imagen estable conocida."
}
```

`pullRequest` y `baseSha` evitan reutilizar el manifiesto en otro PR o contra otra base. Cualquier
cambio del manifiesto cambia el head SHA y obliga a repetir review/gates. El hotfix no requiere las
attestations de staging, pero nunca evita test merge, CI, Environment `Release Gate` ni revision.
El gate resuelve `baseSha` desde el `refs/heads/main` vivo; no confia en el snapshot potencialmente
obsoleto `pull_request.base.sha`.
Tras cualquier merge a `main`, el workflow crea `sync/main-<sha>` -> `staging`; ese PR no se
auto-mergea y debe usar **Create a merge commit**.

## Bootstrap y freeze actual

`pull_request_target` no puede proteger la primera promocion con un archivo que aun no esta en la
base. Antes de mergear el tooling, `bootstrap-lock` deja `main` read-only e instala
PR/reviews/CODEOWNERS/admins y prohibe force/delete en ambas ramas, sin exigir statuses
inexistentes. `bootstrap-attested` solo desbloquea live despues de validar las attestations exactas.
La QA no depende de
`workflow_dispatch`: el workflow de `push` a `staging` espera la aprobacion del Environment
protegido `Staging` antes de verificar y firmar ambas attestations con una GitHub App dedicada.
`Staging` solo admite la rama custom `staging`; `Release Gate` solo la rama custom `main`. Ambos
exigen revisor e impiden autoaprobacion.

La App dedicada necesita `Commit statuses: write`, `Checks: write`, `Contents: write` y
`Pull requests: write`; los permisos de contenido y PR se usan solo desde el workflow confiable de
sync en `main`, tras aprobar `Release Gate`. El `GITHUB_TOKEN` del repositorio no crea ese PR.

`bootstrap-attested` exige el SHA actual de `staging` y verifica Environment, creador, Actions run,
workflow/ref/SHA/conclusion de los dos statuses y ancestry; no fabrica attestations. Tras la primera
promocion y su sync con merge commit, steady-state exige `release/promotion-gate` mas el check CI
de #235, ambos emitidos por la misma App dedicada y ligados a su `app_id`. La App global de GitHub
Actions no es valida. El placeholder
`__REPLACE_WITH_EXISTING_REQUIRED_CI_CONTEXT__` nunca es aplicable. Mainnet y preventa permanecen
congeladas: esta plantilla no autoriza apply, promocion, deploy, contrato, direccion, fecha, env ni
cambio de runtime.

`CODEOWNERS` exige revision sobre workflows, manifiestos, scripts release y la propia politica a uno de los
tres colaboradores verificados: `@fgomezserna`, `@JairoGG-ai` o `@accesovip`. La proteccion exige
tambien last-push approval y el autor no puede aprobar su propio PR.

## Reglas operativas

- La RC debe listar explicitamente lo incluido y lo excluido.
- La RC debe usar el SHA completo exacto desplegado desde `staging`.
- No se promueve a `main` sin go de tech, producto/QA y ops.
- Si la release toca contratos, el contract owner/multisig debe figurar como responsable adicional.
- Si la release toca copy publico, claims legales o disclaimers, comms/legal debe figurar como responsable adicional.
- Los secretos nunca se pegan en la RC; solo se documenta el nombre logico de la variable y el proveedor.
- Cualquier no-go mantiene la RC abierta o cerrada como no planificada, pero no promueve cambios.
- Las issues se cierran por la regla de entorno validado, no automaticamente por aparecer listadas en la RC.
