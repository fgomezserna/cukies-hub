import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWalletAuth } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    let user;
    try {
      user = await verifyWalletAuth(walletAddress);
    } catch {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    // Get user's referral data
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        username: true,
        referralRewards: true,
        referrals: {
          select: {
            id: true,
            username: true,
            profilePictureUrl: true,
            createdAt: true,
            xp: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        referredBy: {
          select: {
            id: true,
            username: true,
            profilePictureUrl: true,
          },
        },
      },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Calculate referral stats
    const totalReferrals = userData.referrals.length;
    const referralLink = userData.username 
      ? `${origin}/r/${userData.username}`
      : null;

    // Get recent referral transactions
    const recentTransactions = await prisma.pointTransaction.findMany({
      where: {
        userId: user.id,
        type: "REFERRAL_BONUS",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    return NextResponse.json(
      {
        username: userData.username,
        referralLink,
        totalReferrals,
        referralRewards: userData.referralRewards,
        referrals: userData.referrals.map((referral) => ({
          id: referral.id,
          username: referral.username,
          image: referral.profilePictureUrl,
          joinedAt: referral.createdAt,
          xp: referral.xp,
        })),
        referredBy: userData.referredBy,
        recentTransactions,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error("Error fetching referral data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
