# UKI release workflow

Estado: flujo definido `staging` -> `main`; bootstrap pendiente.
Issue original: #136 `UKI-090.3`. Gate actual: #232.
Actualizado: 2026-08-08.

## Objetivo

Coordinar desarrollo, issues, milestones, QA, contratos y despliegues sin mezclar trabajo activo con produccion.

La parte tecnica de desplegar debe ser mecanica. La parte importante es decidir que puede avanzar, que esta en validacion, que se puede publicar y quien puede desbloquear cada paso.

## Principios

1. Una issue es la unidad de trabajo.
2. Un PR es la unidad de revision.
3. Staging es la unidad de validacion.
4. Una release es la unidad de publicacion.
5. Produccion solo cambia desde una release aprobada.
6. Un contrato mergeado no es un contrato desplegado.
7. Un contrato desplegado en testnet no es un contrato congelado.
8. Un contrato congelado no cambia sin nueva issue, PR, QA y manifest.

## Entornos

| Entorno | Proposito | Fuente | Chain/config | Quien lo usa |
| --- | --- | --- | --- | --- |
| Local | Desarrollo rapido. | Rama local. | Hardhat/local env. | Implementador. |
| Preview PR | Revisar cambios aislados si el hosting lo soporta. | PR branch. | Env de preview, sin valor real. | Implementador/reviewer. |
| Staging | Validacion integrada antes de produccion. | `staging` y SHA exacto desplegado. | BSC testnet, envs staging. | QA, producto, ops. |
| Production/live | Web/app publica. | `main` tras promocion aprobada desde `staging`. | BSC mainnet, envs produccion. | Usuarios. |

`main` es la rama live. La unica operacion `main` -> `staging` es el PR de sync obligatorio tras
cada merge a live: conserva ancestry, pero no despliega ni sustituye la promocion `staging` ->
`main`. No existe una rama `production` intermedia en este flujo.

## Ramas

| Rama | Regla |
| --- | --- |
| `codex/issue-<numero>-<slug>` o feature branch | Trabajo aislado basado en `staging`; entra por PR a `staging`. |
| `staging` | Integracion y QA. Cada candidato se identifica por su SHA completo desplegado. |
| `main` | Live. Solo recibe PR normal desde `staging` o un `hotfix/*` formal. |
| `hotfix/*` | Excepcion desde live: requiere manifiesto inmutable y sync posterior a `staging`. |

## Milestones

Los milestones son fases de decision, no ramas.

| Milestone | Que permite | Que no permite |
| --- | --- | --- |
| Phase 0 - Landing live, compra cerrada | Publicar comunicacion, landing y estados bloqueados. | Abrir compra real. |
| Phase 1 - Preventa abierta | Abrir flujo de preventa despues de staging/testnet. | Claims/rewards completos. |
| Phase 2 - Claim, vesting y token ownership | Activar claim/vesting ownership validado. | Cukie Master completo si no esta listo. |
| Phase 3 - Cukie Master | Activar rutas Cukie Master. | Game economy completa sin staging. |
| Phase 4 - Game economy staging | Probar economia de juegos en staging. | Publicar sin QA end-to-end. |
| Phase 5 - Launch readiness | Freeze, monitorizacion, runbook y operacion. | Cambios sin gates. |

Cuando una issue antigua mencione `M0.5`, `M7` u otro nombre viejo, manda el milestone real de GitHub y los comentarios recientes del epic.

## Estados de una issue

| Estado | Senal practica | Siguiente paso |
| --- | --- | --- |
| Backlog | Issue abierta sin rama activa. | Priorizar o dividir. |
| In progress | Comentario con branch y plan. | PR draft. |
| In review | PR abierto contra `staging` con validacion tecnica. | Review y ajustes. |
| Staging candidate | PR mergeado a `staging`; deploy asociado a un SHA exacto. | Health, smoke y QA. |
| Staging validated | Los dos statuses release estan en success para el mismo SHA. | PR `staging` -> `main`. |
| Production released | PR promovido a `main` y deploy live registrado. | Cerrar issue si el alcance queda cumplido. |
| Blocked | Decision, legal, UX image, testnet, contrato o env pendiente. | Comentario con decision exacta requerida. |

