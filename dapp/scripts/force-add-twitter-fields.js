const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  let updated = 0;

  for (const user of users) {
    // Si ya existen los campos, no hacer nada

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twitterName: user.twitterName ?? null,
        twitterId: user.twitterId ?? null,
      },
    });
    updated++;
  }

  console.log(`Usuarios actualizados: ${updated}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}); 