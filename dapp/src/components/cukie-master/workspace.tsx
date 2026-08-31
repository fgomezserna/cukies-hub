'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Coins,
  Crown,
  Gem,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { CompetitionCreditPanel } from '@/components/cukie-master/credit-panel';
import { CukieMasterNftVaultPanel } from '@/components/cukie-master/nft-vault-panel';
import { CukieMasterStatusPanel } from '@/components/cukie-master/status-panel';
import type { UkiRoutePreview } from '@/components/cukie-master/types';
import { UkiStakingPanel } from '@/components/cukie-master/uki-staking-panel';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { useAuth } from '@/providers/auth-provider';

type MasterRoute = 'uki' | 'nft';

const ROUTES = {
  uki: {
    eyebrow: 'Con UKI',
    title: 'Deposita UKI',
    requirement: '20.000 UKI por cupo',
    description: 'Tu asignación pendiente de vesting ya cuenta. Solo añades lo que te falte.',
    icon: Coins,
  },
  nft: {
    eyebrow: 'Con tus Cukies',
    title: 'Deposita Cukies Originales',
    requirement: '3 puntos de rareza por cupo',
    description: 'Usa la rareza de tus Cukies Originales sin mezclar el límite de la ruta UKI.',
    icon: Gem,
  },
} as const;

export function CukieMasterWorkspace({ testnetOnly = false }: { testnetOnly?: boolean }) {
  const { user, isLoading: authLoading } = useAuth();
  const [activeRoute, setActiveRoute] = useState<MasterRoute>('uki');
  const [routePreview, setRoutePreview] = useState<UkiRoutePreview | null>(null);
  const handleRoutePreview = useCallback((preview: UkiRoutePreview | null) => {
    setRoutePreview(preview);
  }, []);

  useEffect(() => {
    const selectRouteFromHash = () => {
      const route = window.location.hash === '#cukie-master-nft-staking'
        ? 'nft'
        : window.location.hash === '#uki-staking'
          ? 'uki'
          : null;

      if (!route) return;
      setActiveRoute(route);
      window.setTimeout(() => {
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
      }, 0);
    };

    selectRouteFromHash();
    window.addEventListener('hashchange', selectRouteFromHash);
    return () => window.removeEventListener('hashchange', selectRouteFromHash);
  }, []);

  useEffect(() => {
    if (!user?.walletAddress || !window.location.hash) return;
    const timer = window.setTimeout(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user?.walletAddress]);

  if (authLoading) return <CukieMasterEntrySkeleton />;
  if (!user?.walletAddress) return <CukieMasterEntry />;

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <header className="relative overflow-hidden border-b border-white/10 pb-7 pt-1 sm:pb-9">
        <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-[var(--uki-lilac)]/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-[var(--uki-lilac)]">Tu espacio Cukie Master</p>
            <h1 className="mt-2 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
              Consulta tu posición y gestiona el siguiente paso
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
              Primero revisa tus cupos. Después elige si quieres gestionar UKI o Cukies y, por último, decide qué hacer con tus créditos.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 border-l-2 border-[var(--uki-lilac)] pl-4">
            <Sparkles className="h-6 w-6 text-[var(--uki-lilac)]" aria-hidden="true" />
            <div>
              <p className="font-headline text-2xl font-black text-[var(--uki-cream)]">100 créditos</p>
              <p className="text-xs font-semibold text-[var(--uki-muted)]">por cupo activo y día elegible</p>
            </div>
          </div>
        </div>
      </header>

      <div className="pt-7">
        <JourneyStep number="01" label="Comprueba tus cupos" />
        <CukieMasterStatusPanel overview onUkiRouteData={handleRoutePreview} />
      </div>

      <section id="gestionar-cupo" aria-labelledby="gestionar-cupo-title" className="scroll-mt-24 pb-8">
        <JourneyStep number="02" label="Elige qué quieres gestionar" />
        <div className="mt-4 overflow-hidden rounded-[18px] border border-white/10 bg-black/25">
          <div className="grid lg:grid-cols-[1.12fr_0.88fr]" role="tablist" aria-label="Vías Cukie Master">
            {(Object.keys(ROUTES) as MasterRoute[]).map((route) => (
              <RouteSelector
                key={route}
                route={route}
                active={activeRoute === route}
                onSelect={setActiveRoute}
              />
            ))}
          </div>
        </div>
        <h2 id="gestionar-cupo-title" className="sr-only">Gestiona una vía Cukie Master</h2>
      </section>

      <div role="tabpanel" aria-label={ROUTES[activeRoute].title}>
        {activeRoute === 'uki' ? (
          <UkiStakingPanel testnetOnly={testnetOnly} routePreview={routePreview} />
        ) : (
          <CukieMasterNftVaultPanel />
        )}
      </div>

      <JourneyStep number="03" label="Gestiona los créditos de tus cupos" />
      <CompetitionCreditPanel />
    </div>
  );
}

