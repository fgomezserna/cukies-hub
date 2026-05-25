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
  { label: 'Preventa', href: '#presale' },
  { label: 'Comprar', href: '#token' },
  { label: 'Cukie Master', href: '/cukie-master' },
  { label: 'Hodler', href: '/cukie-hodler' },
  { label: 'Jugar', href: '/como-jugar' },
  { label: 'Cukies', href: '/cukies' },
];

export const trustSignals = [
  { icon: Zap, label: 'Red', value: 'BNB Smart Chain' },
  { icon: ShieldCheck, label: 'Liquidez', value: 'Bloqueada' },
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
    subtitle: '9 meses lineal, sin cliff',
    color: '#2ee8d6',
    labels: ['Mes 0', 'Mes 3', 'Mes 6', 'Mes 9'],
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
    title: 'Créditos',
    text: 'Usa recursos internos de juego.',
    icon: Coins,
    className: 'uki-node-gold',
    positionClassName: 'uki-node-credits',
  },
  {
    title: 'Pools',
    text: 'Comparte recursos bajo reglas claras.',
    icon: Database,
    className: 'uki-node-blue',
    positionClassName: 'uki-node-pools',
  },
  {
    title: 'Cukie Master',
    text: 'Desbloquea cupos y créditos diarios.',
    icon: Crown,
    className: 'uki-node-pink',
    positionClassName: 'uki-node-master',
  },
  {
    title: 'Mundos futuros',
    text: 'Expande el universo Cukies.',
    icon: Network,
    className: 'uki-node-green',
    positionClassName: 'uki-node-worlds',
  },
  {
    title: 'Rewards',
    text: 'Sigue asignaciones por periodo.',
    icon: Gift,
    className: 'uki-node-red',
    positionClassName: 'uki-node-rewards',
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
    title: "Cukies Rush n' Run",
    text: 'Acción / runner',
    image: '/portada_jump_Hop.jpg',
  },
  {
    title: 'Cukies Island',
    text: 'Aventura / mundo',
    image: '/portada_cukies_island.jpg',
  },
  {
    title: 'Cukies Brain Buzz',
    text: 'Trivia / competición',
    image: '/portada_brain_buzz.jpg',
  },
  {
    title: 'Más juegos',
    text: 'En preparación',
    image: '/Powered_up_2.png',
  },
];

export const faqs = [
  {
    question: '¿Qué es UKI y para qué sirve?',
    answer:
      'UKI es el token de utilidad previsto para la economía de juegos de Cukies World. Conecta juegos, créditos, Cukie Master, pools, rewards y futuras funciones del ecosistema.',
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