Para tareas puramente internas o docs, se pueden cerrar al merge del PR si no necesitan deploy. Para cambios de producto, se cierran cuando estan validados segun su acceptance criteria. El release tracker registra que version llego a produccion.

## Flujo normal de desarrollo

1. Elegir issue hoja, no epic, salvo que el trabajo sea de planificacion.
2. Leer epic padre, checklist, labels, milestone y comentarios recientes.
3. Crear rama `codex/issue-<numero>-<slug>` desde `staging`.
4. Comentar en la issue: branch, plan y validacion prevista.
5. Abrir PR draft.
6. Implementar con scope cerrado.
7. Ejecutar validacion minima del area tocada.
8. Actualizar PR con resumen, validacion, riesgos y screenshots si aplica.
9. Pasar PR a ready solo si no quedan gates pendientes.
10. Merge a `staging` cuando este aprobado.
11. El job unico del `push` espera aprobacion del Environment `Staging`, verifica `/api/health`,
    smoke publico y procedencia, y publica `release/staging-deployed` y
    `release/staging-validated` sobre el SHA exacto.
12. Ambos statuses los firma una GitHub App dedicada; el `GITHUB_TOKEN` global no puede satisfacer
    los checks `release/*` ligados al `app_id` de esa App.
13. Abrir el PR desde `staging` a `main` para obtener su numero. Desde el SHA actual de `staging`,
    crear una rama corta de metadata con `.github/release/promotion.json` ligado a ese numero y al
    SHA actual de `main`; integrarla de vuelta en `staging` mediante otro PR revisado, nunca por push
    directo. El PR de promocion se actualiza automaticamente al nuevo head de `staging`.
14. Desplegar y validar otra vez ese nuevo SHA de `staging`, que ya contiene el manifiesto exacto.
15. `release/promotion-gate` se publica sobre el `refs/pull/<n>/merge` exacto. Exige manifiesto,
    health, attestations, ancestry y que el tree del test merge sea identico al tree desplegado en
    staging. El SHA base se resuelve siempre desde `refs/heads/main`, no desde el snapshot historico
    `pull_request.base.sha`. Un cambio de base o head produce otro merge SHA y descarta el verde
    anterior.
16. Cada merge a `main` crea un PR `sync/main-<sha>` -> `staging`. Debe integrarse con
    **Create a merge commit** para conservar el SHA exacto de main como ancestro. No se auto-mergea.

El carril de emergencia es `hotfix/*` -> `main`. Su manifiesto inmutable exige `incident`,
`urgency`, `whyStagingCannotWait` y `rollback`. El hotfix evita las attestations de staging, no el
test merge, el Environment `Release Gate`, la revision, el CI ni el sync posterior. Body y labels
son informativos: no autorizan el merge.

## Bootstrap del gate

`pull_request_target` usa la version de la base. Por eso la primera promocion necesita una fase de
bootstrap y steady-state no se activa hasta que el workflow exista en `main`.

La activacion es fail-closed y no se ejecuta durante el freeze actual:

1. `bootstrap-lock`: vuelve `main` read-only (`lock_branch=true`) y protege ambas ramas con PR,
   review, code owners, last-push approval, admins, historial lineal en `main` y prohibicion de
   force/delete. El bloqueo total de live evita cualquier merge mientras los statuses aun no
   existen; `staging` permanece abierta solo a PRs revisados.
2. Crear una GitHub App dedicada instalada solo en este repo, con permisos de repository
   `Commit statuses: write`, `Checks: write`, `Contents: write` y `Pull requests: write`. Los dos
   ultimos se usan solo para crear el PR de sync desde el workflow confiable de `main`. No sirve la
   App global `github-actions` (ID 15368).
