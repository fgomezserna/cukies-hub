'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Coins,
  Crown,
  Gem,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { CukieMasterNftVaultPanel } from '@/components/cukie-master/nft-vault-panel';
import { CukieMasterStatusPanel } from '@/components/cukie-master/status-panel';
import type { UkiRoutePreview } from '@/components/cukie-master/types';
import { UkiStakingPanel } from '@/components/cukie-master/uki-staking-panel';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/providers/auth-provider';

type MasterRoute = 'uki' | 'nft';

function routeFromLocation() {
  if (typeof window === 'undefined') return null;
  const tokenId = new URLSearchParams(window.location.search).get('tokenId');
  const hashTarget = window.location.hash.slice(1);
  if (hashTarget === 'uki-staking') return { route: 'uki' as const, target: hashTarget };
  if (hashTarget === 'cukie-master-nft-staking' || hashTarget.startsWith('cukie-master-cukie-')) {
    return { route: 'nft' as const, target: hashTarget };
  }
  if (tokenId) return { route: 'nft' as const, target: `cukie-master-cukie-${tokenId}` };
  return null;
}

function routeHash(route: MasterRoute) {
  return route === 'nft' ? 'cukie-master-nft-staking' : 'uki-staking';
}

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
  const [visitedRoutes, setVisitedRoutes] = useState<Set<MasterRoute>>(() => new Set());
  const [navigationReady, setNavigationReady] = useState(false);
  const routeInteractionRef = useRef(false);
  const [hashTarget, setHashTarget] = useState<string | null>(null);
  const hashScrollHandledRef = useRef<string | null>(null);
  const [routePreview, setRoutePreview] = useState<UkiRoutePreview | null>(null);
  const handleRoutePreview = useCallback((preview: UkiRoutePreview | null) => {
    setRoutePreview(preview);
  }, []);

  useEffect(() => {
    const selectRouteFromHash = () => {
      const selection = routeFromLocation() ?? { route: 'uki' as const, target: '' };
      hashScrollHandledRef.current = null;
      setHashTarget(selection.target || null);
      setActiveRoute(selection.route);
      setVisitedRoutes((current) => current.has(selection.route)
        ? current
        : new Set([...current, selection.route]));
    };

    const initialSelection = routeFromLocation();
    if (!routeInteractionRef.current) {
      if (initialSelection) {
        setActiveRoute(initialSelection.route);
        setVisitedRoutes(new Set([initialSelection.route]));
        setHashTarget(initialSelection.target || null);
      } else {
        setActiveRoute('uki');
        setVisitedRoutes(new Set(['uki']));
        setHashTarget(null);
      }
    }
    setNavigationReady(true);
    window.addEventListener('hashchange', selectRouteFromHash);
    window.addEventListener('popstate', selectRouteFromHash);
    return () => {
      window.removeEventListener('hashchange', selectRouteFromHash);
      window.removeEventListener('popstate', selectRouteFromHash);
    };
  }, []);

  useEffect(() => {
    if (!hashTarget || hashTarget === hashScrollHandledRef.current) return;
    let disposed = false;
    let observer: MutationObserver | null = null;

    const scrollToTarget = () => {
      if (disposed) return;
      const target = document.getElementById(hashTarget);
      if (target && !target.closest('[hidden]')) {
        target.scrollIntoView?.({ block: 'start' });
        hashScrollHandledRef.current = hashTarget;
        observer?.disconnect();
        return;
      }
      if (observer) return;
      observer = new MutationObserver(() => scrollToTarget());
      observer.observe(document.body, { childList: true, subtree: true });
    };

    scrollToTarget();
    const timer = window.setTimeout(() => observer?.disconnect(), 5_000);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, [activeRoute, authLoading, hashTarget, navigationReady, user?.walletAddress]);

  function selectRoute(route: MasterRoute) {
    routeInteractionRef.current = true;
    setActiveRoute(route);
    setVisitedRoutes((current) => current.has(route) ? current : new Set([...current, route]));
    const hash = `#${routeHash(route)}`;
    hashScrollHandledRef.current = hash.slice(1);
    setHashTarget(hash.slice(1));
    if (window.location.hash !== hash) window.history.pushState(window.history.state, '', hash);
  }

  if (authLoading) return <CukieMasterEntrySkeleton />;
  if (!user?.walletAddress) return <CukieMasterEntry />;

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <header className="relative overflow-hidden border-b border-white/10 pb-7 pt-1 sm:pb-9">
        <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-[rgba(228,92,255,0.1)] blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-[var(--uki-lilac)]">Tu espacio Cukie Master</p>
            <h1 className="mt-2 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
              Cukie Master
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
              Consulta tu posición y gestiona UKI o Cukies desde una sola vista. Tus créditos tienen su propio apartado para que puedas decidir con calma cómo usarlos.
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
        <Tabs value={activeRoute} onValueChange={(value) => selectRoute(value as MasterRoute)} className="mt-4 min-w-0">
          <TabsList aria-label="Vías Cukie Master" className="grid h-auto w-full min-w-0 grid-cols-2 gap-1 rounded-[12px] border border-white/10 bg-black/25 p-1">
            <TabsTrigger
              value="uki"
              className="min-h-11 min-w-0 gap-2 rounded-[9px] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)] focus-visible:ring-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac-soft)] data-[state=active]:text-[var(--uki-cream)] sm:text-sm"
            >
              <Coins className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
              <span className="truncate">Gestionar UKI</span>
            </TabsTrigger>
            <TabsTrigger
              value="nft"
              className="min-h-11 min-w-0 gap-2 rounded-[9px] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)] focus-visible:ring-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac-soft)] data-[state=active]:text-[var(--uki-cream)] sm:text-sm"
            >
              <Gem className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
              <span className="truncate">Gestionar Cukies</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="uki" forceMount hidden={activeRoute !== 'uki'} className="mt-6 min-w-0 data-[state=inactive]:hidden">
            {navigationReady && visitedRoutes.has('uki') ? (
              <UkiStakingPanel testnetOnly={testnetOnly} routePreview={routePreview} />
            ) : null}
          </TabsContent>
          <TabsContent value="nft" forceMount hidden={activeRoute !== 'nft'} className="mt-6 min-w-0 data-[state=inactive]:hidden">
            {navigationReady && visitedRoutes.has('nft') ? <CukieMasterNftVaultPanel /> : null}
          </TabsContent>
        </Tabs>
        <h2 id="gestionar-cupo-title" className="sr-only">Gestiona una vía Cukie Master</h2>
      </section>

    </div>
  );
}

function CukieMasterEntry() {
  return (
    <section aria-labelledby="cukie-master-entry-title" className="mx-auto w-full max-w-[1480px] pb-10">
      <div className="relative overflow-hidden rounded-[22px] border border-[var(--uki-lilac-border)] bg-[#09060f] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
        <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-[rgba(228,92,255,0.1)] blur-3xl" />
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
      <span className="h-px w-8 bg-[rgba(228,92,255,0.45)]" aria-hidden="true" />
      <p className="text-sm font-bold text-[var(--uki-text)]">{label}</p>
    </div>
  );
}
