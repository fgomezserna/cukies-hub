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
  Timer,
  Trophy,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { PublicLocale } from '@/lib/public-locale';

export type LandingIcon = LucideIcon;

export type LocalizedText = Record<PublicLocale, string>;

export const navItems = [
  { label: 'Inicio', href: '#presale' },
  { label: 'Premios', href: '/premios' },
];

export const trustSignals = [
  { icon: Zap, label: 'Red', value: 'BNB Smart Chain' },
  { icon: Timer, label: 'Inicio', value: '15 junio' },
  { icon: Users, label: 'Comunidad', value: 'Desde 2021' },
];

export const saleFactsByLocale: Record<PublicLocale, Array<{ icon: LandingIcon; label: string; value: string; helper?: string }>> = {
  es: [
    { icon: Coins, label: 'Precio', value: '$0.01', helper: 'Por UKI' },
    { icon: Calendar, label: 'Duración', value: '1 mes', helper: 'Periodo de preventa' },
    { icon: CircleDollarSign, label: 'Compra con', value: 'ASM', helper: 'Moneda principal' },
    { icon: Lock, label: 'Vesting', value: '9 meses', helper: 'Lineal sin cliff' },
    { icon: Trophy, label: 'Listing', value: 'Mínimo $0.012', helper: 'Objetivo inicial' },
    { icon: ShieldCheck, label: 'Liquidez', value: 'Bloqueada', helper: '' },
  ],
  en: [
    { icon: Coins, label: 'Price', value: '$0.01', helper: 'Per UKI' },
    { icon: Calendar, label: 'Duration', value: '1 month', helper: 'Presale period' },
    { icon: CircleDollarSign, label: 'Buy with', value: 'ASM', helper: 'Main currency' },
    { icon: Lock, label: 'Vesting', value: '9 months', helper: 'Linear, no cliff' },
    { icon: Trophy, label: 'Listing', value: 'Minimum $0.012', helper: 'Initial target' },
    { icon: ShieldCheck, label: 'Liquidity', value: 'Locked', helper: '' },
  ],
};

export const pancakeSwapAsmUrl =
  'https://pancakeswap.finance/swap?chain=bsc&outputCurrency=0x707F0f4a39a4a26239F7D00463B15AB5656861f9';

export const purchaseStepsByLocale: Record<PublicLocale, Array<{ number: string; title: string; text: string; icon: LandingIcon }>> = {
  es: [
    {
      number: '1',
      title: 'Conecta wallet',
      text: 'Conecta una wallet compatible con BNB Smart Chain.',
      icon: Wallet,
    },
    {
      number: '2',
      title: 'Aprueba ASM',
      text: 'Autoriza al contrato a usar el importe de ASM elegido.',
      icon: BadgeCheck,
    },
    {
      number: '3',
      title: 'Compra UKI',
      text: 'Compra UKI al ratio fijado al inicio de la preventa.',
      icon: Coins,
    },
    {
      number: '4',
      title: 'Consulta vesting',
      text: 'Sigue la asignación de UKI creada para tu wallet.',
      icon: Timer,
    },
  ],
  en: [
    {
      number: '1',
      title: 'Connect wallet',
      text: 'Connect a wallet compatible with BNB Smart Chain.',
      icon: Wallet,
    },
    {
      number: '2',
      title: 'Approve ASM',
      text: 'Authorize the contract to use your selected ASM amount.',
      icon: BadgeCheck,
    },
    {
      number: '3',
      title: 'Buy UKI',
      text: 'Buy UKI at the ratio set when the presale opens.',
      icon: Coins,
    },
    {
      number: '4',
      title: 'Check vesting',
      text: 'Track the UKI allocation created for your wallet.',
      icon: Timer,
    },
  ],
};

