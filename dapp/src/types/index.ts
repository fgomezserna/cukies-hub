export type Streak = {
  id: string;
  userId: string;
  days: number;
  lastCheckIn: string; // Date serialized as string
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
} 