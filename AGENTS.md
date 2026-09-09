# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Communication Rules

- Habla siempre en castellano con el usuario.
- Usa `pnpm`, no `npm`, para instalar, ejecutar scripts o validar el monorepo.
- Cuando necesites cargar el entorno completo antes de un comando, usa:
```bash
source ~/.zshrc >/dev/null 2>&1 &&
```
- Tu prioridad es elegir el mejor workflow para el objetivo, no ejecutar comandos por inercia.

## Flujo por defecto de agentes

Para trabajo que se pueda separar con seguridad, Astra `max` conserva la decisión, el reparto, la revisión de evidencia/diff y la integración; delega la ejecución rutinaria en `gpt-5.6-luna` con esfuerzo `max`. Por decisión del usuario, `max` es el valor por defecto para ambos modelos: auditor, investigador, implementador y tester usan Luna Max; el coordinador y reviewer usan Astra Max. La revisión independiente adicional se aplica cuando el riesgo lo justifique. El coordinador no duplica implementación ni rastreo rutinario. Las operaciones privilegiadas ya autorizadas por el usuario se ejecutan si la herramienta solo está disponible para la raíz.

- Invocar mediante `collaboration.spawn_agent` con exactamente los campos `task_name`, `model`, `reasoning_effort`, `fork_turns` y `message`; el encargo autocontenido va dentro de `message`. Fijar siempre el modelo y esfuerzo indicados para el rol. No crear chats, cron ni subcomandos/configuración ficticios.
- Reutilizar un agente solo para el mismo alcance, modelo y esfuerzo; no resucitar agentes Astra anteriores para trabajo barato. Si Luna no está disponible, declararlo y pedir preferencia en ese momento; no escalar silenciosamente a un modelo más caro.
- Concurrencia máxima por defecto: `min(2, capacidad del runtime)`, sin subdelegación. Agrupar 2-5 puntos relacionados y no lanzar un agente por check. Para documentación pequeña, editar localmente sin ceremonia.
- Hacer una pasada y, como máximo, una corrección acotada por hallazgos. Cada pasada debe limitarse orientativamente a 15-20 consultas focales y un resultado de 300 palabras más tabla/apéndice; si falta evidencia, registrar el hueco y replantear el alcance con el coordinador, sin abandonar el objetivo ni esperar permiso rutinario.
- Los límites son operativos, no cuotas garantizadas. No inventar precios o porcentajes de ahorro ni recurrir a API facturada o resets para este flujo sin petición expresa. Max no garantiza menor consumo. Las auditorías solo leen: no implementan ni mutan sistemas remotos. Seguridad y economía se escalan al coordinador para revisión; usar Max no concede autorizaciones nuevas.

Ejemplo de invocación real para una auditoría de solo lectura:

```json
{
  "task_name": "auditar_issue_123_puntos_a_b",
  "model": "gpt-5.6-luna",
  "reasoning_effort": "max",
  "fork_turns": "none",
  "message": "Rol auditor, solo lectura. ISSUE-123, puntos A-B. Consulta como máximo 15-20 fuentes focales; no edites archivos del repo ni mutes sistemas remotos. Usa la evidencia disponible y registra en /tmp/issue-123-audit.md cada punto con ID, código, local, Stage/Prod, hasta 2 rutas, bloqueo y próximo paso. Sin evidencia informa sin verificar; no conviertas ese estado en pendiente o falla. Devuelve un resumen de hasta 300 palabras y la ruta del resultado."
}
```

Cada reporte debe incluir por punto: ID, código, estado local, Stage/Prod con
fecha y SHA cuando exista, como máximo dos rutas de evidencia, bloqueo y próximo
paso. Un estado sin verificar no equivale a pendiente o falla; documentación
vieja o la ausencia de un archivo no prueba inexistencia. Nunca marcar todo
cerrado solo por health checks o tests unitarios. La tabla de estado vive en
`docs/antes-del-15-seguimiento.md` y las reglas funcionales en
`docs/uki-current-operating-rules.md`; no duplicar esas historias en este
archivo. Los derechos de merge, deploy, secretos y separación Stage/main se
conservan.

### Contrato de fuente única de seguimiento

- El estado y alcance vigente se actualizan en `docs/antes-del-15-seguimiento.md`;
  las reglas funcionales viven en `docs/uki-current-operating-rules.md` y las
  issues solo coordinan tareas vinculadas.