3. Crear Environments `Staging` y `Release Gate`, ambos con revisores, `prevent_self_review=true`
   y policy custom exacta: solo `staging` para el primero y solo `main` para el segundo.
4. Guardar `RELEASE_GATE_APP_PRIVATE_KEY` como secret de ambos Environments y
   `RELEASE_GATE_APP_ID` como variable. La clave nunca es secret de repo ni archivo.
5. Mergear por PR a `staging` el tooling release de #232 y el contrato CI de #235. Sus jobs de
   `push` esperan aprobacion de `Staging`: release genera las dos attestations y CI publica
   `CI Quality / Required` sobre el SHA exacto, todo firmado por la App dedicada.
6. `bootstrap-attested`: verifica SHA actual de staging, App, Environment/policy exacta, statuses,
   creador, Actions run, ancestry y `CI Quality / Required` verde/app-bound sobre ese mismo SHA.
   Antes de sustituir el read-only de `main`, instala tambien ese CI como requisito obligatorio de
   `staging`. El configurador no fabrica attestations ni checks.
7. Hacer la primera promocion revisada. Los workflows `pull_request_target` todavia no existen en
   la base `main`, por lo que esta unica promocion permanece bajo `bootstrap-attested` y revision
   manual. El `push` resultante a `main` ejecuta el perfil candidate de CI.
8. Integrar el PR `sync/main-<sha>` en `staging` con **Create a merge commit** y esperar el CI del
   nuevo SHA de staging. No activar steady-state hasta que el check exista y este verde tanto en el
   SHA actual de `main` como en el de `staging`, emitido por la misma App dedicada.
9. `steady-state`: exige `release/promotion-gate` y `CI Quality / Required` en `main`, y el mismo
   check CI en `staging`, siempre ligados al `app_id` dedicado. El configurador rechaza la App
   global de Actions, checks ambiguos y cualquier preflight sin verde en ambas ramas.

Payload base de cada Environment (solo tras go operativo):

```json
{
  "prevent_self_review": true,
  "reviewers": [
    { "type": "User", "id": 219637213 },
    { "type": "User", "id": 222592709 }
  ],
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  }
}
```

Despues del `PUT /repos/fgomezserna/cukies-hub/environments/<environment>`, crear una unica policy:

- `POST .../environments/Staging/deployment-branch-policies` con
  `{ "name": "staging", "type": "branch" }`.
- `POST .../environments/Release%20Gate/deployment-branch-policies` con
  `{ "name": "main", "type": "branch" }`.

Los reviewer IDs son `@JairoGG-ai` (219637213) y `@accesovip` (222592709), verificados el
2026-08-08. Deben resolverse de nuevo antes del apply. El configurador exige exactamente una policy
de rama por Environment, impide autoaprobacion y falla si aparece una rama, tag o policy adicional.
El Environment protegido `Staging` solo puede aprobar despliegues procedentes de `staging`.

Dry-run de ejemplo una vez conocida la identidad publica de la App:

```bash
node scripts/release/configure-branch-protection.mjs \
  --phase bootstrap-attested \
  --release-app-id <APP_ID> \
  --release-app-slug <app-slug> \
  --ci-context 'CI Quality / Required'
```

Validacion local determinista del tooling:

```bash
node --test --test-reporter=spec scripts/release/*.test.mjs
```

## Contrato CI fail-closed

El monorepo declara una version exacta de pnpm en `package.json`. El runner confiable materializa
los blobs del arbol Git exacto sin obedecer `export-ignore`/`export-subst`, rechaza `node_modules`
tracked y crea una imagen efimera identificada por su digest `sha256`. Instala con
`pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile`; la imagen compartida no ejecuta
ningun generator candidato. Los gates que necesitan Prisma lo generan dentro de su propio
contenedor desechable, solo despues de que un parser root-owned confirme el unico generator
`client` con provider `prisma-client-js`, y revalidan el source antes del gate. Un lockfile
desactualizado detiene la ejecucion. Cada gate corre en un contenedor nuevo, sin red, mounts, secretos,
capabilities ni reutilizacion de su capa writable; un proceso candidato no puede alterar
el toolchain del siguiente.
Los comandos locales son:

