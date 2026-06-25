import {
  Crown,
  Gift,
  Sparkles,
  Star,
  Trophy,
  Users,
} from 'lucide-react';
import type { PublicLocale } from '@/lib/public-locale';

export const purchaseRewards = [
  {
    amount: 5000,
    amountStr: '5.000 UKI',
    prize: 'Sorteo de 10 Cukies de 2ª Generación',
    prizeEn: 'Raffle for 10 2nd Generation Cukies',
    helper: 'Rarezas variadas',
    helperEn: 'Varied rarities',
    tier: 'Madera',
    tierEn: 'Wood',
    badgeColor: 'bg-[#6d4a2f]/30 text-[#d9b38c] border-[#8a633d]/60',
    tone: 'from-[#6d4a2f]/14 to-[#09091a]/86',
    border: 'border-[#8a633d]/35',
  },
  {
    amount: 20000,
    amountStr: '20.000 UKI',
    prize: 'Sorteo de 5 Cukies Comunes',
    prizeEn: 'Raffle for 5 Common Cukies',
    helper: 'Primer bloque garantizado de participación',
    helperEn: 'First guaranteed participation block',
    tier: 'Bronce',
    tierEn: 'Bronze',
    badgeColor: 'bg-[#a35e26]/30 text-[#e4a06d] border-[#a35e26]/60',
    tone: 'from-[#a35e26]/12 to-[#09091a]/86',
    border: 'border-[#a35e26]/30',
  },
  {
    amount: 35000,
    amountStr: '35.000 UKI',
    prize: 'Sorteo de 2 Cukies Raros + 3 Cukies No Comunes',
    prizeEn: 'Raffle for 2 Rare Cukies + 3 Uncommon Cukies',
    helper: 'Más rareza por mayor tramo',
    helperEn: 'More rarity at a higher tier',
    tier: 'Plata',
    tierEn: 'Silver',
    badgeColor: 'bg-[#6b7280]/30 text-[#e2e8f0] border-[#9ca3af]/60',
    tone: 'from-[#4b5563]/16 to-[#09091a]/86',
    border: 'border-[#6b7280]/30',
  },
  {
    amount: 60000,
    amountStr: '60.000 UKI',
    prize: 'Sorteo de 1 Cukie Épico + 2 Cukies Raros + 2 Cukies No Comunes',
    prizeEn: 'Raffle for 1 Epic Cukie + 2 Rare Cukies + 2 Uncommon Cukies',
    helper: 'Entrada en premios premium',
    helperEn: 'Entry into premium rewards',
    tier: 'Oro',
    tierEn: 'Gold',
    badgeColor: 'bg-[#b8860b]/30 text-[#ffd700] border-[#b8860b]/60',
    tone: 'from-[#b8860b]/18 to-[#09091a]/86',
    border: 'border-[#b8860b]/30',
  },
  {
    amount: 100000,
    amountStr: '100.000 UKI',
    prize: 'Sorteo de 1 Cukie Legendario + 3 Cukies Épicos',
    prizeEn: 'Raffle for 1 Legendary Cukie + 3 Epic Cukies',
    helper: 'Tramo alto de lanzamiento',
    helperEn: 'High launch tier',
    tier: 'Platino',
    tierEn: 'Platinum',
    badgeColor: 'bg-[#7c3cff]/30 text-[#f19bff] border-[#7c3cff]/60',
    tone: 'from-[#7c3cff]/20 to-[#09091a]/86 shadow-[0_0_24px_rgba(124,60,255,0.15)]',
    border: 'border-[#7c3cff]/45',
  },
  {
    amount: 150000,
    amountStr: '150.000 UKI',
    prize: 'Sorteo de 1 Cukie Goat + 3 Cukies Legendarios',
    prizeEn: 'Raffle for 1 Cukie Goat + 3 Legendary Cukies',
    helper: '+ tickets extra desde este tramo',
    helperEn: '+ extra tickets from this tier',
    tier: 'Leyenda',
    tierEn: 'Legend',
    badgeColor: 'bg-[#8b0000]/30 text-[#ff4d4d] border-[#ff4d4d]/60',
    tone: 'from-[#ff4d4d]/15 to-[#8b0000]/8 bg-gradient-to-r shadow-[0_0_32px_rgba(255,77,77,0.22)]',
    border: 'border-[#ff4d4d]/50',
    isLegendary: true,
  },
];

export const rarityRewards = [
  {
    name: 'Goat',
    nameEn: 'Goat',
    threshold: '2.500.000 UKI',
    border: 'border-[#f2c34b]/70 hover:border-[#f2c34b]',
    glow: 'shadow-[0_0_22px_rgba(242,195,75,0.2)]',
    text: 'text-[#ffe08a]',
    icon: Crown,
    stars: 5,
  },
  {
    name: 'Legendario',
    nameEn: 'Legendary',
    threshold: '1.000.000 UKI',
    border: 'border-[#d7a63e]/65 hover:border-[#d7a63e]',
    glow: 'shadow-[0_0_18px_rgba(215,166,62,0.16)]',
    text: 'text-[#f2c34b]',
    icon: Trophy,
    stars: 4,
  },
  {
    name: 'Épico',
    nameEn: 'Epic',
    threshold: '500.000 UKI',
    border: 'border-[#d953ff]/65 hover:border-[#d953ff]',
    glow: 'shadow-[0_0_18px_rgba(217,83,255,0.15)]',
    text: 'text-[#f19bff]',
    icon: Sparkles,
    stars: 3,
  },
  {
    name: 'Raro',
    nameEn: 'Rare',
    threshold: '300.000 UKI',
    border: 'border-[#d953ff]/65 hover:border-[#d953ff]',
    glow: 'shadow-[0_0_14px_rgba(56,189,248,0.12)]',
    text: 'text-[#f19bff]',
    icon: Star,
    stars: 2,
  },
  {
    name: 'No Común',
    nameEn: 'Uncommon',
    threshold: '150.000 UKI',
    border: 'border-[#c7a6ff]/65 hover:border-[#c7a6ff]',
    glow: 'shadow-[0_0_14px_rgba(145,233,111,0.12)]',
    text: 'text-[#dfc6ff]',
    icon: Gift,
    stars: 1,
  },
  {
    name: 'Común',
    nameEn: 'Common',
    threshold: '<150.000 UKI',
    border: 'border-white/20 hover:border-white/40',
    glow: '',
    text: 'text-[var(--uki-cream)]',
    icon: Users,
    stars: 0,
  },
];

function formatAmountForLocale(amount: number, locale: PublicLocale) {
  return `${amount.toLocaleString(locale === 'en' ? 'en-US' : 'de-DE')} UKI`;
}

function formatThresholdForLocale(threshold: string, locale: PublicLocale) {
  if (locale === 'es') return threshold;
  return threshold.replace(/\./g, ',');
}

export function purchaseRewardDisplay(
  reward: (typeof purchaseRewards)[number],
  locale: PublicLocale,
) {
  return {
    amountStr: locale === 'en' ? formatAmountForLocale(reward.amount, locale) : reward.amountStr,
    tier: locale === 'en' ? reward.tierEn : reward.tier,
    prize: locale === 'en' ? reward.prizeEn : reward.prize,
    helper: locale === 'en' ? reward.helperEn : reward.helper,
  };
}

export function rarityRewardDisplay(
  reward: (typeof rarityRewards)[number],
  locale: PublicLocale,
) {
  return {
    name: locale === 'en' ? reward.nameEn : reward.name,
    threshold: formatThresholdForLocale(reward.threshold, locale),
  };
}
