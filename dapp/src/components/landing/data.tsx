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

export type LandingIcon = LucideIcon;

export const navItems = [
  { label: 'Inicio', href: '#presale' },
  { label: 'Premios', href: '/premios' },
];

export const trustSignals = [
  { icon: Zap, label: 'Red', value: 'BNB Smart Chain' },
  { icon: Timer, label: 'Inicio', value: '15 junio' },
  { icon: Users, label: 'Comunidad', value: 'Desde 2021' },
];

export const saleFacts = [
  { icon: Coins, label: 'Precio', value: '$0.01', helper: 'Por UKI' },
  { icon: Calendar, label: 'Duración', value: '1 mes', helper: 'Periodo de preventa' },
  { icon: CircleDollarSign, label: 'Compra con', value: 'ASM', helper: 'Moneda principal' },
  { icon: Lock, label: 'Vesting', value: '9 meses', helper: 'Lineal sin cliff' },
  { icon: Trophy, label: 'Listing', value: 'Mínimo $0.012', helper: 'Objetivo inicial' },
  { icon: ShieldCheck, label: 'Liquidez', value: 'Bloqueada', helper: '9+ meses' },
];

export const purchaseSteps = [
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
];

export const vestingTracks = [
  {
    icon: Lock,
    title: 'Vesting comprador',
    subtitle: 'Consulta disponible para wallets con compra',
    color: '#2ee8d6',
    labels: ['Asignación', 'Contrato', 'Desbloqueos', 'Claim'],
  },
  {
    icon: Users,
    title: 'Vesting equipo',
    subtitle: '9 meses cliff + 24 meses vesting',
    color: '#4d93ff',
    labels: ['0', 'Cliff', 'Mes 9', 'Mes 21', 'Mes 33'],
  },
  {
    icon: Gift,
    title: 'Programa Cukie Master',
    subtitle: 'Asignaciones durante 6 años',
    color: '#91d867',
    labels: ['Año 1', 'Año 3', 'Año 5', 'Año 6'],
  },
];

export const utilityNodes = [
  {
    title: 'Juegos',
    text: 'Juega y compite.',
    icon: Gamepad2,
    className: 'uki-node-purple',
    positionClassName: 'uki-node-games',
  },
  {
    title: 'Skills y cría',
    text: 'Crea nuevos Cukies y mejora sus habilidades.',
    icon: Sparkles,
    className: 'uki-node-gold',
    positionClassName: 'uki-node-credits',
  },
  {
    title: 'Recompensas',
    text: 'Participa y gana UKI cada día.',
    icon: Gift,
    className: 'uki-node-blue',
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
    title: 'Gobernanza',
    text: 'Forma parte de las decisiones.',
    icon: Network,
    className: 'uki-node-green',
    positionClassName: 'uki-node-worlds',
  },
  {
    title: 'Marketplace',
    text: 'Compra y vende Cukies y recursos para los juegos.',
    icon: Database,
    className: 'uki-node-red',
    positionClassName: 'uki-node-rewards',
  },
];

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

export const presalePrizeTiers = [
  { amount: '10,000 UKI', prize: 'Sorteo 10 Cukies 2ª Generación', helper: 'Rarezas variadas' },
  { amount: '30,000 UKI', prize: 'Sorteo 5 Cukies Common' },
  { amount: '50,000 UKI', prize: 'Sorteo 2 Cukies Rare + 3 Uncommon' },
  { amount: '80,000 UKI', prize: 'Sorteo 1 Cukie Epic + 2 Rare + 2 Uncommon' },
  { amount: '125,000 UKI', prize: 'Sorteo 1 Cukie Legendary + 3 Epic' },
  { amount: '150,000 UKI', prize: 'Sorteo 1 Cukie Goat + 3 Legendary', helper: '+1 ticket adicional en cada sorteo desde este tramo' },
];

export const gameCards = [
  {
    title: "Jump n' Hop",
    text: 'Acción / Plataformas',
    image: '/brand/generated/uki-timeline-economy.svg',
  },
  {
    title: 'Cukies Island',
    text: 'Estrategia / Simulación',
    image: '/brand/generated/uki-final-cta-scene-v2.png',
  },
  {
    title: 'Brain Buzz',
    text: 'Trivia / Conocimiento',
    image: '/brand/generated/uki-utility-map-scene-v2.png',
  },
];

export const faqs = [
  {
    question: '¿Qué es UKI y para qué sirve?',
    answer:
      'UKI es el token de utilidad de la economía de juegos de Cukies World. Conecta juegos, créditos de competición, Cukie Master, pools, rankings, Cukies y recompensas.',
  },
  {
    question: '¿Por qué la preventa se compra con ASM?',
    answer:
      'ASM es la moneda principal prevista para la primera distribución de UKI. El ratio ASM -> UKI se fijará al inicio de la preventa y se mantendrá durante el periodo.',
  },
  {
    question: '¿Cómo funciona el vesting?',
    answer:
      'El UKI comprado en preventa se libera linealmente durante 9 meses, sin cliff. La asignación pendiente no está disponible hasta su desbloqueo.',
  },
  {
    question: '¿Los UKI en vesting cuentan para Cukie Master?',
    answer:
      'Sí. Los UKI comprados en preventa y sujetos a vesting cuentan para los cupos de Cukie Master por ruta UKI cuando la funcionalidad se active.',
  },
  {
    question: '¿Los NFTs Cukies tendrán utilidad?',
    answer:
      'Sí. La utilidad depende de ownership, rareza, estado de marketplace/bridge y reglas activas de la dapp.',
  },
  {
    question: '¿Cómo se estructuran rewards y pools?',
    answer:
      'Las rewards combinan reglas de juego, créditos, pools y ranking por periodo. Las estimaciones no deben mostrarse como claimable hasta que exista validación y, cuando aplique, confirmación on-chain.',
  },
];