function CukieMasterEntry() {
  return (
    <section aria-labelledby="cukie-master-entry-title" className="mx-auto w-full max-w-[1480px] pb-10">
      <div className="relative overflow-hidden rounded-[22px] border border-[var(--uki-lilac-border)] bg-[#09060f] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
        <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-[var(--uki-lilac)]/10 blur-3xl" />
        <div className="relative grid min-h-[38rem] lg:grid-cols-[1.02fr_0.98fr]">
          <div className="relative z-10 flex flex-col justify-center p-6 sm:p-10 lg:p-12 xl:p-16">
            <div className="flex items-center gap-3 text-sm font-bold text-[var(--uki-lilac)]">
              <Crown className="h-5 w-5" aria-hidden="true" />
              <span>Tu acceso diario al ecosistema</span>
            </div>
            <h1
              id="cukie-master-entry-title"
              className="mt-5 max-w-3xl text-balance font-headline text-[clamp(2.7rem,5.6vw,5.6rem)] font-black leading-[0.88] tracking-[-0.055em] text-[var(--uki-cream)]"
            >
              Hazte Cukie Master
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base font-semibold leading-relaxed text-[var(--uki-text)] sm:text-lg">
              Activa cupos con UKI o con tus Cukies Originales. Cada cupo que complete su validación recibe créditos diarios para jugar o aportar al pool.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <LandingWalletConnectButton
                className="min-h-12 justify-center px-5"
                evmOnly
                label="Conectar wallet"
                compactLabel="Conectar wallet"
                showCompactText={false}
              />
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--uki-muted)]">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                <span>Solo pediremos una firma para identificar tu wallet.</span>
              </div>
            </div>

            <ol className="mt-10 border-y border-white/10">
              {(Object.keys(ROUTES) as MasterRoute[]).map((route, index) => {
                const item = ROUTES[route];
                const Icon = item.icon;
                return (
                  <li key={route} className="grid gap-3 border-b border-white/10 py-4 last:border-b-0 sm:grid-cols-[2.75rem_1fr_auto] sm:items-center">
                    <span className="font-headline text-sm font-black text-[var(--uki-lilac)]">0{index + 1}</span>
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-headline text-base font-black text-[var(--uki-cream)]">{item.title}</p>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">{item.description}</p>
                      </div>
                    </div>
                    <p className="pl-[2rem] text-sm font-black text-[var(--uki-cream)] sm:pl-0 sm:text-right">{item.requirement}</p>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="relative min-h-[25rem] overflow-hidden border-t border-white/10 lg:min-h-0 lg:border-l lg:border-t-0">
            <Image
              src="/brand/generated/uki-cukie-master-scene-v3.png"
              alt="Cukie Master frente a un portal violeta"
              fill
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover object-[64%_center]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09060f] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#09060f]/55 lg:via-transparent lg:to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 rounded-[14px] border border-white/15 bg-[#0a0611]/88 p-4 shadow-2xl backdrop-blur-md sm:bottom-7 sm:left-7 sm:right-auto sm:min-w-[18rem]">
              <p className="text-sm font-bold text-[var(--uki-lilac)]">Cuando tu cupo esté activo</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-headline text-4xl font-black text-[var(--uki-cream)]">100</span>
                <span className="pb-1 text-sm font-semibold text-[var(--uki-text)]">créditos al día</span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">Tú eliges cuánto conservar para jugar y cuánto aportar al pool.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CukieMasterEntrySkeleton() {
  return (
    <div role="status" aria-label="Preparando Cukie Master" className="mx-auto w-full max-w-[1480px] pb-10">
      <div className="grid min-h-[38rem] animate-pulse overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.025] lg:grid-cols-[1.02fr_0.98fr]">
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12 xl:p-16">
          <div className="h-5 w-48 rounded bg-white/[0.08]" />
          <div className="mt-6 h-28 max-w-xl rounded bg-white/[0.08]" />
          <div className="mt-6 h-14 max-w-lg rounded bg-white/[0.06]" />
          <div className="mt-8 h-12 w-64 rounded bg-white/[0.08]" />
          <div className="mt-10 h-40 max-w-xl rounded bg-white/[0.05]" />
        </div>
        <div className="min-h-[24rem] bg-white/[0.045]" />
      </div>
    </div>
  );
}

function JourneyStep({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-headline text-sm font-black text-[var(--uki-lilac)]">{number}</span>
      <span className="h-px w-8 bg-[var(--uki-lilac)]/45" aria-hidden="true" />
      <p className="text-sm font-bold text-[var(--uki-text)]">{label}</p>
    </div>
  );
}

function RouteSelector({
  active,
  onSelect,
  route,
}: {
  active: boolean;
  onSelect: (route: MasterRoute) => void;
  route: MasterRoute;
}) {
  const item = ROUTES[route];
  const Icon = item.icon;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(route)}
      className={`group relative min-w-0 border-b border-white/10 p-5 text-left transition-colors last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 sm:p-6 ${
        active ? 'bg-[var(--uki-lilac-soft)]' : 'hover:bg-white/[0.035]'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 transition-colors ${active ? 'bg-[var(--uki-lilac)]' : 'bg-transparent'}`} />
      <span className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
          active
            ? 'border-[var(--uki-lilac)] bg-[var(--uki-lilac)] text-[#09060f]'
            : 'border-white/15 text-[var(--uki-muted)] group-hover:text-[var(--uki-lilac)]'
        }`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-xs font-bold text-[var(--uki-lilac)]">{item.eyebrow}</span>
          <span className="mt-1 flex items-center justify-between gap-3">
            <span className="font-headline text-xl font-black text-[var(--uki-cream)]">{item.title}</span>
            <ArrowRight className={`h-5 w-5 shrink-0 transition-transform ${active ? 'text-[var(--uki-lilac)]' : 'text-[var(--uki-muted)] group-hover:translate-x-1'}`} aria-hidden="true" />
          </span>
          <span className="mt-2 block text-sm font-semibold text-[var(--uki-muted)]">{item.requirement}</span>
        </span>
      </span>
    </button>
  );
}
