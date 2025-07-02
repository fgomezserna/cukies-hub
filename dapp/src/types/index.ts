export type Streak = {
  id: string;
  userId: string;
  days: number;
  lastCheckIn: string; // Date serialized as string
}

export type Quest = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  xp: number;
  isStarter: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export type UserQuest = {
  id: string;
  userId: string;
  questId: string;
  completedAt: string;
  quest: Quest;
}

// Update User type to include streak information
export type User = {
  id: string;
  walletAddress: string;
  username: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  xp: number;
  twitterHandle: string | null;
  discordUsername: string | null;
  telegramUsername: string | null;
  referralCode: string | null;
  referredById: string | null;
  referralRewards: number;
  createdAt: string;
  updatedAt: string;
  lastCheckIn: Streak | null; // Added field
  completedQuests: UserQuest[];
}

export enum PointTransactionType {
  QUEST_COMPLETION = 'QUEST_COMPLETION',
  DAILY_LOGIN = 'DAILY_LOGIN',
  GAME_PLAY = 'GAME_PLAY',
  GAME_WIN = 'GAME_WIN',
  REFERRAL_BONUS = 'REFERRAL_BONUS',
  PURCHASE = 'PURCHASE',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  OTHER = 'OTHER'
}

export type PointTransaction = {
  id: string;
  userId: string;
  amount: number; // Positive for earned, negative for spent
  type: PointTransactionType;
  reason: string;
  metadata?: any; // JSON metadata
  createdAt: string;
} 