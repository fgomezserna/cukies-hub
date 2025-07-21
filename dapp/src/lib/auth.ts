import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function currentUser() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  
  // Return user from database based on session
  return await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      lastCheckIn: true,
      completedQuests: {
        include: {
          quest: true,
        },
      },
    },
  });
}