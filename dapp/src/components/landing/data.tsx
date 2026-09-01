import {
  BarChart3,
  Coins,
  Crown,
  Gamepad2,
  LockKeyhole,
  ShieldCheck,
  Trophy,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

import type { PublicLocale } from '@/lib/public-locale';

export type LandingIcon = LucideIcon;

export const UKI_MAINNET_ADDRESSES = Object.freeze({
  token: '0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA',
  asm: '0x707F0f4a39a4a26239F7D00463B15AB5656861f9',
  pair: '0x40b315f31421b5D31DE018055Cb30f78265024Be',
  staking: '0xaD18ff665E99d0033c3BB9d73182c2B03Df59696',
  locker: '0xb3E43944DF782EEeD9A99f0CFA4301c72b9629E6',
});

export const UKI_LIQUIDITY_UNLOCK_LABEL = '23 feb 2027 · 15:33 UTC';

export const PANCAKESWAP_UKI_URL =
  `https://pancakeswap.finance/swap?chain=bsc&inputCurrency=${UKI_MAINNET_ADDRESSES.asm}&outputCurrency=${UKI_MAINNET_ADDRESSES.token}`;

export const bscScanAddressUrl = (address: string) =>
  `https://bscscan.com/address/${address}`;

export const bscScanTokenUrl = (address: string) =>
  `https://bscscan.com/token/${address}`;

export const participationStepsByLocale: Record<
  PublicLocale,
  Array<{ icon: LandingIcon; number: string; title: string; text: string; href: string; action: string; external?: boolean }>
> = {
  es: [
    {
      icon: Coins,
      number: '01',
      title: 'Consigue UKI',
      text: 'Compra UKI con BNB, USDT, USDC o ASM desde el formulario directo de la portada.',
      href: '/#comprar-uki',
      action: 'Comprar UKI',
    },
    {
      icon: Crown,
      number: '02',
      title: 'Haz staking',
      text: 'Deposita UKI desde Cukie Master y espera a que la red confirme la operación.',
      href: '/cukie-master',
      action: 'Gestionar staking',
    },
    {
      icon: Gamepad2,
      number: '03',
      title: 'Juega el torneo',
      text: 'Cada 2.000 UKI completos en staking conceden un intento en la competición actual.',
      href: '/games/treasure-hunt',
      action: 'Entrar al torneo',
    },
  ],
  en: [
    {
      icon: Coins,
      number: '01',
      title: 'Get UKI',
      text: 'Buy UKI with BNB, USDT, USDC, or ASM through the direct form on the home page.',
      href: '/#comprar-uki',
      action: 'Buy UKI',
    },
    {
      icon: Crown,
      number: '02',
      title: 'Stake UKI',
      text: 'Deposit UKI from Cukie Master and wait for the network to confirm the transaction.',
      href: '/cukie-master',
      action: 'Manage staking',
    },
    {
      icon: Gamepad2,
      number: '03',
      title: 'Play the tournament',
      text: 'Every complete 2,000 UKI staked grants one attempt in the current competition.',
      href: '/games/treasure-hunt',
      action: 'Enter tournament',
    },
  ],
};

export const utilityCardsByLocale: Record<
  PublicLocale,
  Array<{ icon: LandingIcon; title: string; text: string; tone: string }>
> = {
  es: [
    {
      icon: WalletCards,
      title: 'Staking verificable',
      text: 'Tus depósitos y retiradas quedan registrados en BNB Smart Chain.',
      tone: 'text-[var(--uki-cyan)]',
    },
    {
      icon: Gamepad2,
      title: 'Acceso a partidas',
      text: 'El torneo convierte el staking confirmado en intentos disponibles.',
      tone: 'text-[var(--uki-gold)]',
    },
    {
      icon: BarChart3,
      title: 'Rankings congelados',
      text: 'Las clasificaciones cerradas se publican como snapshots y no se recalculan.',
      tone: 'text-[#f19bff]',
    },
    {
      icon: Trophy,
      title: 'Premios revisados',
      text: 'Los resultados y ganadores se revisan al finalizar cada edición.',
      tone: 'text-[#ff8e7a]',
    },
  ],
  en: [
    {
      icon: WalletCards,
      title: 'Verifiable staking',
      text: 'Your deposits and withdrawals are recorded on BNB Smart Chain.',
      tone: 'text-[var(--uki-cyan)]',
    },
    {
      icon: Gamepad2,
      title: 'Game access',
      text: 'The tournament turns confirmed staking into available attempts.',
      tone: 'text-[var(--uki-gold)]',
    },
    {
      icon: BarChart3,
      title: 'Frozen rankings',
      text: 'Closed rankings are published as snapshots and are not recalculated.',
      tone: 'text-[#f19bff]',
    },
    {
      icon: Trophy,
      title: 'Reviewed rewards',
      text: 'Results and winners are reviewed after each edition closes.',
      tone: 'text-[#ff8e7a]',
    },
  ],
};

export const transparencyItemsByLocale: Record<
  PublicLocale,
  Array<{ icon: LandingIcon; label: string; value: string; helper: string; href: string }>
> = {
  es: [
    {
      icon: Coins,
      label: 'Token UKI',
      value: `${UKI_MAINNET_ADDRESSES.token.slice(0, 8)}…${UKI_MAINNET_ADDRESSES.token.slice(-6)}`,
      helper: 'Contrato BEP-20',
      href: bscScanTokenUrl(UKI_MAINNET_ADDRESSES.token),
    },
    {
      icon: ShieldCheck,
      label: 'Pool ASM / UKI',
      value: `${UKI_MAINNET_ADDRESSES.pair.slice(0, 8)}…${UKI_MAINNET_ADDRESSES.pair.slice(-6)}`,
      helper: 'PancakeSwap V2',
      href: bscScanAddressUrl(UKI_MAINNET_ADDRESSES.pair),
    },
    {
      icon: Crown,
      label: 'Staking UKI',
      value: `${UKI_MAINNET_ADDRESSES.staking.slice(0, 8)}…${UKI_MAINNET_ADDRESSES.staking.slice(-6)}`,
      helper: 'Contrato operativo',
      href: bscScanAddressUrl(UKI_MAINNET_ADDRESSES.staking),
    },
    {
      icon: LockKeyhole,
      label: 'Liquidez bloqueada',
      value: UKI_LIQUIDITY_UNLOCK_LABEL,
      helper: 'Locker sin comisión',
      href: bscScanAddressUrl(UKI_MAINNET_ADDRESSES.locker),
    },
  ],
  en: [
    {
      icon: Coins,
      label: 'UKI token',
      value: `${UKI_MAINNET_ADDRESSES.token.slice(0, 8)}…${UKI_MAINNET_ADDRESSES.token.slice(-6)}`,
      helper: 'BEP-20 contract',
      href: bscScanTokenUrl(UKI_MAINNET_ADDRESSES.token),
    },
    {
      icon: ShieldCheck,
      label: 'ASM / UKI pool',
      value: `${UKI_MAINNET_ADDRESSES.pair.slice(0, 8)}…${UKI_MAINNET_ADDRESSES.pair.slice(-6)}`,
      helper: 'PancakeSwap V2',
      href: bscScanAddressUrl(UKI_MAINNET_ADDRESSES.pair),
    },
    {
      icon: Crown,
      label: 'UKI staking',
      value: `${UKI_MAINNET_ADDRESSES.staking.slice(0, 8)}…${UKI_MAINNET_ADDRESSES.staking.slice(-6)}`,
      helper: 'Live contract',
      href: bscScanAddressUrl(UKI_MAINNET_ADDRESSES.staking),
    },
    {
      icon: LockKeyhole,
      label: 'Locked liquidity',
      value: UKI_LIQUIDITY_UNLOCK_LABEL,
      helper: 'Fee-free locker',
      href: bscScanAddressUrl(UKI_MAINNET_ADDRESSES.locker),
    },
  ],
};

export const landingCopyByLocale = {
  es: {
    hero: {
      badge: 'UKI · BNB Smart Chain',
      title: 'UKI ya está activo',
      lead: 'Compra UKI, haz staking y participa en el Torneo Lanzamiento de Treasure Hunt.',
      play: 'Entrar al torneo',
      stake: 'Hacer staking',
      buy: 'Comprar UKI',
      live: 'Ecosistema operativo',
      pool: 'Pool oficial V2',
      staking: 'Staking activo',
      lock: 'LP bloqueados',
      lockValue: 'Hasta 23 feb 2027',
      network: 'BNB Smart Chain',
    },
    flow: {
      eyebrow: 'Empieza aquí',
      title: 'De UKI a la competición',
      subtitle: 'Un recorrido directo y verificable para entrar en el ecosistema actual.',
      warning: 'En el torneo vigente, retirar cualquier cantidad de UKI después de jugar descalifica la wallet para esa edición.',
    },
    competition: {
      eyebrow: 'Competición oficial · Lanzamiento UKI',
      title: 'Torneo Lanzamiento UKI',
      text: 'Deposita UKI, consigue intentos y compite con tus mejores resultados en Treasure Hunt.',
      prize: 'Premio acumulado',
      attempts: 'Intentos disponibles',
      counted: 'Resultados que cuentan',
      connect: 'Conecta wallet',
      play: 'Jugar ahora',
      rankings: 'Ver rankings',
      active: 'En curso',
      scheduled: 'Próximamente',
      closed: 'Finalizada',
      disabled: 'Inactiva',
      unconfigured: 'Pendiente',
      starts: 'Comienza en',
      ends: 'Finaliza en',
      finished: 'Competición finalizada',
      loading: 'Actualizando…',
      unavailable: 'Los datos en directo se están actualizando. Puedes entrar al torneo y consultar su estado allí.',
      disqualified: 'Esta wallet está descalificada para la edición actual.',
    },
    utility: {
      eyebrow: 'Utilidad disponible',
      title: 'UKI conecta staking, juego y competición',
      subtitle: 'La home muestra únicamente las funciones que ya están operativas o verificables.',
    },
    staking: {
      badge: 'Cukie Master',
      title: 'El staking de UKI ya está operativo',
      text: 'Deposita o retira UKI desde una única pantalla. El torneo utiliza el saldo confirmado para calcular tus intentos.',
      bullets: ['Depósitos y retiradas on-chain', 'Estado actualizado tras las confirmaciones', 'Acceso directo desde Treasure Hunt'],
      action: 'Gestionar staking UKI',
      helper: 'Necesitas BNB para pagar el gas de la red.',
    },
    community: {
      badge: 'Economía centrada en la comunidad',
      titleTop: 'Más del 60% de UKI',
      titleBottom: 'está destinado a la comunidad',
      leadPrefix: 'Más del 60% del supply total de UKI está reservado para recompensar la participación en el ecosistema durante',
      leadStrong: '6 años.',
      principle: 'La utilidad se incorpora por fases y se comunica cuando cada función está disponible.',
      tokenomicsButton: 'Consultar tokenomics',
      ringLabel: 'del supply destinado a la comunidad',
      years: '6 años',
      yearsLabel: 'de distribución prevista',
      footer: 'Staking, competición y juego ya forman parte de esta nueva etapa.',
    },
    presale: {
      badge: 'Preventa finalizada',
      title: '¿Participaste en la preventa?',
      text: 'Tu compra sigue teniendo sus accesos propios. Consulta la asignación, los premios y las clasificaciones publicadas sin mezclarlo con la compra actual de UKI.',
      vesting: 'Consultar vesting',
      rewards: 'Ver premios',
      history: 'Ver clasificaciones',
    },
    transparency: {
      eyebrow: 'Transparencia on-chain',
      title: 'Comprueba cada pieza del lanzamiento',
      subtitle: 'Direcciones oficiales en BNB Smart Chain. Verifica siempre el contrato antes de firmar una operación.',
      open: 'Abrir en BscScan',
    },
    faq: {
      eyebrow: 'Preguntas frecuentes',
      title: 'Lo esencial antes de empezar',
      ctaTitle: 'Elige tu siguiente paso',
      ctaText: 'Entra al torneo si ya tienes intentos o gestiona primero tu staking de UKI.',
      play: 'Entrar al torneo',
      stake: 'Gestionar staking',
    },
  },
  en: {
    hero: {
      badge: 'UKI · BNB Smart Chain',
      title: 'UKI is now live',
      lead: 'Buy UKI, stake it, and join the Treasure Hunt Launch Tournament.',
      play: 'Enter tournament',
      stake: 'Stake UKI',
      buy: 'Buy UKI',
      live: 'Ecosystem live',
      pool: 'Official V2 pool',
      staking: 'Staking live',
      lock: 'LP locked',
      lockValue: 'Until 23 Feb 2027',
      network: 'BNB Smart Chain',
    },
    flow: {
      eyebrow: 'Start here',
      title: 'From UKI to competition',
      subtitle: 'A direct, verifiable path into the ecosystem that is live today.',
      warning: 'In the current tournament, withdrawing any amount of UKI after playing disqualifies the wallet for that edition.',
    },
    competition: {
      eyebrow: 'Official competition · UKI launch',
      title: 'UKI Launch Tournament',
      text: 'Stake UKI, get attempts, and compete with your best Treasure Hunt results.',
      prize: 'Prize pool',
      attempts: 'Available attempts',
      counted: 'Counted results',
      connect: 'Connect wallet',
      play: 'Play now',
      rankings: 'View rankings',
      active: 'Live',
      scheduled: 'Coming soon',
      closed: 'Finished',
      disabled: 'Inactive',
      unconfigured: 'Pending',
      starts: 'Starts in',
      ends: 'Ends in',
      finished: 'Competition finished',
      loading: 'Updating…',
      unavailable: 'Live data is being updated. You can enter the tournament and check its status there.',
      disqualified: 'This wallet is disqualified from the current edition.',
    },
    utility: {
      eyebrow: 'Available utility',
      title: 'UKI connects staking, play, and competition',
      subtitle: 'The home page only presents functions that are already live or verifiable.',
    },
    staking: {
      badge: 'Cukie Master',
      title: 'UKI staking is now live',
      text: 'Deposit or withdraw UKI from one screen. The tournament uses your confirmed balance to calculate attempts.',
      bullets: ['On-chain deposits and withdrawals', 'Status updated after confirmations', 'Direct access from Treasure Hunt'],
      action: 'Manage UKI staking',
      helper: 'You need BNB to pay network gas.',
    },
    community: {
      badge: 'Community-centered economy',
      titleTop: 'More than 60% of UKI',
      titleBottom: 'is allocated to the community',
      leadPrefix: 'More than 60% of the total UKI supply is reserved to reward participation across the ecosystem over',
      leadStrong: '6 years.',
      principle: 'Utility is released in phases and communicated when each function is available.',
      tokenomicsButton: 'View tokenomics',
      ringLabel: 'of supply allocated to the community',
      years: '6 years',
      yearsLabel: 'of planned distribution',
      footer: 'Staking, competition, and play are already part of this new stage.',
    },
    presale: {
      badge: 'Presale completed',
      title: 'Did you join the presale?',
      text: 'Your purchase keeps its dedicated access points. Review allocation, rewards, and published rankings without mixing them with the current UKI purchase flow.',
      vesting: 'View vesting',
      rewards: 'View rewards',
      history: 'View rankings',
    },
    transparency: {
      eyebrow: 'On-chain transparency',
      title: 'Verify every part of the launch',
      subtitle: 'Official BNB Smart Chain addresses. Always verify the contract before signing a transaction.',
      open: 'Open in BscScan',
    },
    faq: {
      eyebrow: 'Frequently asked questions',
      title: 'What to know before you start',
      ctaTitle: 'Choose your next step',
      ctaText: 'Enter the tournament if you already have attempts, or manage your UKI staking first.',
      play: 'Enter tournament',
      stake: 'Manage staking',
    },
  },
} as const;

export const faqsByLocale: Record<PublicLocale, Array<{ question: string; answer: string }>> = {
  es: [
    {
      question: '¿Dónde puedo comprar UKI?',
      answer: 'Puedes comprar UKI directamente desde el formulario de la portada con BNB, USDT, USDC o ASM. La operación se ejecuta en PancakeSwap V2.',
    },
    {
      question: '¿Puedo indicar cuántos UKI quiero comprar?',
      answer: 'Sí. Puedes escribir lo que quieres pagar o la cantidad exacta de UKI que quieres recibir; el otro importe se calcula automáticamente.',
    },
    {
      question: '¿Cómo consigo intentos para el torneo?',
      answer: 'Cada 2.000 UKI completos en staking conceden un intento. El saldo debe estar confirmado e indexado antes de que aparezca en Treasure Hunt.',
    },
    {
      question: '¿Qué resultados entran en el ranking?',
      answer: 'Puedes jugar los intentos concedidos, pero solo cuentan tus 10 mejores resultados en la edición actual.',
    },
    {
      question: '¿Qué ocurre si retiro UKI después de jugar?',
      answer: 'La wallet queda descalificada para la edición actual, aunque vuelva a depositar los UKI posteriormente.',
    },
    {
      question: '¿Qué ocurre con mi compra de preventa?',
      answer: 'La preventa ha finalizado. Puedes consultar por separado tu asignación, el vesting, los premios y las clasificaciones históricas.',
    },
  ],
  en: [
    {
      question: 'Where can I buy UKI?',
      answer: 'You can buy UKI directly from the home-page form with BNB, USDT, USDC, or ASM. The transaction executes through PancakeSwap V2.',
    },
    {
      question: 'Can I choose how much UKI I want to buy?',
      answer: 'Yes. Enter either what you want to pay or the exact amount of UKI you want to receive, and the other amount is calculated automatically.',
    },
    {
      question: 'How do I get tournament attempts?',
      answer: 'Every complete 2,000 UKI staked grants one attempt. The balance must be confirmed and indexed before it appears in Treasure Hunt.',
    },
    {
      question: 'Which results enter the ranking?',
      answer: 'You can use every granted attempt, but only your 10 best results count in the current edition.',
    },
    {
      question: 'What happens if I withdraw UKI after playing?',
      answer: 'The wallet is disqualified from the current edition, even if the UKI is deposited again later.',
    },
    {
      question: 'What happens to my presale purchase?',
      answer: 'The presale has ended. You can review your allocation, vesting, rewards, and historical rankings separately.',
    },
  ],
};