export const vestingTracks = [
  {
    icon: Lock,
    title: 'Vesting comprador',
    subtitle: 'Consulta disponible para wallets con compra',
    color: '#e45cff',
    labels: ['Asignación', 'Contrato', 'Desbloqueos', 'Claim'],
  },
  {
    icon: Users,
    title: 'Vesting equipo',
    subtitle: '9 meses cliff + 24 meses vesting',
    color: '#b67cff',
    labels: ['0', 'Cliff', 'Mes 9', 'Mes 21', 'Mes 33'],
  },
  {
    icon: Gift,
    title: 'Programa Cukie Master',
    subtitle: 'Asignaciones durante 6 años',
    color: '#f19bff',
    labels: ['Año 1', 'Año 3', 'Año 5', 'Año 6'],
  },
];

export const utilityNodesByLocale: Record<PublicLocale, Array<{ title: string; text: string; icon: LandingIcon; className: string; positionClassName: string }>> = {
  es: [
    {
      title: 'Juegos',
      text: 'Juega, compite y gana.',
      icon: Gamepad2,
      className: 'uki-node-purple',
      positionClassName: 'uki-node-games',
    },
    {
      title: 'Créditos',
      text: 'Gana, gasta y mejora.',
      icon: Coins,
      className: 'uki-node-gold',
      positionClassName: 'uki-node-credits',
    },
    {
      title: 'Pools',
      text: 'Pools con utilidad real.',
      icon: Database,
      className: 'uki-node-lavender',
      positionClassName: 'uki-node-pools',
    },
    {
      title: 'Cukie Master',
      text: 'Stakea tus UKI para recibir créditos diarios.',
      icon: Crown,
      className: 'uki-node-pink',
      positionClassName: 'uki-node-master',
    },
    {
      title: 'Future Worlds',
      text: 'Expande el universo Cukies.',
      icon: Network,
      className: 'uki-node-violet',
      positionClassName: 'uki-node-worlds',
    },
    {
      title: 'Rewards',
      text: 'Compite, rankea y recibe premios.',
      icon: Gift,
      className: 'uki-node-red',
      positionClassName: 'uki-node-rewards',
    },
  ],
  en: [
    {
      title: 'Games',
      text: 'Play, compete, and win.',
      icon: Gamepad2,
      className: 'uki-node-purple',
      positionClassName: 'uki-node-games',
    },
    {
      title: 'Credits',
      text: 'Earn, spend, and upgrade.',
      icon: Coins,
      className: 'uki-node-gold',
      positionClassName: 'uki-node-credits',
    },
    {
      title: 'Pools',
      text: 'Pools with real utility.',
      icon: Database,
      className: 'uki-node-lavender',
      positionClassName: 'uki-node-pools',
    },
    {
      title: 'Cukie Master',
      text: 'Stake UKI to receive daily credits.',
      icon: Crown,
      className: 'uki-node-pink',
      positionClassName: 'uki-node-master',
    },
    {
      title: 'Future Worlds',
      text: 'Expand the Cukies universe.',
      icon: Network,
      className: 'uki-node-violet',
      positionClassName: 'uki-node-worlds',
    },
    {
      title: 'Rewards',
      text: 'Compete, rank up, and earn prizes.',
      icon: Gift,
      className: 'uki-node-red',
      positionClassName: 'uki-node-rewards',
    },
  ],
};

export const communityRewards = [
  {
    icon: Users,
    title: '60%+ para la comunidad',
    text: 'Más del 60% del supply total de UKI se entregará como recompensas durante 6 años.',
  },
  {
    icon: Crown,
    title: 'Múltiples formas de participar',
    text: 'Stakea UKI, stakea o presta Cukies, presta créditos de competición, juega o combina varias rutas.',
  },
  {
    icon: Trophy,
    title: 'Actividad recompensada',
    text: 'El sistema premia a quienes forman parte del ecosistema, no solo a quienes compran el token.',
  },
];