```bash
pnpm verify:quick
pnpm verify:candidate
pnpm verify
```

`verify:quick` es el gate de PR hacia `staging`: guards de staging y release, tests de la propia policy CI, lint,
TypeScript y tests disponibles de dapp, los tres juegos, game bridge, indexer, card worker y
contratos. `verify:candidate` anade los builds de dapp, juegos y workers mas la compilacion de
contratos. Todo PR hacia `main`, incluido `hotfix/*`, y todo push protegido ejecuta candidate antes
de permitir la promocion. `pnpm verify` es el alias no interactivo del perfil candidate completo.

En GitHub, los PRs a `staging` prueban el `refs/pull/<n>/merge` actual con quick y los PRs a `main`,
incluidos `hotfix/*`, lo prueban con candidate; los pushes protegidos a ambas ramas prueban su SHA
exacto con candidate. El resolver y el runner
proceden de la base confiable. CI instala primero el candidato sin ejecutar codigo suyo, comprueba
que el checkout sigue intacto y solo entonces descarga el tooling confiable. Cada filtro pnpm usa
`--fail-if-no-match`, por lo que quitar o renombrar un workspace no produce un verde vacio. El
checkout candidato y sus scripts no reciben Environment, clave de App ni permisos de escritura.
Solo despues de revalidar rama, head, base, test merge y resultado, el attestor protegido publica
`CI Quality / Required` con la App dedicada. Un cambio de SHA, fork, test merge obsoleto, fallo de
guard/test/TypeScript/build o ausencia de aprobacion deja el check ausente o en failure.

Los warnings de lint ya inventariados no falsean el resultado; cualquier error devuelve codigo no
cero. No quedan builds con `ignoreBuildErrors`/`ignoreDuringBuilds`, lint interactivo ni exclusiones
temporales para Hyppie Road o Tower Builder. `scripts/ci/`, el workflow y las configuraciones que
definen este contrato estan bajo CODEOWNERS.

`--apply` requiere el literal `APPLY_RELEASE_GUARDS_AFTER_FREEZE`, token administrativo y los
preflights de la fase. Conserva requirements ajenos, protege primero `main` y despues `staging`, y
nunca acepta un `app_id` nulo, la App global de Actions ni un CI no dedicado.

`CODEOWNERS` protege workflows, `.github/release/`, scripts release y su propia politica con
`@fgomezserna`, `@JairoGG-ai` y `@accesovip`. Mainnet y preventa siguen congelados: este documento
no autoriza apply, merge, deploy, contrato, direccion, fecha, env ni cambio de runtime.

## Release candidate

Una release candidate es un conjunto cerrado de issues que se quieren llevar a produccion.

Debe tener una issue o PR de coordinacion con:

- lista de issues incluidas,
- commits/PRs incluidos,
- entorno destino,
- comandos de validacion,
- evidencias de staging,
- decision go/no-go,
- rollback plan,
- responsable tecnico,
- responsable de validacion producto/ops.

Plantilla operativa:

- Markdown: `docs/release-candidate-template.md`.
- GitHub issue form: `.github/ISSUE_TEMPLATE/release_candidate.yml`.

La fuente autoritativa de un PR a `main` es `.github/release/promotion.json`, validado contra
`.github/release/promotion.schema.json`. Se crea despues de conocer el numero de PR y contiene el
`baseSha` exacto de `main`. El body sirve solo como resumen humano. Ejemplo normal:

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

Para publicar produccion, el go/no-go debe tener al menos tres responsables con decision explicita: tech lead, producto/QA y ops. Si la release toca contratos, tambien debe figurar contract owner/multisig. Si toca copy publico sensible, tambien debe figurar comms/legal.

Regla de cierre:

