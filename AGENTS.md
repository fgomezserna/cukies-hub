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

## Project Structure

This is a pnpm monorepo containing multiple applications:

- **`dapp/`** - Main Next.js 15 web application (Hyppie Gaming Platform)
- **`games/sybil-slayer/`** - Next.js game running on port 9002 (Token Runner game)
- **`games/hyppie-road/`** - Next.js game running on port 9003 (Hyppie Road game)
- **`packages/`** - Shared packages and utilities

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
- Primary: Teal (#008080)
- Background: Dark gray (#253533)
- Accent: Neon green (#44edd6)
- Reference: https://cukiesworld.com/

### Typography
- Headlines: 'Space Grotesk' sans-serif
- Body: 'Inter' sans-serif

### UI Components
- Radix UI primitives with custom styling
- Collapsible sidebar navigation
- Dark theme with glow effects

## Environment Setup

Required environment variables in `dapp/.env.local`:
- `DATABASE_URL` - MongoDB connection string
- `NEXTAUTH_URL` and `NEXTAUTH_SECRET` - NextAuth configuration
- `DISCORD_CLIENT_ID/SECRET` and `DISCORD_GUILD_ID` - Discord OAuth
- `TWITTER_CLIENT_ID/SECRET` - Twitter OAuth
- `IFTTT_WEBHOOK_SECRET` - Webhook integration
- `GAME_SYBILSLASH` - Game URL configuration

## Coolify Deployment

The active integration deployment is Coolify on VM1001 (`192.168.1.201`) through Traefik/Cloudflare.

- Staging/integration app:
  - Coolify resource: `game-hub-staging`
  - Application ID: `28`
  - UUID: `u4s804o4wwcckowgk0woo4wg`
  - Branch: `staging`
  - Public URL: `https://cukieshub.eurekand.com`
  - Chain/data: BSC Testnet (`97`), `cukies-hub-staging`, `cukies-legacy-staging`, `cukieshub-new-staging`.
- Production app:
  - Coolify resource: `game-hub`
  - Application ID: `12`
  - UUID: `jookw8ow8woks088s44404ok`
  - Branch: `main`
  - Public URL: `https://cukies.world`

Use `docker-compose.coolify.yml` for the new hub deployment. It defines:

- `dapp`: public Next.js app on port `3000`.
- `chain-indexer`: internal blockchain indexer worker.
- `cukie-master-scheduler`, `competition-credit-scheduler`, `game-economy-scheduler`, `cukie-pool-scheduler`, `weekly-ranking-scheduler`: internal economy schedulers, disabled until their runtime gates and HMAC credentials are approved.
- `cuki-card-worker`: internal NFT card renderer/uploader worker. It is active in app 28 against the isolated staging Mongo/MinIO destination; generated URLs are content-addressed and immutable.

Operational rules:

- Do not commit Coolify secrets, AWS keys, Mongo URLs, OAuth secrets, RPC keys or generated `.env` files.
- Store runtime secrets in Coolify environment variables. Local worker secrets can live only in ignored `.env.local` files.
- Before saying a worker is deployed, verify the actual Coolify resource is using `docker-compose.coolify.yml`, not a single Nixpacks app.
- Workers do not need public domains or Traefik labels; only `dapp` should be proxied.
- Staging must use `DATABASE_URL` -> `cukies-hub-staging`, `CUKIES_DATABASE_URL` -> `cukies-legacy-staging`, and `CHAIN_INDEXER_DB_NAME`/`CARD_WORKER_DB_NAME` -> `cukieshub-new-staging`.
- In app 28, `CARD_WORKER_UPLOAD=true` and `COMPOSE_PROFILES=card-worker` are allowed only with the exclusive `cukies-cards-staging` bucket, staging-only credentials and the guard validated. Do not copy those values or credentials to another resource.
- Validate post-deploy with `/api/health`, `/indexer?collection=chain_indexer_runs`, `/indexer?collection=card_generation_jobs`, and worker logs for `chain-indexer` and `cuki-card-worker`.
- Use the `coolify-cloudflare` skill when changing Coolify, Traefik labels, domains, tunnels or deployment topology.

## Branch and Release Governance

This section is the authoritative branch policy for the active Coolify topology. It overrides older repository documentation that still describes `main -> staging` or `production -> live`.

### Active Topology and Branch Roles

| Branch | Role | Deployment rule |
| --- | --- | --- |
| `codex/issue-<number>-<slug>` | One isolated issue or task. | Create from current `origin/staging`; open a PR to `staging`. Never deploy to production. |
| `staging` | Shared integration and QA branch. | Deploys to `game-hub-staging` / `https://cukieshub.eurekand.com`, BSC Testnet and staging databases. |
| `main` | Production/live branch. | Deploys to `game-hub` / `https://cukies.world`, BSC mainnet and production data. It is not a development branch. |
| `hotfix/*` | Emergency exception created from current `origin/main`. | May target `main` only with formal incident evidence, approvals, checks and rollback. |
| `sync/main-<sha>` | Mandatory ancestry sync after every merge to `main`. | Targets `staging` and must use a merge commit. It never substitutes staging validation. |

Legacy/Fallback:

- The remote `production` branch is a historical placeholder and is not the active production source. Do not branch from it, merge into it or deploy it unless the user explicitly changes the topology.
- `master`, `versionmovil1`, `cambios-*`, old `feat/*`, `feature/*` and old game `*/dev` branches are historical. Do not reuse them for new work.
- The checked-in versions of `docs/release-workflow.md` and `docs/deployment-environments.md` still contain the superseded `main -> staging` / `production -> live` model. Use this section and the latest coordination for issue `#232` until the reviewed replacement is merged.

### Current Enforcement Status

- As verified on 2026-08-28, GitHub branch protection is not active on `main` or `staging`.
- PRs `#236`, `#238` and `#239` contain the draft release gate, CI gate and security stack; draft code or passing preview checks do not mean those controls are active.
- Until protection is applied, treat both branches as manually protected: no direct push, force-push, reset, rebase, deletion or merge outside this policy, even if GitHub technically allows it.
- Before any merge to `staging` or `main`, inspect the current base, checks and protection instead of trusting this dated observation.

```bash
source ~/.zshrc >/dev/null 2>&1 && git fetch origin --prune
source ~/.zshrc >/dev/null 2>&1 && gh api repos/fgomezserna/cukies-hub/branches/main/protection
source ~/.zshrc >/dev/null 2>&1 && gh api repos/fgomezserna/cukies-hub/branches/staging/protection
```

Absence of protection is a blocker to automatic or unattended merges, not permission to bypass review.

### Starting Work

1. Fetch and prune before choosing a base. Inspect the current branch, dirty files and registered worktrees.
2. Never start new work from a stale local `main`, stale local `staging`, another feature branch or an old worktree.
3. Create one branch per leaf issue from the exact current `origin/staging` commit:

```bash
source ~/.zshrc >/dev/null 2>&1 && git fetch origin --prune
git switch -c codex/issue-<number>-<slug> --no-track origin/staging
```

4. If the current checkout has unrelated or uncommitted work, create a separate worktree instead of switching or stashing another person's changes:

```bash
git worktree add <safe-sibling-path> -b codex/issue-<number>-<slug> origin/staging
```

5. At the first meaningful commit, push with upstream and open a draft PR to `staging`. Do not leave durable work on a local-only branch:

```bash
git push -u origin codex/issue-<number>-<slug>
gh pr create --repo fgomezserna/cukies-hub --base staging --head codex/issue-<number>-<slug> --draft
```

6. Stacked branches are exceptional. Document the dependency and PR bases explicitly; never build an undocumented chain of feature branches.

### Normal Promotion: Feature to Staging to Main

1. A normal feature PR targets `staging`, never `main`.
2. Before marking it ready, update it from current `origin/staging`, run the checks for the touched area and record results in the PR.
3. Merge an approved feature PR to `staging` using squash merge and delete its remote branch.
4. Deploy the exact `staging` SHA. Record full SHA, deploy/run ID, `/api/health`, smoke results and any testnet evidence.
5. A staging validation belongs to one immutable SHA. Any later merge into `staging` invalidates the previous release evidence and requires redeploy plus validation.
6. Before promotion, audit the entire delta. Every commit and PR in `origin/main..origin/staging` must belong to the approved release; one unapproved change blocks the whole promotion.

```bash
source ~/.zshrc >/dev/null 2>&1 && git fetch origin --prune
git log --oneline --decorate origin/main..origin/staging
git diff --stat origin/main..origin/staging
gh pr list --repo fgomezserna/cukies-hub --base staging --state merged
```

7. Production promotion is one PR from `staging` to `main`. Do not cherry-pick a feature, retarget a feature PR or open `codex/issue-* -> main`.
8. Merge to `main` requires explicit user/release authority, approved staging evidence, required checks, resolved review comments, rollback plan and a reviewed production diff.
9. After the live merge, verify the exact production SHA and run the production health/smoke checks before declaring success.
10. After every merge to `main`, create `sync/main-<short-sha>` from `main` and merge it to `staging` using **Create a merge commit**. Do not squash or rebase this sync, because `main` must remain an ancestor of `staging`.
11. A release is incomplete while the `main -> staging` sync PR or post-deploy verification remains pending.

If `staging` contains an unready change, block promotion. Revert or finish that change in `staging`; never bypass staging by moving only the desired feature directly to `main`.

### Hotfix Exception

Use a hotfix only for a production incident that cannot wait for the normal staging cycle.

1. Create `hotfix/<issue-or-incident>-<slug>` from the exact current `origin/main`.
2. Open the PR directly to `main` and add the `hotfix` label as a visible signal. The authorization record must include incident, impact, urgency, why staging cannot wait, validation performed and rollback. Label and PR body alone never authorize the merge; when the release gate is active, its commit-bound manifest is the source of authorization.
3. A hotfix still requires explicit approval, relevant checks and a reviewed production diff. It bypasses prior staging evidence only; it does not bypass review or verification.
4. After merge, immediately create the `sync/main-<sha> -> staging` PR and merge it with a merge commit.
5. Deploy and smoke-test staging after the sync. Do not close the incident or delete the local recovery branch until production verification and staging backport are complete.

### Branch and Worktree Hygiene

- Never commit directly on `main` or `staging`; local copies only mirror their remotes through fast-forward updates.
- Never rewrite shared history. Rebase is allowed only on a local, unpublished branch; never force-push without explicit user approval.
- One issue maps to one branch and one PR. Split oversized work instead of accumulating unrelated changes.
- A branch that must survive the current session needs an upstream and a draft PR or an explicit WIP handoff with branch, SHA, dirty state and next action.
- Delete the source branch immediately after its PR is merged and verified. Do not keep branches as archives; GitHub PRs, tags and merge history are the archive.
- Remove a worktree only after `git status --short` is empty or its changes have an explicitly verified backup.
- After branch deletion, prune remote refs and stale worktree metadata:

```bash
git fetch --all --prune
git worktree prune
```

- At the start and end of issue work, inspect branch/worktree hygiene:

```bash
git status --short --branch
git branch -vv
git worktree list --porcelain
gh pr list --repo fgomezserna/cukies-hub --state open --limit 100
```

- An upstream marked `[gone]` must be resolved during the same cleanup pass: delete it if the PR is merged/equivalent and no worktree uses it, or push/reconnect it if it contains active work.
- Never delete a branch solely because `git branch --merged` says it is unmerged or merged; squash merges make ancestry misleading. Before deletion, check PR state, `git cherry`, unique commits, upstream, worktrees and dirty files.
- A branch with unique commits and no open PR is a manual-review blocker. Preserve it and report its branch name and SHAs instead of guessing.
- Never run broad branch deletion loops against unresolved targets. Produce the exact candidate list first and preserve active PR heads, protected branches and every branch checked out in a worktree.

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
4. For the current UKI launch roadmap, `Phase 0 - Landing live, compra cerrada` is the first active phase. It includes communication, architecture of information, landing, system visual, disclaimers, data audit and public assets.
5. Inside Phase 0, follow the live coordination issue and comments before implementation. The current correction of focus is: close branding and communication foundations before generating more screens or implementing final visual styling.
6. For `#141 [UKI-004] Comunicacion, restyling y sistema visual de lanzamiento`, the required order is:
   - inventory of the current website and existing visual assets,
   - brand DNA: what stays, what is modernized and what is discarded,
   - approved UKI launch brand direction,
   - approved brand board,
   - only then home, presale, dashboard and other sections.
7. If a proposal looks like a presentation/deck instead of a navigable landing, reject that direction and return to visual system and structure.
8. Do not treat `M0.5`, `M7` or other old milestone names inside issue bodies as authoritative when GitHub milestones have been reorganized into Phase 0-5. The current GitHub milestone assignment and recent epic comments override stale body text.
9. Leaf task issues before parent epics.
10. Issues with clear acceptance criteria before ambiguous issues.
11. If an issue has `blocked`, `needs-validation`, missing product decisions, missing legal approval, or an unapproved UX image gate, do not implement beyond safe discovery/spec work. Comment what is blocked and what decision is needed.

Before selecting an issue, read its parent epic, child checklist, labels, milestone and recent comments. Recent comments are mandatory because roadmap changes and priority corrections are coordinated there:

```bash
source ~/.zshrc >/dev/null 2>&1 && gh issue view <number> --repo fgomezserna/cukies-hub --comments --json number,title,body,labels,milestone,assignees,state,comments
```

If the candidate belongs to an epic, also read the epic issue and recent comments before recommending or starting work. For UKI Phase 0, read at minimum `#141` before choosing any communication, restyling, landing, UX image or public-shell task.

### Issue Intake

For each issue you take:

1. Confirm the scope, acceptance criteria, dependencies and affected apps/packages.
2. Check the working tree and never overwrite unrelated user changes.
3. Fetch and create a focused branch from the exact current `origin/staging`:
```bash
source ~/.zshrc >/dev/null 2>&1 && git fetch origin --prune
git switch -c codex/issue-<number>-short-slug --no-track origin/staging
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

### Delegation With Sub-Agents

The main agent decides whether to use sub-agents in each case. Do not ask the user to decide this by default. Use senior engineering judgment based on scope, independence of tasks, risk and expected speedup.

- The main agent acts as tech lead: triage, architecture, risk control, final review, integration, GitHub comments and closure.
- Use sub-agents when work can be split into bounded, independent tasks with disjoint write scopes.
- Keep work local when the task is tightly coupled, ambiguous, urgent on the critical path, or too risky to delegate cleanly.
- Give each worker:
  - exact issue number and goal,
  - files/modules they own,
  - files/modules they must not touch,
  - acceptance criteria,
  - required validation command,
  - instruction not to revert or overwrite work by others.
- Do not delegate the immediate blocker if the main agent needs that result before doing anything else.
- Review every worker patch before commit. The main agent remains accountable for coherence, tests and issue updates.
- If the current runtime does not provide sub-agents or parallel delegation tools, continue locally and mention that limitation only if it affects delivery.

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
gh pr create --repo fgomezserna/cukies-hub --base staging --head codex/issue-<number>-short-slug --draft --title "<title>" --body "<summary>"
```

PR body must include:

- Linked issue: `Closes #<number>` only when the PR fully resolves it.
- Summary of changes.
- Validation commands and results.
- Risks, follow-ups and any blocked items.
- Screenshots or approved generated images for UX changes when relevant.

Do not merge unless all of these are true:

1. The user asked for merge or the current operating mode explicitly grants merge authority.
2. Required checks pass or failures are understood and accepted.
3. The PR fully satisfies the linked issue acceptance criteria.
4. No unresolved review comments remain.
5. The source and target comply with `Branch and Release Governance`.

Merge strategy depends on the branch role:

```bash
# Normal feature PR: codex/issue-* -> staging
gh pr merge <number> --squash --delete-branch
```

- `staging -> main`: use only the reviewed release/promotion method allowed by the active gate.
- `sync/main-* -> staging`: use **Create a merge commit**; never squash or rebase it.
- `hotfix/* -> main`: follow the formal hotfix exception and mandatory sync back to `staging`.

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