export const timeline = [
  {
    year: '2021',
    title: 'Cukies NFTs',
    text: 'Lanzamiento de la colección y comunidad.',
    image: '/brand/generated/uki-timeline-2021.svg',
  },
  {
    year: '2022-2023',
    title: 'Ecosistema',
    text: 'Bridge, herramientas y marketplace.',
    image: '/brand/generated/uki-timeline-ecosystem.svg',
  },
  {
    year: '2024',
    title: 'Construcción',
    text: 'Sistemas de juego y utilidad.',
    image: '/brand/generated/uki-timeline-building.svg',
  },
  {
    year: '2026',
    title: 'Lanzamiento UKI',
    text: 'Preventa y nueva economía.',
    image: '/brand/generated/uki-timeline-launch.svg',
    active: true,
  },
  {
    year: 'Después',
    title: 'Economía de juegos',
    text: 'Jugar, competir y ampliar utilidad.',
    image: '/brand/generated/uki-timeline-economy.svg',
  },
];

export const futureUtility = [
  {
    title: 'Stake UKI',
    text: 'Usa UKI para desbloquear cupos Cukie Master.',
    icon: Sparkles,
    className: 'uki-future-cyan',
    image: '/brand/generated/cukie-master-stake-landing.png',
  },
  {
    title: 'Créditos de competición',
    text: 'Recibe créditos internos desde cupos activos.',
    icon: Coins,
    className: 'uki-future-pink',
    image: '/brand/generated/cukie-master-points-landing.png',
  },
  {
    title: 'Pool de créditos',
    text: 'Aporta créditos diarios al pool cuando se active.',
    icon: Database,
    className: 'uki-future-gold',
    image: '/brand/generated/cukie-master-credits-landing.png',
  },
  {
    title: 'Pool de Cukies',
    text: 'Presta Cukies bajo reglas de disponibilidad.',
    icon: Crown,
    className: 'uki-future-vault',
    image: '/brand/generated/cukie-master-pools-landing.png',
  },
];

export const gameCards = [
  {
    title: "Jump n' Hop",
    text: 'Acción / Plataformas',
    image: '/portada_jump_Hop.jpg',
  },
  {
    title: 'Cukies Island',
    text: 'Estrategia / Simulación',
    image: '/portada_cukies_island.jpg',
  },
  {
    title: 'Brain Buzz',
    text: 'Trivia / Conocimiento',
    image: '/portada_brain_buzz.jpg',
  },
];