- docs internas o tooling sin deploy se pueden cerrar al merge si cumplen acceptance criteria;
- cambios validados solo en staging se cierran tras evidencia de staging si la issue no exige produccion;
- cambios publicos o de producto se cierran tras deploy live desde `main` y smoke post-deploy;
- issues parcialmente cubiertas permanecen abiertas con comentario del alcance pendiente;
- cualquier no-go o blocker mantiene la issue abierta con la decision exacta requerida.

## Staging

Staging debe ser el primer sitio donde se juntan dapp, APIs, contratos testnet, copy, datos y juegos.

Gates minimos para staging:

- PRs incluidos mergeados en `staging`.
- Env staging separado de produccion.
- BSC testnet para compras/vesting/claims on-chain.
- Datos de prueba que no afecten usuarios reales.
- `pnpm verify` completo sobre el SHA candidato, sin excepciones silenciosas.
- `CI Quality / Required` verde sobre el SHA actual de `staging` y emitido por la App dedicada.
- `/api/health` responde HTTP 200 JSON y expone exactamente app, entorno, commit completo,
  ref `staging`, UUID y host esperados sin secretos.
- Smoke test de rutas criticas.
- `release/staging-deployed` y `release/staging-validated` estan en success para el mismo SHA.
- Ambos statuses proceden de la misma run y del bot de la App release dedicada.
- El SHA actual de `main` es ancestro de staging; cualquier merge previo a main ya volvio mediante
  un PR `sync/main-*` integrado con merge commit.

Para contratos:

- testnet deploy documentado,
- BscScan testnet verification,
- direcciones staging en env,
- manifest de freeze/testnet si aplica,
- wallet de prueba y tx hashes.

## Produccion

`main`/live requiere aprobacion explicita y solo recibe una promocion desde `staging` o un hotfix
formal. Mainnet y preventa permanecen congelados; este documento no autoriza ningun deploy ni
activacion.

Gates minimos:

- release candidate validada en staging,
- manifiesto inmutable ligado al PR y al SHA actual de `main`,
- `release/promotion-gate` verde sobre el test merge exacto,
- tree del test merge igual al tree desplegado de staging para una promocion normal,
- `CI Quality / Required` verde y ligado al mismo `app_id` release,
- no issues P0 abiertas que bloqueen la fase,
- env produccion revisado,
- contratos mainnet verificados si la release toca on-chain,
- rollback plan escrito,
- comunicacion lista si el cambio es publico,
- monitorizacion basica activa,
- responsable de guardia definido para las primeras horas.

El deploy de produccion debe registrar:

- fecha/hora,
- commit/tag/branch desplegado,
- evidencia de `/api/health` si esta disponible,
- issue/PR de release,
- persona que ejecuta,
- validacion post-deploy,
- incidentes o decisiones.

## Contratos

Contratos tienen un carril separado.

Runbook operativo de despliegue mainnet UKI:

- `docs/uki-mainnet-contract-deployment.md`

| Evento | Significa | No significa |
| --- | --- | --- |
| PR de contrato mergeado | Codigo disponible. | Deploy aprobado. |
| Deploy testnet | Flujo probado con direcciones reales de testnet. | Mainnet listo. |
| Freeze manifest | ABI/bytecode/direcciones fijadas para candidato. | Auditoria aprobada. |
| Deploy mainnet | Contrato vivo. | Dapp puede usarlo sin env/revision. |
| Dapp env actualizado | UI apunta al contrato. | La release esta validada por producto. |

Gates de contrato para mainnet:

- tests y coverage,
- Slither/static analysis,
- threat model,
- multisig/roles,
- BscScan verification,
- testnet end-to-end,
- freeze checklist,
- auditoria o revision independiente,
- manifest final.

Si hay fallo despues de mainnet, el rollback principal no es "revertir contrato". Es:

1. pausar `Presale` o `UKIToken` si aplica,
2. retirar permisos comprometidos,
3. bloquear UI de compra/claim,
4. reconciliar indexer/backend,
5. desplegar contrato corregido solo con nueva release.

