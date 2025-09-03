import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupExpiredCodes() {
  try {
    const result = await prisma.emailVerification.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    console.log(`🧹 Cleaned up ${result.count} expired email verification codes`);
  } catch (error) {
    console.error('❌ Error cleaning up expired codes:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupExpiredCodes();
