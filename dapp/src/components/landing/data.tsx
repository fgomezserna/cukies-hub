import {
  BadgeCheck,
  Calendar,
  CircleDollarSign,
  Coins,
  Crown,
  Database,
  Gamepad2,
  Gift,
  Lock,
  Network,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type LandingIcon = LucideIcon;

export const navItems = [
  { label: 'Presale', href: '#presale' },
  { label: 'Token', href: '#token' },
  { label: 'Utility', href: '#utility' },
  { label: 'Games', href: '#games' },
  { label: 'FAQ', href: '#faq' },
];

export const trustSignals = [
  { icon: ShieldCheck, label: 'Audited', value: 'Smart contracts' },
  { icon: Zap, label: 'Built on', value: 'BNB Smart Chain' },
  { icon: Users, label: 'Community', value: 'Since 2021' },
];

export const saleFacts = [
  { icon: Coins, label: 'Price', value: '$0.01', helper: 'Per UKI' },
  { icon: Calendar, label: 'Duration', value: '1 month', helper: 'Presale period' },
  { icon: CircleDollarSign, label: 'Buy with', value: 'ASM', helper: 'Sale currency' },
  { icon: Lock, label: 'Vesting', value: '9 months', helper: 'Linear release' },
  { icon: Trophy, label: 'Listing', value: 'At least $0.012', helper: 'Target floor' },
  { icon: ShieldCheck, label: 'Liquidity', value: 'Locked / burned', helper: '9+ months' },
];

export const purchaseSteps = [
  {
    number: '1',
    title: 'Connect wallet',
    text: 'Connect your BSC wallet to get started.',
    icon: Wallet,
  },
  {
    number: '2',
    title: 'Approve ASM',
    text: 'Approve ASM as the sale currency for the presale.',
    icon: BadgeCheck,
  },
  {
    number: '3',
    title: 'Buy UKI',
    text: 'Exchange ASM for UKI at the fixed presale rate.',
    icon: Coins,
  },
  {
    number: '4',
    title: 'Track vesting',
    text: 'Your UKI unlocks linearly after launch.',
    icon: Timer,
  },
];

export const vestingTracks = [
  {
    icon: Lock,
    title: 'Buyer vesting',
    subtitle: '9 months linear',
    color: '#2ee8d6',
    labels: ['Month 0', 'Month 3', 'Month 6', 'Month 9'],
  },
  {
    icon: Users,
    title: 'Team vesting',
    subtitle: '9 month cliff + 24 month vesting',
    color: '#4d93ff',
    labels: ['0', 'Cliff', 'Month 9', 'Month 21', 'Month 33'],
  },
  {
    icon: Gift,
    title: 'Cukie Master rewards program',
    subtitle: 'Released over 6 years',
    color: '#91d867',
    labels: ['Year 1', 'Year 3', 'Year 5', 'Year 6'],
  },
];

export const utilityNodes = [
  {
    title: 'Games',
    text: 'Play, compete and earn.',
    icon: Gamepad2,
    className: 'uki-node-purple',
    positionClassName: 'uki-node-games',
  },
  {
    title: 'Credits',
    text: 'Earn, spend and upgrade.',
    icon: Coins,
    className: 'uki-node-gold',
    positionClassName: 'uki-node-credits',
  },
  {
    title: 'Pools',
    text: 'Powerful pools with real utility.',
    icon: Database,
    className: 'uki-node-blue',
    positionClassName: 'uki-node-pools',
  },
  {
    title: 'Cukie Master',
    text: 'Boost yield and unlock perks.',
    icon: Crown,
    className: 'uki-node-pink',
    positionClassName: 'uki-node-master',
  },
  {
    title: 'Future worlds',
    text: 'Expanding the Cukies universe.',
    icon: Network,
    className: 'uki-node-green',
    positionClassName: 'uki-node-worlds',
  },
  {
    title: 'Rewards',
    text: 'Compete, rank, get rewarded.',
    icon: Gift,
    className: 'uki-node-red',
    positionClassName: 'uki-node-rewards',
  },
];

export const timeline = [
  {
    year: '2021',
    title: 'Cukies NFTs',
    text: 'Collection launch and community begins.',
    image: '/brand/generated/uki-timeline-2021.svg',
  },
  {
    year: '2022-2023',
    title: 'Ecosystem',
    text: 'Bridge, tools and marketplace expansion.',
    image: '/brand/generated/uki-timeline-ecosystem.svg',
  },
  {
    year: '2024',
    title: 'Building',
    text: 'Game systems and utility access.',
    image: '/brand/generated/uki-timeline-building.svg',
  },
  {
    year: '2026',
    title: 'UKI launch',
    text: 'Token presale and new economy.',
    image: '/brand/generated/uki-timeline-launch.svg',
    active: true,
  },
  {
    year: 'Next',
    title: 'Game economy',
    text: 'Play, earn, own, together.',
    image: '/brand/generated/uki-timeline-economy.svg',
  },
];

export const futureUtility = [
  {
    title: 'Stake UKI',
    text: 'Stake your UKI to boost power and multipliers.',
    icon: Sparkles,
    className: 'uki-future-cyan',
    image: '/brand/generated/cukie-master-stake-landing.png',
  },
  {
    title: 'Use Cukie points',
    text: 'Use Cukie Master points for upgrades and benefits.',
    icon: Star,
    className: 'uki-future-pink',
    image: '/brand/generated/cukie-master-points-landing.png',
  },
  {
    title: 'Receive credits',
    text: 'Earn credits from activity, games and pools.',
    icon: Coins,
    className: 'uki-future-gold',
    image: '/brand/generated/cukie-master-credits-landing.png',
  },
  {
    title: 'Enter pools',
    text: 'Join exclusive pools for greater rewards.',
    icon: Crown,
    className: 'uki-future-vault',
    image: '/brand/generated/cukie-master-pools-landing.png',
  },
];

export const gameCards = [
  {
    title: "Cukies Rush n' Run",
    text: 'Action / runner',
    image: '/portada_jump_Hop.jpg',
  },
  {
    title: 'Cukies Board Game',
    text: 'Strategy / PvP',
    image: '/portada_cukies_island.jpg',
  },
  {
    title: 'Cukies Sports',
    text: 'Sports / arcade',
    image: '/portada_brain_buzz.jpg',
  },
  {
    title: 'And more...',
    text: 'Stay tuned',
    image: '/Powered_up_2.png',
  },
];

export const faqs = [
  {
    question: 'What is UKI and what can I use it for?',
    answer:
      'UKI is the utility token planned for the Cukies game economy. It will connect games, credits, Cukie Master mechanics, rewards and future ecosystem features.',
  },
  {
    question: 'Why is the presale in ASM?',
    answer:
      'ASM is planned as the sale currency for the first UKI distribution. The final contract flow should be confirmed before the presale opens.',
  },
  {
    question: 'How does vesting work?',
    answer:
      'Presale UKI is designed to unlock linearly over 9 months. The final unlock schedule must be enforced by the vesting contract.',
  },
  {
    question: 'When will staking be available?',
    answer:
      'Staking and Cukie Master features are planned after presale and TGE, once the token and reward infrastructure are live.',
  },
  {
    question: 'Do Cukies NFTs provide utility?',
    answer:
      'Yes. The next system should use NFT ownership and rarity data for access, points, Cukie Master mechanics and game benefits.',
  },
  {
    question: 'How are rewards and pools structured?',
    answer:
      'Rewards combine game performance, credits, pools and ranking logic. Some calculations can live in the backend while token movement stays on BSC.',
  },
];