- Tras cada decisión o evidencia, actualiza la misma fila y conserva la fecha,
  URL/artefacto y alcance; no crees estados paralelos en backlog o mapas.
- La decisión explícita del usuario supersede documentación antigua. Una issue
  cerrada, health verde, merge o deploy técnico no equivale a publicación de
  producto.
- Usa pruebas sin repetirlas por ritual y reconcilia conflictos entre fuentes
  antes de responder. Distingue siempre confirmación de usuario, observación
  live y contraste pendiente.

## Project Structure

This is a pnpm monorepo containing multiple applications:

- **`dapp/`** - Main Next.js 15 web application (Hyppie Gaming Platform)
- **`games/sybil-slayer/`** - Next.js game running on port 9002 (Token Runner game)
- **`games/hyppie-road/`** - Next.js game running on port 9003 (Hyppie Road game)
- **`games/tower-builder/`** - Tower Builder game
- **`packages/`** - Shared packages, contracts, chain indexer and card/bridge workers; see `pnpm-workspace.yaml` and each package manifest.

## Development Commands

### Main Application (dapp)
```bash
# Development
pnpm dapp dev                    # Start main app on port 3000
pnpm dapp build                  # Build main app
pnpm dapp lint                   # Run ESLint
pnpm dapp typecheck              # Run TypeScript checks

# Testing
pnpm dapp test                   # Run Jest tests
pnpm dapp test:watch             # Run tests in watch mode
pnpm dapp test:coverage          # Run tests with coverage

# AI/Genkit
pnpm dapp genkit:dev             # Start Genkit development server
pnpm dapp genkit:watch           # Start Genkit in watch mode
```

### Games
```bash
# Sybil Slayer (port 9002)
pnpm sybil-slayer dev
pnpm sybil-slayer build
pnpm sybil-slayer lint
pnpm sybil-slayer typecheck

# Hyppie Road (port 9003)
pnpm --filter hyppie-road dev
pnpm --filter hyppie-road build
pnpm --filter hyppie-road lint
pnpm --filter hyppie-road typecheck
```

### Global Commands
```bash
# Build shortcuts from root
pnpm build:dapp                  # Build main dapp
pnpm build:sybil-slayer          # Build sybil-slayer game
```

## Technology Stack

### Main Application (dapp)
- **Framework**: Next.js 15 with App Router
- **Database**: MongoDB with Prisma ORM
- **Authentication**: NextAuth v5 with Discord/Twitter OAuth
- **Styling**: Tailwind CSS with Radix UI components
- **Web3**: Wagmi + Viem for blockchain integration
- **AI**: Google Genkit for AI features
- **Testing**: Jest with React Testing Library

### Games
- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS with custom UI components
- **State Management**: Zustand (hyppie-road), React hooks (sybil-slayer)
- **Game Logic**: Custom canvas-based implementations

## Database Schema

The application uses MongoDB with Prisma. Key models include:
- `User` - User profiles with wallet addresses, social links, XP, referrals
- `Quest` - Gamification quests with tasks
- `PointTransaction` - Point earning/spending history
- `Account/Session` - NextAuth authentication data

## Authentication Flow

Uses NextAuth v5 with:
- Discord OAuth (primary)
- Twitter OAuth (secondary)
- Wallet-based authentication for Web3 users

## Key Application Features

### Main DApp
- **Dashboard**: User stats, recent activity, featured games
- **Games**: P2P betting games on Hyperliquid
- **Leaderboard**: Top players and rankings
- **Quests**: Gamified reward system
- **Referrals**: User referral system with rewards
- **Points**: Virtual currency system

### Games
- **Sybil Slayer**: Top-down token runner with obstacles (30-second survival)
- **Hyppie Road**: Betting-style game with game state management

## Design System