export const landingCopyByLocale = {
  es: {
    hero: {
      badge: 'Lanzamiento 2026',
      title: 'Preventa UKI',
      lead: 'El token que impulsa la economía de Cukies World, conectando juegos, competición y recompensas en',
      network: 'BNB Smart Chain.',
      buy: 'Comprar UKI',
      details: 'Ver detalles',
    },
    howToBuy: {
      title: 'Cómo comprar UKI',
      preAsmTitle: 'Compra ASM antes de la preventa',
      preAsmText: 'Necesitas ASM en BNB Smart Chain para participar. Compra o cambia ASM en PancakeSwap y vuelve aquí para aprobarlo y comprar UKI.',
      preAsmButton: 'Comprar ASM',
      walletCompatible: 'Wallet EVM compatible',
      chain: 'BNB Smart Chain',
      spendLimit: 'Límite de gasto',
      approve: 'Aprobar',
      pay: 'Pagas',
      receive: 'Recibes',
      contractRatio: 'El ratio se lee del contrato de preventa',
      vestingAccess: 'El acceso a vesting se activa solo cuando esta wallet tiene una compra UKI confirmada.',
    },
    community: {
      badge: 'Economía centrada en la comunidad',
      titleTop: 'Más del 60% de UKI',
      titleBottom: 'está destinado a la comunidad',
      leadPrefix: 'En Cukies World, más del 60% del supply total de UKI se entregará como recompensas a las personas que participan en el ecosistema durante un periodo de',
      leadStrong: '6 años.',
      principle: 'Porque creemos que una economía sostenible debe beneficiar a quienes juegan, aportan y forman parte de su crecimiento.',
      tokenomicsButton: 'Consulta los tokenomics',
      ringLabel: 'del supply total destinado a la comunidad',
      years: '6 años',
      yearsLabel: 'de distribución en recompensas',
      footer: 'Recompensamos la participación. Construimos el futuro juntos.',
    },
    utility: {
      title: 'Por qué existe UKI',
      subtitle: 'UKI lo conecta todo: juegos, créditos de competición, Cukies, pools, rankings y recompensas.',
    },
    master: {
      badge: 'Cukie Master',
      title: 'La llave principal',
      highlight: 'al ecosistema',
      text: 'Conviértete en Cukie Master y accede a recompensas diarias dentro de Cukies World, ya sea de forma activa o pasiva.',
      badgeLabel: 'Cukie Master',
      badgeHelper: 'Acceso exclusivo a recompensas diarias',
      requirements: [
        { value: '500', label: 'cupos iniciales', helper: 'Disponibles en la fase inicial' },
        { value: '20,000', label: 'UKI o más', helper: 'Requisito por cada cupo' },
        { value: 'Máx. 5', label: 'cupos por wallet', helper: 'Límite por dirección' },
      ],
      presaleTitle: 'Los UKI de preventa también califican',
      presaleText: 'Los UKI comprados durante la preventa cuentan para ser Cukie Master, incluso si tienen vesting.',
      benefitsTitle: '¿Qué recibes por cada cupo?',
      benefitsText: 'Cada cupo de Cukie Master genera 100 créditos de competición diarios. Cada crédito puede convertirse en 1 UKI.',
      flow: [
        { value: '1 cupo', label: 'Cukie Master' },
        { value: '100', label: 'créditos de competición al día' },
        { value: '1 crédito', label: '= 1 UKI' },
      ],
      usesTitle: 'Dos formas de usar tus créditos',
      uses: [
        { title: 'Jugar para convertirlos a UKI', text: 'Utiliza tus créditos en los juegos y convierte su valor a UKI de forma inmediata.' },
        { title: 'Ponerlos en un pool', text: 'Otros jugadores los usarán para jugar y compartirán contigo las ganancias generadas.' },
      ],
      finalPrefix: 'Cukie Master te da acceso diario a la economía de Cukies World. Tú decides si participar de forma',
      finalStrong: 'activa, pasiva o combinada.',
    },
    games: {
      top: 'Treasure Hunt · Primer juego',
      titlePrefix: 'Recoge tesoros y',
      titleHighlight: 'convierte tu puntuación en UKI',
      text: 'Recoge gemas, monedas y tesoros para conseguir la mayor puntuación posible antes de perder tus 3 vidas o de que se acabe el tiempo.',
      badge: 'Cada partida también cuenta para el ranking semanal',
      metrics: [
        { value: '5 min', label: 'partidas rápidas' },
        { value: '10 créditos', label: 'coste por partida' },
        { value: 'Hasta 7.5 UKI', label: 'premio inmediato' },
        { value: 'Torneo Semanal', label: 'grandes premios en UKI' },
      ],
    },
    prizes: {
      badge: 'Premios',
      titlePrefix: 'Gana Cukies por',
      titleHighlight: 'participar y por invitar',
      text: 'Consigue Cukies comprando UKI en la preventa y también invitando a otras personas a participar en el ecosistema.',
      view: 'Ver Premios',
      invite: 'Invita a tus amigos',
      slides: [
        { title: 'Sorteo Leyenda', desc: '1 Cukie Goat + 3 Legendarios en el tramo de 150.000 UKI' },
        { title: 'Competición de Sponsors', desc: 'Premios de rareza Goat o Legendario garantizados para el Top 5' },
        { title: 'Sorteo de Tiers', desc: 'Cukies de 2ª generación y rarezas variadas desde 5.000 UKI' },
      ],
      slideLabel: 'Ir a slide',
    },
    faq: {
      title: 'FAQ',
      ctaTitle: 'Entra en la nueva etapa de Cukies',
      participate: 'Participa ahora',
      conditions: 'Lee las condiciones',
    },
  },
  en: {
    hero: {
      badge: '2026 launch',
      title: 'UKI presale',
      lead: 'The token powering the Cukies World economy, connecting games, competition, and rewards on',
      network: 'BNB Smart Chain.',
      buy: 'Buy UKI',
      details: 'View details',
    },
    howToBuy: {
      title: 'How to buy UKI',
      preAsmTitle: 'Buy ASM before the presale',
      preAsmText: 'You need ASM on BNB Smart Chain to participate. Buy or swap ASM on PancakeSwap, then return here to approve it and buy UKI.',
      preAsmButton: 'Buy ASM',
      walletCompatible: 'EVM-compatible wallet',
      chain: 'BNB Smart Chain',
      spendLimit: 'Spending limit',
      approve: 'Approve',
      pay: 'You pay',
      receive: 'You receive',
      contractRatio: 'The ratio is read from the presale contract',
      vestingAccess: 'Vesting access is enabled only when this wallet has a confirmed UKI purchase.',
    },
    community: {
      badge: 'Community-centered economy',
      titleTop: 'More than 60% of UKI',
      titleBottom: 'is allocated to the community',
      leadPrefix: 'In Cukies World, more than 60% of the total UKI supply will be distributed as rewards to people who participate in the ecosystem over a period of',
      leadStrong: '6 years.',
      principle: 'Because we believe a sustainable economy should benefit the people who play, contribute, and take part in its growth.',
      tokenomicsButton: 'View tokenomics',
      ringLabel: 'of total supply allocated to the community',
      years: '6 years',
      yearsLabel: 'of reward distribution',
      footer: 'We reward participation. We build the future together.',
    },
    utility: {
      title: 'Why UKI exists',
      subtitle: 'UKI connects it all: games, competition credits, Cukies, pools, rankings, and rewards.',
    },
    master: {
      badge: 'Cukie Master',
      title: 'The main key',
      highlight: 'to the ecosystem',
      text: 'Become a Cukie Master and access daily rewards inside Cukies World, either actively, passively, or both.',
      badgeLabel: 'Cukie Master',
      badgeHelper: 'Exclusive access to daily rewards',
      requirements: [
        { value: '500', label: 'initial slots', helper: 'Available in the initial phase' },
        { value: '20,000', label: 'UKI or more', helper: 'Requirement for each slot' },
        { value: 'Max. 5', label: 'slots per wallet', helper: 'Limit per address' },
      ],
      presaleTitle: 'Presale UKI also qualifies',
      presaleText: 'UKI bought during the presale counts toward Cukie Master, even while it is vested.',
      benefitsTitle: 'What do you receive per slot?',
      benefitsText: 'Each Cukie Master slot generates 100 competition credits per day. Each credit can convert into 1 UKI.',
      flow: [
        { value: '1 slot', label: 'Cukie Master' },
        { value: '100', label: 'competition credits per day' },
        { value: '1 credit', label: '= 1 UKI' },
      ],
      usesTitle: 'Two ways to use your credits',
      uses: [
        { title: 'Play to convert them into UKI', text: 'Use your credits in games and convert their value into UKI immediately.' },
        { title: 'Put them into a pool', text: 'Other players will use them to play and share the generated earnings with you.' },
      ],
      finalPrefix: 'Cukie Master gives you daily access to the Cukies World economy. You choose whether to participate',
      finalStrong: 'actively, passively, or both.',
    },
    games: {
      top: 'Treasure Hunt · First game',
      titlePrefix: 'Collect treasures and',
      titleHighlight: 'turn your score into UKI',
      text: 'Collect gems, coins, and treasures to get the highest score possible before losing your 3 lives or running out of time.',
      badge: 'Every game also counts toward the weekly ranking',
      metrics: [
        { value: '5 min', label: 'quick games' },
        { value: '10 credits', label: 'cost per game' },
        { value: 'Up to 7.5 UKI', label: 'instant reward' },
        { value: 'Weekly Tournament', label: 'large UKI prizes' },
      ],
    },
    prizes: {
      badge: 'Rewards',
      titlePrefix: 'Win Cukies by',
      titleHighlight: 'participating and inviting',
      text: 'Earn Cukies by buying UKI in the presale and by inviting other people to join the ecosystem.',
      view: 'View rewards',
      invite: 'Invite friends',
      slides: [
        { title: 'Legend raffle', desc: '1 Cukie Goat + 3 Legendary Cukies at the 150,000 UKI tier' },
        { title: 'Sponsor competition', desc: 'Goat or Legendary rarity prizes guaranteed for the Top 5' },
        { title: 'Tier raffle', desc: '2nd generation Cukies and varied rarities from 5,000 UKI' },
      ],
      slideLabel: 'Go to slide',
    },
    faq: {
      title: 'FAQ',
      ctaTitle: 'Enter the new stage of Cukies',
      participate: 'Join now',
      conditions: 'Read the terms',
    },
  },
} as const;

