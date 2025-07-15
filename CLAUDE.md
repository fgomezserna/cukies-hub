# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Reference: https://hyppieliquid.com/

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