### Colors
- Primary: Lila (#e45cff)
- Background: Ink violet (#04030a)
- Token/value accent: Gold (#f2c34b)
- Cyan and teal are not part of the current product UI and must not be reintroduced.
- Reference: https://cukiesworld.com/

### Typography
- Headlines: 'Space Grotesk' sans-serif
- Body: 'Inter' sans-serif

### UI Components
- Radix UI primitives with custom styling
- Collapsible sidebar navigation
- Dark theme with glow effects

## Fire rule: staging and production UX

- Staging and production use the same routes, component tree, layout, navigation and customer copy.
- Promotion between environments changes only validated environment variables and external service/contract addresses.
- Never show `stage`, `staging`, `testnet`, chain IDs, collection names, jobs, batches, internal endpoints or deployment state in customer-facing copy.
- Environment-specific branches are allowed only in runtime configuration and safety guards, never to maintain two visual products.
- Validate environment-sensitive work against both supported pairs: `staging + BSC 97` and `production + BSC 56`.

## Fire rule: landing and app shell

- `/` is the public landing and must not render `AppLayout`, the dashboard header or the sidebar.
- Product sections render inside the app shell. This includes Dashboard, Cukie Master, games, Cukie Pool, Cukies, Marketplace, Vesting, Premios and Como jugar.
- `Inicio` and every Cukies logo inside the app shell return to `/`; `/dashboard` is a section, not the public home.
- Never nest `LandingHeader`, `LandingFooter`, `uki-container` or a second full-page `main` inside `AppLayout`. The shell owns navigation and outer spacing.

## Environment Setup

Required environment variables in `dapp/.env.local`:
- `DATABASE_URL` - MongoDB connection string
- `NEXTAUTH_URL` and `NEXTAUTH_SECRET` - NextAuth configuration
- `DISCORD_CLIENT_ID/SECRET` and `DISCORD_GUILD_ID` - Discord OAuth
- `TWITTER_CLIENT_ID/SECRET` - Twitter OAuth
- `IFTTT_WEBHOOK_SECRET` - Webhook integration
- `GAME_SYBILSLASH` - Game URL configuration

## Coolify Deployment

Rolling delivery is active in staging (failure/rollback rehearsal remains tracked in the transition evidence): app32 (`rwwsc4kkwc0ck84cgk40s8kk`) is the dedicated Docker Image web resource; app28 retains workers. Follow [the transition procedure](docs/deployment-rolling-transition.md) and verify the live delivery mode before acting. Production is not enabled until its own resource, configuration and rehearsal are complete.

The DApp image uses a PID1 drain wrapper plus Traefik active readiness checks;
keep both together when changing routing or image startup. A successful deploy
does not prove uninterrupted traffic: retain the measured errors and verify a
replacement in which the retiring image also includes the wrapper. A workers
release currently redeploys web metadata and reconciles the entire Compose.

The active integration deployment is Coolify on VM1001 (`192.168.1.201`) through Traefik/Cloudflare.

- Staging/integration app:
  - Web resource: `cukies-hub-staging-web`, app32, UUID `rwwsc4kkwc0ck84cgk40s8kk`
  - Workers resource: `game-hub-staging`, app28, UUID `u4s804o4wwcckowgk0woo4wg`
  - Branch: `staging`
  - Public URL: `https://cukieshub.eurekand.com`
  - Chain/data: BSC Testnet (`97`), `cukies-hub-staging`, `cukies-legacy-staging`, `cukieshub-new-staging`.
- Production app:
  - Coolify resource: `game-hub`
  - Application ID: `12`
  - UUID: `jookw8ow8woks088s44404ok`
  - Branch: `main`
  - Public URL: `https://cukies.world`

Staging apps 32, 28 and 31 use `.github/workflows/cukies-images.yml`: a push to
`staging` selects affected components, builds on VM1012 with Nx/BuildKit cache,
publishes immutable registry digests and updates web32, game31 or workers28.
Treasure Hunt is a separate Docker Image resource in the same workflow; it stays
outside `docker-compose.workers.yml`. The six image components are listed in
`infrastructure/ci/components.json`. Coolify pulls images; keep its Git autodeploy
OFF and do not start a legacy build manually.

A game-only delivery must preserve Hub web/workers containers. Keep `webCommit`
and `gameCommit` separate from the aggregate release commit and each image's
`sourceSha`. Delivery injects the validated `COOLIFY_BRANCH`; Docker Image does not
supply it automatically. Never weaken the game's environment/resource guard.
Read `docs/deployment-environments.md` for the pipeline and the canonical INFRA
row in `docs/antes-del-15-seguimiento.md` for current runtime evidence.

Production still serves the legacy app12 Compose and app13 Nixpacks resources.
The separate web app33 is provisioned but has not started; the production registry
migration remains inactive. Before the first infrastructure merge into `main`,
follow `docs/deployment-rolling-transition.md`: snapshots, Git autodeploy OFF on
app12/app13 and CI delivery gate false, then verified candidate/cutover. Preserve
current production traffic throughout this preparation.

`docker-compose.coolify.yml` is the topology source; regenerate the image-only
Compose with `node scripts/ci/generate-images-compose.mjs --write` after changing
it and verify with `--check`. Mongo staging lives outside Compose in LXC2007 at
`192.168.1.221:27018`; see `infrastructure/ci/staging-data-handoff.md` for recovery.
Staging services and optional profiles:

- `dapp`: public Next.js app on port `3000`.
- `chain-indexer`: internal blockchain indexer worker.
- `cukie-master-scheduler`, `competition-credit-scheduler`, `game-economy-scheduler`, `cukie-pool-scheduler`, `weekly-ranking-scheduler`, `reward-accounting-scheduler` and `reward-batch-publisher`: internal processes sharing the `schedulers` image. Preserve their independent runtime gates and HMAC credentials; a deployment does not authorize enabling them.
- `cuki-card-worker` and `cuki-card-worker-legacy`: internal NFT render/upload workers sharing the card image, with separate staging data sources and destinations. Generated URLs are content-addressed and immutable.
- `legacy-chain-indexer` and `cukies-bridge-relayer`: optional profiles; their presence in Compose does not mean they are enabled.

Operational rules:

- Do not commit Coolify secrets, AWS keys, Mongo URLs, OAuth secrets, RPC keys or generated `.env` files.
- Store runtime secrets in Coolify environment variables. Local worker secrets can live only in ignored `.env.local` files.
- Before saying a staging worker is deployed, verify app 28 uses `docker-compose.workers.yml`, its running image digest matches the release manifest, and its database endpoint is the staging LXC. The release commit can differ from an image's `sourceSha` when CI reuses it; compare each digest with the manifest. A green build alone does not verify runtime.
- Workers do not need public domains or Traefik labels; only `dapp` should be proxied.
- Staging must use `DATABASE_URL` -> `cukies-hub-staging`, `CUKIES_DATABASE_URL` -> `cukies-legacy-staging`, and `CHAIN_INDEXER_DB_NAME`/`CARD_WORKER_DB_NAME` -> `cukieshub-new-staging`.
- App 28 uses `COMPOSE_PROFILES=staging-runtime,card-worker,legacy-card-worker`. Preserve each worker's exclusive staging bucket and credentials; do not copy them to another resource. `CARD_WORKER_UPLOAD=true` requires the storage guard to pass.
- Both card workers require a capacity heartbeat younger than 45 seconds and at least 10 GiB free on Coolify and MinIO. They pause and retry automatically; do not lower the floor or clear volumes to bypass it. Follow the storage recovery section in `docs/deployment-environments.md`.
- Validate post-deploy with `/api/health`, authenticated `/indexer` views for `chain_indexer_runs` and `card_generation_jobs`, and indexer/both card-worker logs. Inspect only needed metadata; full Docker history or environment output can contain secrets.
- Use the `coolify-cloudflare` skill when changing Coolify, Traefik labels, domains, tunnels or deployment topology.

## Testing

The main dapp has comprehensive Jest tests covering:
- API routes (`__tests__/api/`)
- React components (`__tests__/components/`)
- Hooks (`__tests__/hooks/`)
- Utilities (`__tests__/lib/`)
- Providers (`__tests__/providers/`)

Test configuration excludes API routes and type definitions from coverage.

## File Structure Conventions

### Main App (dapp)
- `src/app/` - Next.js App Router pages and layouts
- `src/components/` - React components (layout, UI, shared)
- `src/lib/` - Utility functions and configurations
- `src/providers/` - React context providers
- `src/hooks/` - Custom React hooks
- `src/types/` - TypeScript type definitions
- `prisma/` - Database schema and migrations

### Games
- `src/components/` - Game-specific components
- `src/hooks/` - Game logic hooks
- `src/lib/` - Game utilities and logic
- `src/types/` - Game type definitions

## Professional GitHub Issue Workflow

Use this workflow when the user asks to work from GitHub issues, continue the roadmap, execute a milestone, triage the backlog, or operate autonomously.

### Operating Context

- Repository: `fgomezserna/cukies-hub`.
- Prefer GitHub structured tools when available. Use `gh` for gaps such as milestones, issue lists, branch PR discovery, check status, merge and CLI-only operations.
- Do not treat epics as implementation tasks unless they explicitly contain executable acceptance criteria. Prefer leaf task issues linked from an epic checklist.
- Keep the issue thread as the source of coordination: if you start, block, finish, split, or supersede work, comment on the issue.

### Backlog Triage and Priority Selection

When no specific issue is provided, inspect the live GitHub roadmap before choosing work. Do not infer priority from a flat issue list alone.

```bash
source ~/.zshrc >/dev/null 2>&1 && gh issue list --repo fgomezserna/cukies-hub --state open --limit 100 --json number,title,labels,milestone,assignees,updatedAt
```

First read the active milestones:

```bash
source ~/.zshrc >/dev/null 2>&1 && gh api repos/fgomezserna/cukies-hub/milestones --paginate --jq '.[] | {number,title,state,open_issues,closed_issues,due_on,updated_at,description}'
```

Then group open issues by milestone so the current phase is explicit:

```bash
source ~/.zshrc >/dev/null 2>&1 && gh issue list --repo fgomezserna/cukies-hub --state open --limit 200 --json number,title,labels,milestone,updatedAt --jq 'group_by(.milestone.title // "Sin milestone")[] | {milestone: (.[0].milestone.title // "Sin milestone"), count: length, issues: map({number,title,labels: [.labels[].name]})}'
```

Choose work in this order:

1. User-specified issue, PR, milestone or explicit instruction.
2. The earliest active launch milestone by the current GitHub milestone order, not by stale milestone names written in old issue bodies.
3. Unblocked `priority:p0` leaf issues inside that earliest active milestone.
4. Read the live coordination issue and recent epic comments before choosing communication, branding, UX or public-shell work. Follow the approved brand direction before final visual implementation.
5. Treat milestone names, issue priorities and visual approval state as live GitHub data. Do not carry forward a historical launch phase or issue number as permanent priority.
6. Leaf task issues before parent epics.
7. Issues with clear acceptance criteria before ambiguous issues.
8. If an issue has `blocked`, `needs-validation`, missing product decisions, missing legal approval, or an unapproved UX image gate, do not implement beyond safe discovery/spec work. Comment what is blocked and what decision is needed.

Before selecting an issue, read its parent epic, child checklist, labels, milestone and recent comments. Recent comments are mandatory because roadmap changes and priority corrections are coordinated there:

```bash
source ~/.zshrc >/dev/null 2>&1 && gh issue view <number> --repo fgomezserna/cukies-hub --comments --json number,title,body,labels,milestone,assignees,state,comments
```

If the candidate belongs to an epic, also read the epic issue and recent comments before recommending or starting work. For communication, restyling, landing or UX image work, read the currently assigned coordination epic and its approval decisions.

### Issue Intake

For each issue you take:

1. Confirm the scope, acceptance criteria, dependencies and affected apps/packages.
2. Check the working tree and never overwrite unrelated user changes.
3. Create a focused branch:
```bash
git switch -c codex/issue-<number>-short-slug
```
4. Comment on the issue before substantial work:
```text
Trabajo iniciado en `codex/issue-<number>-short-slug`.
Plan:
- ...
Validacion prevista:
- ...
```
5. If the issue is too large, split it into smaller child issues and link them from the parent instead of producing a broad, risky patch.

### Delegación con subagentes

La sección de flujo por defecto anterior es la política única de delegación. Prioriza alcances acotados e independientes y conserva en el coordinador la integración, revisión, actualizaciones de GitHub y cierre. Si un trabajo dependiente o ambiguo puede delimitarse con seguridad, el coordinador fija ese alcance y delega su ejecución. Si las herramientas de delegación no están disponibles, comunica la limitación y avanza la decisión o el plan; no hagas fallback automático a Astra ni a implementación cara.

### Implementation Rules

- Use repo patterns first. Do not introduce new architecture, dependencies, state libraries or contract frameworks unless the issue requires it or the repo already established it.
- For frontend work, respect the UX image gate:
  - If the issue requires UX imagery, propose the image prompt in the issue.
  - Wait for explicit user approval before generating an image.
  - Do not implement final visual styling from an unapproved generated image.
  - Backend/API work may proceed if it does not depend on visual approval.
- For contracts/economy work, separate on-chain and off-chain responsibilities clearly:
  - BSC: token, presale, vesting, UKI staking, rewards claim.
  - Mongo/backend: NFT inventory, credits, sessions, ranking, rewards calculation, snapshots.
- For game economy, avoid hardcoding Treasure Hunt as the only game. Use multi-game config boundaries where possible.
- Do not commit secrets, `.env` contents, private keys, RPC secrets, OAuth credentials, database dumps or generated build artifacts.

### Verification

Run the smallest reliable validation set for the touched area:

- Ejecuta checks focales durante el parche. Los checks completos exigidos se ejecutan una vez por lote y SHA final, no una vez por worker; repítelos solo si cambios o fallos lo justifican. Para cambios solo documentales no añadas tests de producto; valida formato, diff y coherencia del documento.

- DApp changes:
```bash
pnpm dapp lint
pnpm dapp typecheck
pnpm dapp test
```

- Sybil Slayer changes:
```bash
pnpm sybil-slayer lint
pnpm sybil-slayer typecheck
```

- Hyppie Road changes:
```bash
pnpm --filter hyppie-road lint
pnpm --filter hyppie-road typecheck
```

- Root build checks when shared behavior changes:
```bash
pnpm build:dapp
pnpm build:sybil-slayer
pnpm build:hyppie-road
```

If a command is missing, broken for unrelated reasons, or blocked by environment, state that in the issue comment and final response. Do not imply checks passed if they were not run.

### Commit, PR and Merge

Commit only the files needed for the issue. Do not stage unrelated dirty files.

Use clear commit messages:

```bash
git add <files>
git commit -m "fix: resolve issue <number> short summary"
```

Push the branch and open a draft PR unless the user explicitly asked for a ready PR:

```bash
git push -u origin codex/issue-<number>-short-slug
gh pr create --repo fgomezserna/cukies-hub --draft --title "<title>" --body "<summary>"
```

PR body must include:

- Linked issue: `Closes #<number>` only when the PR fully resolves it.
- Summary of changes.
- Validation commands and results.
- Risks, follow-ups and any blocked items.
- Screenshots or approved generated images for UX changes when relevant.

Autorizacion permanente del usuario para staging (8 de septiembre de 2026):
una peticion de implementar o corregir incluye commit, push, merge a `staging`
y despliegue de la app 28, sin pedir una confirmacion adicional para esos pasos.
Completa la entrega comprobando el SHA servido y el comportamiento afectado;
un parche local o una PR abierta no son una entrega terminada. Conserva los
checks y revisiones exigidos. Esta autorizacion no incluye `main`/produccion,
operaciones destructivas ni trabajos fuera del alcance solicitado; una peticion
solo de auditoria sigue siendo de lectura.

Do not merge unless all of these are true:

1. The user asked for merge or the staging authorization above applies; other targets need their own authorization.
2. Required checks pass or failures are understood and accepted.
3. The PR fully satisfies the linked issue acceptance criteria.
4. No unresolved review comments remain.

Preferred merge style is squash merge unless the repository/user specifies otherwise:

```bash
gh pr merge <number> --squash --delete-branch
```

### Issue Comments and Closure

When work is complete, comment on the issue with:

```text
Resuelto en PR #<pr-number> / branch `<branch>`.

Resumen:
- ...

Validacion:
- `pnpm ...` OK
- ...

Notas:
- ...
```

Close the issue only after the resolving PR is merged, or if the user explicitly instructs closing without merge. For parent epics, close only when all child issues are closed or intentionally marked not planned.

If the issue cannot be completed, leave it open and comment:

- what was done,
- what blocks it,
- exact decision or dependency needed,
- recommended next issue to pick.

### Senior Worker Behavior

- Challenge issue order when the backlog order conflicts with launch reality. For example, communication/UX/restyling work can precede backend if it unblocks public launch messaging.
- Prefer a small complete vertical slice over a large unfinished refactor.
- Keep the issue graph clean: create child issues for discovered work, link blockers, and avoid closing epics prematurely.
- Review your own diff as if reviewing another engineer: look for regressions, missing tests, broken UX states, security leaks and accidental scope creep.
