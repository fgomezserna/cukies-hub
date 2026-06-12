# UKI release workflow

Estado: propuesta operativa inicial.
Issue: #136 `UKI-090.3`.
Fecha: 2026-05-13.

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
| Staging | Validacion integrada antes de produccion. | `main` o release candidate. | BSC testnet, envs staging. | QA, producto, ops. |
| Production | Web/app publica. | `production` o release tag aprobado. | BSC mainnet, envs produccion. | Usuarios. |

Estado actual: no se ha confirmado una rama remota `production`. Antes del primer deploy real de produccion, hay que decidir si produccion se controla por rama `production`, por tags versionados o por configuracion del proveedor. La recomendacion es rama protegida `production` mas tags de release.

## Ramas

| Rama | Regla |
| --- | --- |
| `codex/issue-<numero>-<slug>` | Trabajo aislado de una issue. Puede tener PR draft. |
| `main` | Integracion continua. Debe estar deployable a staging. No representa produccion por si sola. |
| `release/staging-YYYY-MM-DD` | Opcional. Rama de estabilizacion si `main` avanza demasiado rapido. |
| `production` | Rama protegida recomendada. Solo recibe releases aprobadas. |

Si no existe `production`, crearla debe ser una tarea explicita de ops antes del primer lanzamiento publico.

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
| In review | PR abierto con validacion tecnica. | Review y ajustes. |
| Staging candidate | PR mergeado a `main` o incluido en release branch. | Deploy/QA staging. |
| Staging validated | Evidencia de QA en issue o release tracker. | Promocion a produccion si aplica. |
| Production released | Release/tag/deploy de produccion registrado. | Cerrar issue si el alcance queda cumplido. |
| Blocked | Decision, legal, UX image, testnet, contrato o env pendiente. | Comentario con decision exacta requerida. |

Para tareas puramente internas o docs, se pueden cerrar al merge del PR si no necesitan deploy. Para cambios de producto, se cierran cuando estan validados segun su acceptance criteria. El release tracker registra que version llego a produccion.

## Flujo normal de desarrollo

1. Elegir issue hoja, no epic, salvo que el trabajo sea de planificacion.
2. Leer epic padre, checklist, labels, milestone y comentarios recientes.
3. Crear rama `codex/issue-<numero>-<slug>` desde `main`.
4. Comentar en la issue: branch, plan y validacion prevista.
5. Abrir PR draft.
6. Implementar con scope cerrado.
7. Ejecutar validacion minima del area tocada.
8. Actualizar PR con resumen, validacion, riesgos y screenshots si aplica.
9. Pasar PR a ready solo si no quedan gates pendientes.
10. Merge a `main` cuando este aprobado.
11. Deploy a staging.
12. Registrar evidencia de staging.
13. Promover a produccion solo mediante release aprobada.

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

Formato minimo:

```text
Release candidate: UKI <fase> <fecha>

Incluye:
- #...

No incluye:
- #...

Validacion staging:
- ...

Go/no-go:
- Tech:
- Producto:
- Ops:

Rollback:
- ...
```

Para publicar produccion, el go/no-go debe tener al menos tres responsables con decision explicita: tech lead, producto/QA y ops. Si la release toca contratos, tambien debe figurar contract owner/multisig. Si toca copy publico sensible, tambien debe figurar comms/legal.

Regla de cierre:

- docs internas o tooling sin deploy se pueden cerrar al merge si cumplen acceptance criteria;
- cambios validados solo en staging se cierran tras evidencia de staging si la issue no exige produccion;
- cambios publicos o de producto se cierran tras deploy production y smoke post-deploy;
- issues parcialmente cubiertas permanecen abiertas con comentario del alcance pendiente;
- cualquier no-go o blocker mantiene la issue abierta con la decision exacta requerida.

## Staging

Staging debe ser el primer sitio donde se juntan dapp, APIs, contratos testnet, copy, datos y juegos.

Gates minimos para staging:

- PRs incluidos mergeados o rama release creada.
- Env staging separado de produccion.
- BSC testnet para compras/vesting/claims on-chain.
- Datos de prueba que no afecten usuarios reales.
- `pnpm dapp lint`, `pnpm dapp typecheck` y tests relevantes, o fallos documentados si son preexistentes.
- `/api/health` expone el commit/ref esperado sin secretos, cuando el endpoint este disponible.
- Smoke test de rutas criticas.

Para contratos:

- testnet deploy documentado,
- BscScan testnet verification,
- direcciones staging en env,
- manifest de freeze/testnet si aplica,
- wallet de prueba y tx hashes.

## Produccion

Produccion requiere aprobacion explicita.

Gates minimos:

- release candidate validada en staging,
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

- `main` puede seguir recibiendo cambios que no entren en la release actual.
- Si hay release en estabilizacion, usar `release/staging-YYYY-MM-DD`.
- Los fixes de release se hacen contra esa rama y luego se re-aplican o mergean a `main`.
- Produccion no sigue a `main` automaticamente.
- Cualquier cambio no incluido en la release queda para la siguiente candidate.

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

Produccion:

```text
Publicado en produccion `<tag/ref>`.

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

Estas tareas deben existir antes del primer deploy real de produccion:

- #166 Crear/proteger rama `production` o decidir estrategia de tags de produccion.
- #166 Configurar deploy staging separado de produccion.
- #166 Configurar env staging y production con nombres claros.
- Definir quien aprueba go/no-go de cada release.
- #167 Crear plantilla de release candidate.
- #135 Configurar monitorizacion basica y alertas.
- Documentar rollback concreto del proveedor de hosting.
- #168 Ejecutar una release seca: staging deploy, smoke, rollback simulado.

## Regla de cierre

No se cierra una issue de launch porque "el codigo esta". Se cierra cuando su acceptance criteria queda cumplido en el entorno que corresponde:

- docs/spec: merge a `main`,
- UI sin impacto publico: merge + staging si aplica,
- feature publica: staging validado o produccion si la issue lo pide,
- contratos: freeze/deploy/verificacion segun issue,
- epics: solo cuando las hijas estan cerradas o explicitamente descartadas.
