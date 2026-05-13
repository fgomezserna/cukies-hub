import { formatEther } from 'viem';

import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

export function shortWallet(address?: string | null) {
  if (!address) return '-';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getCukiDisplayName(cuki: LegacyMarketplaceCukiItem) {
  return cuki.cukiNumber !== null
    ? `Cukie #${cuki.cukiNumber}`
    : `Cukie ${cuki.tokenId}`;
}

export function formatLegacyPrice(cuki: LegacyMarketplaceCukiItem) {
  if (cuki.state !== 'onSale') return 'Not listed';

  if (cuki.priceOriginal) {
    try {
      if (cuki.network === 'BSC') {
        return `${Number(formatEther(BigInt(cuki.priceOriginal))).toLocaleString(
          'en-US',
          { maximumFractionDigits: 4 },
        )} BNB`;
      }

      if (cuki.network === 'TRON') {
        return `${(Number(cuki.priceOriginal) / 1_000_000).toLocaleString(
          'en-US',
          { maximumFractionDigits: 2 },
        )} TRX`;
      }
    } catch {
      return cuki.price !== null ? `${cuki.price.toLocaleString()} raw` : '-';
    }
  }

  return cuki.price !== null ? cuki.price.toLocaleString() : '-';
}

export function getTypeLabel(type: LegacyMarketplaceCukiItem['type']) {
  switch (String(type)) {
    case '1':
      return 'Common';
    case '2':
      return 'Uncommon';
    case '3':
      return 'Rare';
    case '4':
      return 'Epic';
    case '5':
      return 'Legendary';
    case '6':
      return 'Goat';
    default:
      return type === null ? '-' : `Type ${type}`;
  }
}

export function getStateLabel(state: string) {
  switch (state) {
    case 'onSale':
      return 'On sale';
    case 'inBridge':
      return 'In bridge';
    default:
      return state;
  }
}

export function formatLegacyDate(timestamp?: number | null) {
  if (!timestamp) return '-';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp));
}