export const faqsByLocale: Record<PublicLocale, Array<{ question: string; answer: string }>> = {
  es: [
    {
      question: '¿Qué es UKI y para qué sirve?',
      answer:
        'UKI es el token de utilidad de la economía de juegos de Cukies World. Conecta juegos, créditos de competición, Cukie Master, pools, rankings, Cukies y recompensas.',
    },
    {
      question: '¿Qué token se usa en la preventa de UKI?',
      answer:
        'ASM es la moneda principal prevista para la preventa de UKI. El ratio ASM a UKI se mantendrá durante la duración de la preventa.',
    },
    {
      question: '¿Los UKI en vesting cuentan para ser Cukie Master?',
      answer:
        'Sí. Los UKI comprados en preventa y sujetos a vesting cuentan de forma automática para obtener hasta 5 cupos de Cukie Master por wallet (1 cupo por cada 20,000 UKI comprados).',
    },
    {
      question: '¿Los Cukies tendrán utilidad?',
      answer:
        'Sí. Al inicio los Cukies se usarán para jugar a Treasure Hunt y obtener recompensas, y también se podrán prestar para ganar de forma pasiva. A medida que el ecosistema se desarrolle irán teniendo mayor utilidad.',
    },
    {
      question: '¿Cómo puedo ganar en Cukies World?',
      answer: `Hay varios caminos para ganar recompensas. De forma activa, puedes jugar cada día y ganar UKI en cada partida y además participar en el torneo semanal para ganar mayores recompensas.

De forma pasiva, puedes stakear tus tokens UKI para ser Cukie Master y ceder los créditos de competición que recibirás a otros jugadores, y compartir los UKI que ellos generen. También puedes prestar tus Cukies para ganar más.`,
    },
  ],
  en: [
    {
      question: 'What is UKI and what is it for?',
      answer:
        'UKI is the utility token for the Cukies World game economy. It connects games, competition credits, Cukie Master, pools, rankings, Cukies, and rewards.',
    },
    {
      question: 'Which token is used in the UKI presale?',
      answer:
        'ASM is the main currency planned for the UKI presale. The ASM to UKI ratio will remain fixed during the presale period.',
    },
    {
      question: 'Do vested UKI count toward Cukie Master?',
      answer:
        'Yes. UKI bought in the presale and subject to vesting automatically counts toward up to 5 Cukie Master slots per wallet (1 slot for every 20,000 UKI bought).',
    },
    {
      question: 'Will Cukies have utility?',
      answer:
        'Yes. At launch, Cukies will be used to play Treasure Hunt and earn rewards, and they can also be lent out for passive earning. Their utility will expand as the ecosystem grows.',
    },
    {
      question: 'How can I earn in Cukies World?',
      answer: `There are several ways to earn rewards. Actively, you can play every day and earn UKI in each game, plus compete in the weekly tournament for larger rewards.

Passively, you can stake UKI to become a Cukie Master, lend the competition credits you receive to other players, and share the UKI they generate. You can also lend your Cukies to earn more.`,
    },
  ],
};
