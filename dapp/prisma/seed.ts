import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// IDs removed from this data structure
const questsData = [
  {
    title: 'STARTER',
    description: 'Complete these essential tasks to begin your journey on Hyppie Gambling.',
    xp: 2500,
    isStarter: true,
    tasks: [
      { title: 'Set a unique username', validationApiEndpoint: '/api/tasks/validate/username' },
      { title: 'Connect X account', validationApiEndpoint: '/api/tasks/validate/twitter-connect' },
      { title: 'Follow us on X', description: 'Follow @cukiesworld', validationApiEndpoint: '/api/tasks/validate/twitter-follow' },
      { title: 'Connect Discord account', validationApiEndpoint: '/api/tasks/validate/discord-connect' },
      { title: 'Join our Discord server', description: 'Join the official Hyppie Discord server to complete this task', validationApiEndpoint: '/api/tasks/validate/discord-join' },
      { title: 'Join our Telegram group', validationApiEndpoint: '/api/tasks/validate/telegram-join' },
    ],
  },
  {
    title: 'Verify Your Identity',
    description: 'A few simple steps to secure your account and prove you are a real one.',
    xp: 300,
    tasks: [
      { title: 'Verify email', validationApiEndpoint: '/api/tasks/validate/email-verify' },
      { title: 'Add a profile picture', validationApiEndpoint: '/api/tasks/validate/profile-picture' }
    ],
  },
  {
    title: 'Social Engagement',
    description: 'Engage with our community on X.',
    xp: 150,
    tasks: [
      { title: 'Like our pinned post', validationApiEndpoint: '/api/tasks/validate/like-pinned-post' },
      { title: 'Retweet our pinned post', validationApiEndpoint: '/api/tasks/validate/retweet-pinned-post' },
    ],
  },
  {
    title: 'Sybil Slayer Rookie',
    description: 'Get your hands dirty in our first game.',
    xp: 100,
    tasks: [{ title: 'Play 3 games of Sybil Slayer', validationApiEndpoint: '/api/tasks/validate/play-sybil-slayer-games' }],
  },
  {
    title: 'Sybil Slayer Pro',
    description: 'Show your skill and achieve a high score in SYBIL SLAYER.',
    xp: 250,
    tasks: [{ title: 'Score over 2000 points in one match', validationApiEndpoint: '/api/tasks/validate/sybil-slayer-highscore' }],
  },
];

// Games data based on existing mock data
const gamesData = [
  {
    gameId: 'sybil-slayer',
    name: 'Treasure Hunt',
    description: "Collect as fast as you can and don't get caught!",
    emoji: '🎮',
    gameUrl: process.env.GAME_SYBILSLASH || 'http://localhost:9002/',
    port: 9002,
    ranks: [
      { xp: 50000, name: 'Hyppie Master', icon: 'Crown', color: 'text-yellow-400' },
      { xp: 20000, name: 'Hyperliquid Veteran', icon: 'Medal', color: 'text-purple-400' },
      { xp: 10000, name: 'Sybil Slayer', icon: 'Trophy', color: 'text-orange-400' },
      { xp: 5000, name: 'Experimented Hyppie', icon: 'Star', color: 'text-blue-400' },
      { xp: 2500, name: 'Explorer', icon: 'Star', color: 'text-green-400' },
    ],
    leaderboardTitle: 'Top Slayers',
    playInstructions: [
      { icon: 'Gamepad2', text: 'PLAY' },
      { icon: 'Heart', text: 'HAVE FUN' },
      { icon: 'Trophy', text: 'EARN XP' }
    ],
    isActive: true,
    isInMaintenance: false,
    version: '1.0.0',
    category: 'arcade',
  },
  {
    gameId: 'hyppie-road',
    name: 'Hyppie Road',
    description: 'Navigate the crypto road, avoid traps, and multiply your rewards in this thrilling betting game.',
    emoji: '🛣️',
    gameUrl: process.env.GAME_HYPPIE_ROAD || 'http://localhost:9003/',
    port: 9003,
    ranks: [
      { xp: 50000, name: 'Road Legend', icon: 'Crown', color: 'text-yellow-400' },
      { xp: 20000, name: 'Highway Master', icon: 'Medal', color: 'text-purple-400' },
      { xp: 10000, name: 'Speed Demon', icon: 'Trophy', color: 'text-orange-400' },
      { xp: 5000, name: 'Experienced Driver', icon: 'Gamepad2', color: 'text-blue-400' },
      { xp: 2500, name: 'Road Explorer', icon: 'Star', color: 'text-green-400' },
    ],
    leaderboardTitle: 'Top Riders',
    playInstructions: [
      { icon: 'Gamepad2', text: 'PLAY' },
      { icon: 'Heart', text: 'HAVE FUN' },
      { icon: 'Trophy', text: 'EARN XP' }
    ],
    isActive: true,
    isInMaintenance: false,
    version: '1.0.0',
    category: 'betting',
  },
  {
    gameId: 'tower-builder',
    name: 'Hyppie Tower',
    description: 'Stack blocks as high as you can in this precision-based tower building game.',
    emoji: '🏗️',
    gameUrl: process.env.GAME_TOWER_BUILDER || 'http://localhost:9004/',
    port: 9004,
    ranks: [
      { xp: 50000, name: 'Master Architect', icon: 'Crown', color: 'text-yellow-400' },
      { xp: 20000, name: 'Building Expert', icon: 'Medal', color: 'text-purple-400' },
      { xp: 10000, name: 'Tower Master', icon: 'Trophy', color: 'text-orange-400' },
      { xp: 5000, name: 'Skilled Builder', icon: 'Star', color: 'text-blue-400' },
      { xp: 2500, name: 'Construction Worker', icon: 'Star', color: 'text-green-400' },
    ],
    leaderboardTitle: 'Top Hyppie Builders',
    playInstructions: [
      { icon: 'Gamepad2', text: 'BUILD' },
      { icon: 'Heart', text: 'STACK HIGH' },
      { icon: 'Trophy', text: 'EARN XP' }
    ],
    isActive: true,
    isInMaintenance: false,
    version: '1.0.0',
    category: 'arcade',
  }
];

async function main() {
  console.log(`Start seeding ...`);
  
  // Clear existing data to avoid duplicates during development
  await prisma.userCompletedTask.deleteMany({});
  await prisma.userQuest.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.quest.deleteMany({});
  await prisma.game.deleteMany({});

  console.log('Old quests, games and user progress deleted.');

  for (const qData of questsData) {
    const quest = await prisma.quest.create({
      data: {
        title: qData.title,
        description: qData.description,
        xp: qData.xp,
        isStarter: qData.isStarter || false, // Ensure isStarter is not undefined
        tasks: {
          create: qData.tasks.map((task: any) => ({
            title: task.title,
            description: task.description || null,
            validationApiEndpoint: task.validationApiEndpoint,
          })),
        },
      },
    });
    console.log(`Created quest with title: ${quest.title}`);
  }

  // Seed games
  for (const gameData of gamesData) {
    const game = await prisma.game.create({
      data: {
        gameId: gameData.gameId,
        name: gameData.name,
        description: gameData.description,
        emoji: gameData.emoji,
        gameUrl: gameData.gameUrl,
        port: gameData.port,
        ranks: gameData.ranks,
        leaderboardTitle: gameData.leaderboardTitle,
        playInstructions: gameData.playInstructions,
        isActive: gameData.isActive,
        isInMaintenance: gameData.isInMaintenance,
        version: gameData.version,
        category: gameData.category,
      },
    });
    console.log(`Created game with id: ${game.gameId}`);
  }

  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 