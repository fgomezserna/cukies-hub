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
      { title: 'Follow us on X', description: 'Follow @hyppieliquid', validationApiEndpoint: '/api/tasks/validate/twitter-follow' },
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

async function main() {
  console.log(`Start seeding ...`);
  
  // Clear existing quests to avoid duplicates during development
  await prisma.userCompletedTask.deleteMany({});
  await prisma.userQuest.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.quest.deleteMany({});

  console.log('Old quests and user progress deleted.');

  for (const qData of questsData) {
    const quest = await prisma.quest.create({
      data: {
        title: qData.title,
        description: qData.description,
        xp: qData.xp,
        isStarter: qData.isStarter || false, // Ensure isStarter is not undefined
        tasks: {
          create: qData.tasks.map(task => ({
            title: task.title,
            description: task.description,
            validationApiEndpoint: task.validationApiEndpoint,
          })),
        },
      },
    });
    console.log(`Created quest with title: ${quest.title}`);
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