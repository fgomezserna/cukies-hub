# Hyppie DApp

This is a NextJS DApp for Hyppie Gaming Platform.

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Database - Primary database (Prisma)
DATABASE_URL="mongodb://admin:changeme123@192.168.1.221:27017/cukies-hub?authSource=admin"

# Database - Legacy database (cukies with users and characters)
CUKIES_DATABASE_URL="mongodb://admin:changeme123@192.168.1.221:27017/cukies?authSource=admin"

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

# Telegram Bot
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
TELEGRAM_CHAT_ID="your-telegram-group-chat-id"
TELEGRAM_GROUP_INVITE="https://t.me/your-group-invite"

# Social Media URLs (for frontend)
NEXT_PUBLIC_TWITTER_PROFILE_URL="https://x.com/hyppieliquid"
NEXT_PUBLIC_DISCORD_INVITE_URL="https://discord.gg/your-invite-code"

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

### Setting up Telegram Bot

To set up Telegram verification:
1. Create a new bot by messaging @BotFather on Telegram
2. Use the `/newbot` command and follow the instructions
3. Save the bot token as `TELEGRAM_BOT_TOKEN`
4. Add the bot to your Telegram group as an administrator
5. Get the chat ID by sending a message to your group, then visiting: `https://api.telegram.org/bot<YourBotToken>/getUpdates`
6. Find the chat ID in the response and save it as `TELEGRAM_CHAT_ID`

## Database Configuration

This project uses two MongoDB databases:

1. **cukies-hub**: Primary database managed with Prisma (for new features)
2. **cukies**: Legacy database with existing users and characters (cukies)

See [docs/database-setup.md](./docs/database-setup.md) for detailed information about database structure and usage.

## Getting Started

To get started, take a look at src/app/page.tsx.
