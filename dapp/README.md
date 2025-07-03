# Hyppie DApp

This is a NextJS DApp for Hyppie Gaming Platform.

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="mongodb://..."

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"

# Discord OAuth
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"
DISCORD_GUILD_ID="your-discord-server-id"
DISCORD_INVITE_URL="https://discord.gg/your-invite-code"

# Twitter OAuth  
TWITTER_CLIENT_ID="your-twitter-client-id"
TWITTER_CLIENT_SECRET="your-twitter-client-secret"

# Webhooks
IFTTT_WEBHOOK_SECRET="super-secret-value"

# Games
GAME_SYBILSLASH="https://hyppie-games-sybilslayer.vercel.app/"
```

### Getting Discord Guild ID

To get your Discord server ID:
1. Enable Developer Mode in Discord (User Settings > Advanced > Developer Mode)
2. Right-click on your server name
3. Select "Copy Server ID"

## Getting Started

To get started, take a look at src/app/page.tsx.
