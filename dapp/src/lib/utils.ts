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
    case 'QUEST_COMPLETION':
      return '🎯';
    case 'DAILY_LOGIN':
      return '📅';
    case 'GAME_PLAY':
    case 'GAME_WIN':
      return '🎮';
    case 'REFERRAL_BONUS':
      return '👥';
    case 'PURCHASE':
      return '🛒';
    case 'MANUAL_ADJUSTMENT':
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
