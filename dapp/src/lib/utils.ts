import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { PointTransaction, PointTransactionType } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper functions for point transactions
export function formatPointsChange(amount: number): string {
  return amount > 0 ? `+${amount}` : amount.toString();
}

export function getPointTransactionIcon(type: PointTransactionType): string {
  switch (type) {
    case PointTransactionType.QUEST_COMPLETION:
      return '🎯';
    case PointTransactionType.DAILY_LOGIN:
      return '📅';
    case PointTransactionType.GAME_PLAY:
    case PointTransactionType.GAME_WIN:
      return '🎮';
    case PointTransactionType.REFERRAL_BONUS:
      return '👥';
    case PointTransactionType.PURCHASE:
      return '🛒';
    case PointTransactionType.MANUAL_ADJUSTMENT:
      return '⚙️';
    default:
      return '📊';
  }
}

export function formatPointTransactionForTable(transaction: PointTransaction) {
  return {
    reason: `${getPointTransactionIcon(transaction.type)} ${transaction.reason}`,
    points: formatPointsChange(transaction.amount),
    date: new Date(transaction.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  };
}
