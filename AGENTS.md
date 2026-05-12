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

When no specific issue is provided, inspect open issues before choosing work:

```bash
source ~/.zshrc >/dev/null 2>&1 && gh issue list --repo fgomezserna/cukies-hub --state open --limit 100 --json number,title,labels,milestone,assignees,updatedAt
```

Choose work in this order:

1. User-specified issue, PR, milestone or explicit instruction.
2. Unblocked `priority:p0` issues in the earliest active milestone.
3. For the UKI launch, prioritize `M0.5 - Comunicacion, UX y restyling` before contracts/backend because communication must start early.
4. Leaf task issues before parent epics.
5. Issues with clear acceptance criteria before ambiguous issues.
6. If an issue has `blocked`, `needs-validation`, missing product decisions, missing legal approval, or an unapproved UX image gate, do not implement beyond safe discovery/spec work. Comment what is blocked and what decision is needed.

Before selecting an issue, read its parent epic, child checklist, labels, milestone and recent comments:

```bash
source ~/.zshrc >/dev/null 2>&1 && gh issue view <number> --repo fgomezserna/cukies-hub --comments --json number,title,body,labels,milestone,assignees,state,comments
```

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
gh pr create --repo fgomezserna/cukies-hub --draft --title "<title>" --body "<summary>"
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