## Mientras sigue el desarrollo

Para no parar el equipo:

- `staging` puede seguir recibiendo features por PR mientras no haya un candidato congelado.
- Si se congela un candidato, su identidad es el SHA completo attestated; nuevos merges generan
  otro candidato y deben repetir deploy/QA.
- `main` no recibe features directas: solo promocion desde `staging` o hotfix formal.
- Todo merge de `main` vuelve a `staging` mediante `sync/main-*`; hasta integrar ese PR con merge
  commit, ancestry y la siguiente promocion permanecen bloqueados.
- Cualquier cambio no incluido en el SHA validado queda para la siguiente candidate.

## Rollback y pausa

| Tipo | Accion principal | Responsable |
| --- | --- | --- |
| UI/app | Redeploy de ultimo tag/commit estable o revert PR. | Tech/ops. |
| Env/config | Restaurar env anterior y redeploy. | Ops. |
| API/backend | Rollback deploy o feature flag off. | Tech/ops. |
| Contratos | Pause/revoke/env lock, no rollback directo. | Multisig/contract owner. |
| Copy/comunicacion | Revert contenido y publicar aclaracion si aplica. | Producto/comms. |

Cada release debe tener un rollback plan antes del go/no-go.

## Responsables

| Rol | Responsabilidad |
| --- | --- |
| Tech lead | Scope, gates, coherencia tecnica, decision de merge. |
| Implementador | Rama, PR, tests, issue comments. |
| Reviewer | Riesgos, regresiones, seguridad, coverage. |
| QA/producto | Validacion funcional en staging. |
| Ops | Env, deploy, rollback, logs, monitorizacion. |
| Contract owner/multisig | Deploy on-chain, roles, pause/revoke, BscScan. |
| Comms/legal | Copy publico, disclaimers, go/no-go de mensajes sensibles. |

Una persona puede cubrir varios roles, pero en la release debe quedar escrito quien asumio cada uno.

## Plantilla de comentario de issue

Inicio:

```text
Trabajo iniciado en `<branch>`.

Plan:
- ...

Validacion prevista:
- ...
```

Staging:

```text
Incluido en staging `<release/ref>`.

Validacion:
- ...

Notas:
- ...
```

Main/live:

```text
Promovido a main `<sha/ref>`.

Deploy:
- commit/tag:
- hora:
- responsable:

Validacion post-deploy:
- ...

Rollback:
- ...
```

Bloqueo:

```text
Bloqueado.

Motivo:
- ...

Decision necesaria:
- ...

Siguiente paso recomendado:
- ...
```

## Tareas operativas pendientes

Estas tareas deben existir antes de una promocion real a `main`:

- Mergear #232 y #235 por sus PRs revisados a `staging`; no aplicar bootstrap ni steady-state desde
  una rama de trabajo.
- Completar la primera promocion bootstrap, su sync con merge commit y los checks CI de ambos SHA
  antes de aplicar steady-state con App y Environments dedicados.
- #233 y #234 cerrar superficies internas y configuracion tipada antes de promocion real.
- #166 Mantener deploy staging separado de live.
- #166 Mantener env staging y live con nombres claros.
- Definir quien aprueba go/no-go de cada release.
- #167 Crear plantilla de release candidate.
- #135 Configurar monitorizacion basica y alertas.
- Documentar rollback concreto del proveedor de hosting.
- #168 Ejecutar una release seca: staging deploy, smoke, rollback simulado.

## Regla de cierre

No se cierra una issue de launch porque "el codigo esta". Se cierra cuando su acceptance criteria queda cumplido en el entorno que corresponde:

- docs/spec: merge en la rama objetivo definida por su acceptance criteria,
- UI sin impacto publico: merge + staging si aplica,
- feature publica: staging validado o produccion si la issue lo pide,
- contratos: freeze/deploy/verificacion segun issue,
- epics: solo cuando las hijas estan cerradas o explicitamente descartadas.
