import { prisma } from "@/lib/prisma";

const REFERRAL_BONUS_POINTS = 100;

export async function processReferralByUsername(newUserId: string, referrerUsername: string) {
  try {
    // Find the referring user
    const referrer = await prisma.user.findUnique({
      where: { username: referrerUsername },
      select: { id: true, username: true },
    });

    if (!referrer) {
      throw new Error("Invalid referrer username");
    }

    // Check if the new user is already referred by someone
    const newUser = await prisma.user.findUnique({
      where: { id: newUserId },
      select: { referredById: true },
    });

    if (newUser?.referredById) {
      throw new Error("User already has a referrer");
    }

    // Prevent self-referral
    if (referrer.id === newUserId) {
      throw new Error("Cannot refer yourself");
    }

    // Update the new user with referral information
    await prisma.user.update({
      where: { id: newUserId },
      data: {
        referredById: referrer.id,
      },
    });

    // Award points to the referrer
    await prisma.$transaction(async (tx) => {
      // Update referrer's referral rewards
      await tx.user.update({
        where: { id: referrer.id },
        data: {
          referralRewards: {
            increment: REFERRAL_BONUS_POINTS,
          },
          xp: {
            increment: REFERRAL_BONUS_POINTS,
          },
        },
      });

      // Create point transaction record
      await tx.pointTransaction.create({
        data: {
          userId: referrer.id,
          type: "REFERRAL_BONUS",
          amount: REFERRAL_BONUS_POINTS,
          reason: `Referral bonus for inviting ${newUser ? "a new user" : "someone"}`,
        },
      });
    });

    return {
      success: true,
      referrerId: referrer.id,
      referrerName: referrer.username,
      pointsAwarded: REFERRAL_BONUS_POINTS,
    };
  } catch (error) {
    console.error("Error processing referral:", error);
    throw error;
  }
}

