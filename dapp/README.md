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

# Treasure Hunt · competición por staking UKI
TREASURE_HUNT_COMPETITION_ENABLED="false" # true sólo durante la ventana QA autorizada
TREASURE_HUNT_COMPETITION_ID="uki-staking-testnet-2026-08"
TREASURE_HUNT_COMPETITION_RULES_VERSION="1"
TREASURE_HUNT_COMPETITION_ELIGIBILITY_KIND="uki_staking"
TREASURE_HUNT_COMPETITION_STAKING_ADDRESS="0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205"
TREASURE_HUNT_COMPETITION_STAKE_PER_ATTEMPT_RAW="2000000000000000000000"
TREASURE_HUNT_COMPETITION_TOP_ATTEMPTS_PER_WALLET="10"
TREASURE_HUNT_COMPETITION_POINTS_PER_TICKET="100"
TREASURE_HUNT_COMPETITION_BASE_PRIZE_UKI_RAW="50000000000000000000000"
TREASURE_HUNT_COMPETITION_STAKE_PRIZE_BPS="1000"
TREASURE_HUNT_COMPETITION_PRIZE_PER_WINNER_UKI_RAW="10000000000000000000000"
TREASURE_HUNT_COMPETITION_MAX_WINS_PER_WALLET="1"
TREASURE_HUNT_COMPETITION_INDEXER_MAX_AGE_MS="300000"
TREASURE_HUNT_COMPETITION_STARTS_AT="2026-08-26T00:00:00.000Z"
TREASURE_HUNT_COMPETITION_ENDS_AT="2026-09-15T15:00:00.000Z"
TREASURE_HUNT_COMPETITION_PROOF_SECRET="generate-a-unique-random-proof-secret-32-plus"
TREASURE_HUNT_COMPETITION_ALIAS_SECRET="generate-a-different-random-alias-secret-32-plus"
TREASURE_HUNT_COMPETITION_REVIEW_SECRET="generate-a-third-random-review-secret-32-plus"
TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET="generate-a-fourth-random-settlement-secret-32-plus"
TREASURE_HUNT_COMPETITION_DRAW_SEED="0x...32-bytes-from-a-public-post-close-source"
```

La competición falla cerrada: solo permite iniciar cuando el indexador de staking
está saludable y confirmado. Cada 2.000 UKI completos concede un intento, consumido
al iniciar. Cualquier evento `Unstaked` proyectado dentro de la ventana descalifica
permanentemente la wallet, aunque vuelva a depositar. DApp e indexador deben apuntar
al mismo contrato, chain, bloque de despliegue y hash de runtime. Usa un ID de campaña
nuevo para cada prueba: la configuración persistida es inmutable y el servidor
rechaza drift.

Para staging BSC Testnet se reutiliza `UKIStaking`
`0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205`; no hay que redesplegarlo. El indexador
debe incluir `UKI_STAKING`, usar chain `97`, 12 confirmaciones, deployment/start block
`123359165` y runtime hash
`0xb4976a78dc9d9792842ce7d6a8fa689bc187661cf7c076753e326fd07e20d732`.
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
reconciliar y estén adjudicadas las partidas que podrían ocupar el top 10 de una
wallet. El sorteo de staking usa 1 ticket por cada 100 puntos completos, pool de
50.000 UKI más el 10% del staking total al cierre, premios de 10.000 UKI y máximo un
premio por wallet. El seed de cierre debe proceder de una fuente pública e
impredecible posterior al cierre y queda incluido en el resultado auditable.

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
