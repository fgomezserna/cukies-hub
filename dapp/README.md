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
NEXT_PUBLIC_TWITTER_PROFILE_URL="https://x.com/cukiesworld"
NEXT_PUBLIC_DISCORD_INVITE_URL="https://discord.gg/your-invite-code"

# Webhooks
IFTTT_WEBHOOK_SECRET="super-secret-value"

# Games
GAME_SYBILSLASH="https://hyppie-games-sybilslayer.vercel.app/"

# Treasure Hunt · competición de preventa (fechas UTC pendientes de decisión)
TREASURE_HUNT_COMPETITION_ENABLED="false"
TREASURE_HUNT_COMPETITION_ID="uki-presale-treasure-hunt-2026"
TREASURE_HUNT_COMPETITION_RULES_VERSION="1"
TREASURE_HUNT_COMPETITION_PRESALE_ADDRESS="0x..."
TREASURE_HUNT_COMPETITION_STARTS_AT="YYYY-MM-DDTHH:mm:ss.000Z"
TREASURE_HUNT_COMPETITION_ENDS_AT="YYYY-MM-DDTHH:mm:ss.000Z"
TREASURE_HUNT_COMPETITION_PROOF_SECRET="generate-a-unique-random-proof-secret-32-plus"
TREASURE_HUNT_COMPETITION_ALIAS_SECRET="generate-a-different-random-alias-secret-32-plus"
TREASURE_HUNT_COMPETITION_REVIEW_SECRET="generate-a-third-random-review-secret-32-plus"
TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET="generate-a-fourth-random-settlement-secret-32-plus"
```

La competición falla cerrada: mientras falten fechas válidas o
`TREASURE_HUNT_COMPETITION_ENABLED` no sea `true`, las partidas 1P siguen siendo
jugables como práctica pero no se guardan en el ranking de preventa. Las fechas de
inicio y cierre deben coincidir con la ventana de compras usada para formar el pool.
La dirección de preventa queda persistida como parte inmutable de la campaña y del
snapshot. Si no se define la variable dedicada, el servidor intenta, por este orden,
`CHAIN_INDEXER_PRESALE_ADDRESS` y `NEXT_PUBLIC_UKI_PRESALE_ADDRESS`; si ninguna es
válida, la competición queda desconfigurada. DApp e indexador deben apuntar al mismo
contrato: cursores, eventos y compras de cualquier otra dirección se excluyen.
Antes de abrir la campaña, el indexador debe arrancar o retrocederse de forma
controlada a un `CHAIN_INDEXER_START_BSC_BLOCK` cuya marca temporal sea anterior o
igual al inicio. Un cursor antiguo sin origen de cobertura, o creado con bloque
inicial `0` después de empezar la campaña, no habilita el cierre retroactivamente.
Los cuatro secretos se configuran sólo en el servidor y no deben reutilizarse entre sí.

Cada partida finalizada queda primero en revisión. Las operaciones internas usan
`Authorization: Bearer <TREASURE_HUNT_COMPETITION_REVIEW_SECRET>`:

- `GET /api/internal/games/treasure-hunt/competition/review?limit=100` lista la
  cola de revisión.
- `GET /api/internal/games/treasure-hunt/competition/review/:attemptId` devuelve
  el intento y sus evidencias de checkpoints.
- `POST /api/internal/games/treasure-hunt/competition/review/:attemptId` decide
  el intento con un cuerpo como
  `{ "decision": "valid", "reason": "revisión completada" }`.
  `decision` también puede ser `invalid`; la operación es idempotente para la
  misma decisión y rechaza adjudicaciones contradictorias. El auditor se deriva
  de una huella no reversible de la credencial de revisión; el cliente no puede
  suplantarlo mediante el cuerpo de la petición.

El cierre se ejecuta mediante `POST` a
`/api/internal/games/treasure-hunt/competition/settle` con
`Authorization: Bearer <TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET>`. Sólo
crea un snapshot auditable y planes de vesting; no envía transacciones. Falla
cerrada hasta que el indexador BSC acredite cobertura desde antes del inicio y haya
recorrido un bloque posterior al fin de campaña para el contrato configurado, no
queden compras pendientes de proyectar, no haya finales por
reconciliar y estén adjudicadas las partidas que podrían ocupar el top 5 de una
wallet con compras durante la ventana.

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
