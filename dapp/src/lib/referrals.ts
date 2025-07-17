import { prisma } from "@/lib/prisma";

const REFERRAL_BONUS_POINTS = 100;
const REFERRAL_LEVEL_1_PERCENTAGE = 0.1; // 10%
const REFERRAL_LEVEL_2_PERCENTAGE = 0.05; // 5%

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

    // Distribute referral XP for the signup bonus (this is not referral XP itself)
    try {
      await distributeReferralXp(referrer.id, REFERRAL_BONUS_POINTS);
    } catch (error) {
      console.error('Error distributing referral XP for signup bonus:', error);
      // Don't fail the referral process if distribution fails
    }

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

export async function distributeReferralXp(userId: string, xpAmount: number, transactionType?: string) {
  try {
    // If this XP came from referral bonuses, don't distribute it further
    if (transactionType === 'REFERRAL_LEVEL_1' || transactionType === 'REFERRAL_LEVEL_2' || transactionType === 'REFERRAL_BONUS') {
      return;
    }

    // Find the user and their referral chain
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referredById: true,
        referredBy: {
          select: {
            id: true,
            username: true,
            referredById: true,
            referredBy: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!user?.referredBy) {
      // User has no referrer, nothing to distribute
      return;
    }

    const transactions = [];
    
    // Level 1 referrer (10%)
    const level1Xp = Math.floor(xpAmount * REFERRAL_LEVEL_1_PERCENTAGE);
    if (level1Xp > 0) {
      transactions.push(
        prisma.user.update({
          where: { id: user.referredBy.id },
          data: {
            xp: { increment: level1Xp },
            referralRewards: { increment: level1Xp },
          },
        }),
        prisma.pointTransaction.create({
          data: {
            userId: user.referredBy.id,
            type: "REFERRAL_LEVEL_1",
            amount: level1Xp,
            reason: `Level 1 referral bonus (10% of ${xpAmount} XP)`,
            metadata: {
              originalUserId: userId,
              originalXp: xpAmount,
              percentage: REFERRAL_LEVEL_1_PERCENTAGE,
            },
          },
        })
      );
    }

    // Level 2 referrer (5%)
    if (user.referredBy.referredBy) {
      const level2Xp = Math.floor(xpAmount * REFERRAL_LEVEL_2_PERCENTAGE);
      if (level2Xp > 0) {
        transactions.push(
          prisma.user.update({
            where: { id: user.referredBy.referredBy.id },
            data: {
              xp: { increment: level2Xp },
              referralRewards: { increment: level2Xp },
            },
          }),
          prisma.pointTransaction.create({
            data: {
              userId: user.referredBy.referredBy.id,
              type: "REFERRAL_LEVEL_2",
              amount: level2Xp,
              reason: `Level 2 referral bonus (5% of ${xpAmount} XP)`,
              metadata: {
                originalUserId: userId,
                originalXp: xpAmount,
                percentage: REFERRAL_LEVEL_2_PERCENTAGE,
              },
            },
          })
        );
      }
    }

    // Execute all transactions
    if (transactions.length > 0) {
      await prisma.$transaction(transactions);
    }

    return {
      level1Xp,
      level2Xp: user.referredBy.referredBy ? Math.floor(xpAmount * REFERRAL_LEVEL_2_PERCENTAGE) : 0,
    };
  } catch (error) {
    console.error("Error distributing referral XP:", error);
    throw error;
  }
}

