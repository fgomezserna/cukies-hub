'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  History,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  Cookie,
  Crown,
  Eye,
  Gem,
  Hexagon,
  Info,
  Layers3,
  Loader2,
  LogOut,
  Network,
  RefreshCw,
  Sparkles,
  Store,
  Tag,
  Unlock,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import type {
  MyCukieCollectionData,
  MyCukieCollectionItem,
  MyCukieCollectionResponse,
  MyCukieAction,
} from '@/lib/cukies-data/my-collection-types';
import { getLegacyMarketplaceDetailHref } from '@/lib/legacy-marketplace/identity';
import {
  isTransactionRefreshAborted,
  retryTransactionRefresh,
} from '@/lib/transaction-refresh';
import { useAuth } from '@/providers/auth-provider';

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable';

type CollectionRefreshTarget = {
  assetId?: string;
  tokenId?: string;
  collectionAddress?: string | null;
  expectedState?: MyCukieCollectionItem['state'];
};

type CollectionRefreshDetail = CollectionRefreshTarget & {
  hash?: string;
};

const CukieSaleDialog = dynamic(
  () => import('@/components/cukies/cukie-sale-dialog').then((module) => module.CukieSaleDialog),
  { ssr: false },
);

function generationLabel(cukie: MyCukieCollectionItem) {
  if (cukie.generation === 'original') return 'Original';
  if (cukie.generation === 'second_generation') return 'Segunda generación';
  return 'Generación sin identificar';
}

function rarityLabel(cukie: MyCukieCollectionItem) {
  return ({
    common: 'Común',
    uncommon: 'No común',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Legendario',
    goat: 'Goat',
    unknown: 'Rareza sin identificar',
  } as const)[cukie.rarity];
}

function recoveryTimestamp(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    const seconds = BigInt(value);
    if (seconds === BigInt(0)) return null;
    const milliseconds = seconds * BigInt(1_000);
    const date = new Date(Number(milliseconds));
    if (!Number.isSafeInteger(Number(milliseconds)) || Number.isNaN(date.getTime())) return null;
    return { seconds, label: new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(date) };
  } catch {
    return null;
  }
}

function collectionState(cukie: MyCukieCollectionItem) {
  if (cukie.custody === 'cukie_pool_recovery') {
    const recoveryStorageDetail = 'Este Cukie sigue depositado en el Pool.';
    const requested = Boolean(recoveryTimestamp(cukie.recoveryExitRequestedAt));
    const withdrawableAt = recoveryTimestamp(cukie.recoveryWithdrawableAt);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
    if (!requested && recoveryTimestamp(cukie.recoveryWithdrawableAt)) {
      return {
        label: 'Estado pendiente de confirmar',
        detail: `${recoveryStorageDetail} El estado de salida no se ha podido confirmar y el Cukie no está disponible en tu wallet.`,
      };
    }
    if (!requested) {
      return {
        label: 'Depósito en el Pool',
        detail: `${recoveryStorageDetail} Puedes solicitar la retirada de este Cukie cuando quieras.`,
      };
    }
    if (!withdrawableAt) {
      return {
        label: 'Salida solicitada · fecha no disponible',
        detail: `${recoveryStorageDetail} La solicitud de salida está registrada, pero no hay una fecha verificable para retirarlo todavía.`,
      };
    }
    if (withdrawableAt.seconds <= nowSeconds) {
      return {
        label: 'Retirada disponible',
        detail: `${recoveryStorageDetail} La espera terminó. Puedes retirarlo desde ${withdrawableAt.label} UTC.`,
      };
    }
    return {
      label: 'Salida solicitada',
      detail: `${recoveryStorageDetail} Podrás retirarlo desde ${withdrawableAt.label} UTC. El plazo se fijó al solicitar la salida.`,
    };
  }
  if (cukie.state === 'cukie_master') return 'En Cukie Master';
  if (cukie.state === 'in_pool') {
    if (cukie.poolStatus === 'pending') return 'Activándose en el pool';
    if (cukie.poolStatus === 'exit_requested') return 'Saliendo del pool';
    if (cukie.poolStatus === 'withdrawable') return 'Listo para retirar';
    return 'Disponible para partidas';
  }
  return ({
    available: 'Disponible',
    listed: 'En venta',
    bridging: 'En transferencia',
    soft_staked: 'En staking',
    assigned_to_game: 'En una partida',
    invalidated: 'No disponible',
    unknown: 'Estado pendiente',
  } as const)[cukie.state] ?? 'En uso';
}

function stateLabel(cukie: MyCukieCollectionItem) {
  const state = collectionState(cukie);
  return typeof state === 'string' ? state : state.label;
}

function networkPresentation(network: string | null | undefined) {
  if (network === 'BSC') {
    return { label: 'BSC', Icon: Hexagon, className: 'text-[var(--uki-gold)]' };
  }
  if (network === 'TRON') {
    return { label: 'TRON', Icon: Zap, className: 'text-[var(--uki-lilac)]' };
  }
  return {
    label: network || 'Red sin identificar',
    Icon: Network,
    className: 'text-[var(--uki-muted)]',
  };
}

function isLegacyAsset(cukie: MyCukieCollectionItem) {
  return cukie.marketplaceSurface === 'legacy'
    || cukie.saleKind === 'legacy'
    || cukie.sellSurfaces?.includes('legacy') === true;
}

function statusPresentation(cukie: MyCukieCollectionItem) {
  const label = stateLabel(cukie);
  if (label === 'Retirada disponible' || cukie.poolStatus === 'withdrawable') {
    return { Icon: Unlock, className: 'border-[rgba(242,195,75,0.45)] bg-[rgba(242,195,75,0.1)] text-[var(--uki-gold)]' };
  }
  if (cukie.state === 'listed') {
    return { Icon: Tag, className: 'border-[rgba(242,195,75,0.4)] bg-[rgba(242,195,75,0.1)] text-[var(--uki-gold)]' };
  }
  if (cukie.custody === 'cukie_pool_recovery' || cukie.poolStatus === 'exit_requested') {
    return { Icon: LogOut, className: 'border-[var(--uki-lilac-border-strong)] bg-[var(--uki-lilac-soft)] text-[var(--uki-lilac)]' };
  }
  if (cukie.custody === 'cukie_pool' || cukie.state === 'in_pool') {
    return { Icon: Layers3, className: 'border-[var(--uki-lilac-border-strong)] bg-[var(--uki-lilac-soft)] text-[var(--uki-lilac)]' };
  }
  if (cukie.custody === 'cukie_master' || cukie.state === 'soft_staked') {
    return { Icon: Crown, className: 'border-[var(--uki-lilac-border-strong)] bg-[var(--uki-lilac-soft)] text-[var(--uki-lilac)]' };
  }
  if (cukie.state === 'available') {
    return { Icon: CircleCheck, className: 'border-[var(--uki-lilac-border-strong)] bg-[var(--uki-lilac-soft)] text-[var(--uki-lilac)]' };
  }
  if (cukie.state === 'invalidated') {
    return { Icon: CircleAlert, className: 'border-white/20 bg-white/[0.04] text-[var(--uki-muted)]' };
  }
  return { Icon: CircleDot, className: 'border-white/20 bg-white/[0.04] text-[var(--uki-muted)]' };
}

function itemAction(cukie: MyCukieCollectionItem) {
  if (cukie.custody === 'cukie_pool_recovery') {
    const query = new URLSearchParams({ tokenId: cukie.tokenId, chainId: String(cukie.chainId) });
    if (cukie.recoveryVaultAddress) query.set('recoveryVault', cukie.recoveryVaultAddress);
    if (cukie.collectionAddress) query.set('collection', cukie.collectionAddress);
    return { href: `/cukie-hodler/recuperar?${query.toString()}#pool-recovery`, label: recoveryActionLabel(cukie) };
  }
  if (cukie.custody === 'cukie_pool') {
    return { href: '/cukie-hodler#mis-cukies-aportados', label: 'Gestionar en el pool · Cukie Pool' };
  }
  if (cukie.custody === 'cukie_master') {
    return { href: '/cukie-master#cukie-master-nft-staking', label: 'Gestionar Cukie Master' };
  }
  if (cukie.state === 'available') {
    return { href: '/cukie-hodler#cukies-disponibles', label: 'Aportar al pool' };
  }
  return { href: `/marketplace/${cukie.tokenId}`, label: 'Ver ficha' };
}

function recoveryActionLabel(cukie: MyCukieCollectionItem) {
  if (!recoveryTimestamp(cukie.recoveryExitRequestedAt)) {
    return recoveryTimestamp(cukie.recoveryWithdrawableAt)
      ? 'Consultar salida del Cukie Pool'
      : 'Solicitar salida del Cukie Pool';
  }
  const withdrawableAt = recoveryTimestamp(cukie.recoveryWithdrawableAt);
  if (!withdrawableAt) return 'Consultar salida del Cukie Pool';
  return withdrawableAt.seconds <= BigInt(Math.floor(Date.now() / 1_000))
    ? 'Retirar del Cukie Pool'
    : 'Ver salida del Cukie Pool';
}

function itemActionDescription(cukie: MyCukieCollectionItem): string | null {
  if (cukie.custody === 'cukie_pool_recovery') {
    const state = collectionState(cukie);
    return typeof state === 'string' ? state : state.detail;
  }
  if (cukie.state === 'listed') return 'Está publicado; revisa la ficha para gestionar el anuncio.';
  if (cukie.state === 'bridging') return 'Espera a que termine la transferencia antes de utilizarlo.';
  if (cukie.state === 'assigned_to_game') return 'Está asignado a una partida activa.';
  if (cukie.state === 'invalidated') return 'Este Cukie no está disponible para nuevas operaciones.';
  if (cukie.state === 'unknown') return 'El estado de este Cukie necesita confirmación antes de operar.';
  return null;
}

type CollectionFilter = 'all' | 'listed' | 'pool' | 'master' | 'available';

function actionsFor(cukie: MyCukieCollectionItem) {
  if (Object.prototype.hasOwnProperty.call(cukie, 'availableActions')) {
    return Array.isArray(cukie.availableActions) ? cukie.availableActions : [];
  }
  return [];
}

function hasActionsField(cukie: MyCukieCollectionItem) {
  return Object.prototype.hasOwnProperty.call(cukie, 'availableActions');
}

function actionLabel(action: MyCukieAction) {
  return ({
    cancel_sale: 'Cancelar venta',
    request_pool_exit: 'Solicitar salida del Cukie Pool',
    withdraw_pool: 'Retirar del Cukie Pool',
    withdraw_master: 'Retirar de Cukie Master',
    deposit_pool: 'Aportar al Pool',
    sell: 'Vender',
    stake_master: 'Hacer staking Master',
  } as const)[action];
}

function actionIcon(action: MyCukieAction): LucideIcon {
  return ({
    cancel_sale: CircleX,
    request_pool_exit: LogOut,
    withdraw_pool: Unlock,
    withdraw_master: Unlock,
    deposit_pool: Layers3,
    sell: Tag,
    stake_master: Crown,
  } as const)[action];
}

function actionClassName(action: MyCukieAction) {
  const base = 'group/action inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[10px] border px-3 py-2 text-center text-[12px] font-black leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09060f] motion-reduce:transition-none';
  if (action === 'sell') {
    return `${base} border-[var(--uki-lilac)] bg-[var(--uki-lilac)] text-[#120817] hover:bg-[#f19bff]`;
  }
  if (action === 'cancel_sale') {
    return `${base} border-white/15 bg-white/[0.035] text-[var(--uki-text)] hover:border-[var(--uki-lilac-border-strong)] hover:bg-[var(--uki-lilac-soft)] hover:text-[var(--uki-cream)]`;
  }
  return `${base} border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] text-[var(--uki-cream)] hover:border-[var(--uki-lilac-border-strong)] hover:bg-[rgba(228,92,255,0.16)]`;
}

function fallbackActionIcon(cukie: MyCukieCollectionItem): LucideIcon {
  if (cukie.custody === 'cukie_pool_recovery') return LogOut;
  if (cukie.custody === 'cukie_pool') return Layers3;
  if (cukie.custody === 'cukie_master') return Crown;
  if (cukie.state === 'available') return Layers3;
  return Eye;
}

const navigationLinkClass = 'group inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[10px] border border-white/15 bg-white/[0.035] px-3 py-2 text-center text-[12px] font-black leading-tight text-[var(--uki-cream)] transition hover:border-[var(--uki-lilac-border-strong)] hover:bg-[var(--uki-lilac-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09060f] motion-reduce:transition-none';

function actionHref(cukie: MyCukieCollectionItem, action: MyCukieAction) {
  if (action === 'cancel_sale') {
    return cukie.saleKind === 'uki'
      ? ukiMarketplaceHref(cukie)
      : legacyMarketplaceHref(cukie);
  }
  if (action === 'request_pool_exit' || action === 'withdraw_pool') {
    return custodyHref(cukie, '/cukie-hodler', `pool-cukie-${cukie.tokenId}`);
  }
  if (action === 'withdraw_master' || action === 'stake_master') {
    return custodyHref(cukie, '/cukie-master', `cukie-master-cukie-${cukie.tokenId}`);
  }
  if (action === 'deposit_pool') {
    return custodyHref(cukie, '/cukie-hodler', `pool-available-${cukie.tokenId}`);
  }
  return cukie.marketplaceSurface === 'legacy'
    ? legacyMarketplaceHref(cukie)
    : cukie.marketplaceSurface === 'uki'
      ? ukiMarketplaceHref(cukie)
      : null;
}

function custodyHref(cukie: MyCukieCollectionItem, pathname: string, targetId: string) {
  const query = new URLSearchParams({
    tokenId: cukie.tokenId,
    collection: cukie.collectionAddress,
    chainId: String(cukie.chainId),
  });
  return `${pathname}?${query.toString()}#${encodeURIComponent(targetId)}`;
}

function legacyMarketplaceHref(cukie: MyCukieCollectionItem) {
  if (cukie.network !== 'BSC' && cukie.network !== 'TRON') return null;
  return getLegacyMarketplaceDetailHref({ tokenId: cukie.tokenId, network: cukie.network });
}

function ukiMarketplaceHref(cukie: MyCukieCollectionItem) {
  if (cukie.network !== 'BSC' || !cukie.collectionAddress || (cukie.chainId !== 56 && cukie.chainId !== 97)) {
    return null;
  }
  const query = new URLSearchParams({
    tokenId: cukie.tokenId,
    collection: cukie.collectionAddress,
    chainId: String(cukie.chainId),
  });
  return `/marketplace?${query.toString()}#mis-anuncios`;
}

function filterMatches(cukie: MyCukieCollectionItem, filter: CollectionFilter) {
  if (filter === 'all') return true;
  if (filter === 'listed') return cukie.state === 'listed';
  if (filter === 'pool') return cukie.custody === 'cukie_pool' || cukie.custody === 'cukie_pool_recovery';
  if (filter === 'master') return cukie.custody === 'cukie_master';
  return cukie.custody === 'wallet' && cukie.state === 'available';
}

function collectionOrder(cukie: MyCukieCollectionItem) {
  if (cukie.state === 'listed') return 0;
  if (cukie.custody === 'cukie_pool' || cukie.custody === 'cukie_pool_recovery') return 1;
  if (cukie.custody === 'cukie_master') return 2;
  if (cukie.state === 'available') return 3;
  return 4;
}

function sameCollectionIdentity(
  item: MyCukieCollectionItem,
  target: CollectionRefreshTarget,
) {
  // An asset id is the canonical identity. If it is supplied, a token id
  // match from another collection must never satisfy this target.
  if (target.assetId) return item.assetId === target.assetId;
  if (!target.tokenId || item.tokenId !== target.tokenId) return false;
  if (!target.collectionAddress) return true;
  return item.collectionAddress.toLowerCase() === target.collectionAddress.toLowerCase();
}

function collectionTargetKey(target: CollectionRefreshTarget) {
  if (target.assetId) return `asset:${target.assetId}`;
  return `token:${target.tokenId ?? ''}:${target.collectionAddress?.toLowerCase() ?? ''}`;
}

function collectionTargetMatches(
  data: MyCukieCollectionData,
  target?: CollectionRefreshTarget,
) {
  if (!target) return false;
  const item = data.items.find((candidate) => sameCollectionIdentity(candidate, target));
  return Boolean(item && (!target.expectedState || item.state === target.expectedState));
}

export function MyCukiesPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [state, setState] = useState<LoadState>('idle');
  const [collection, setCollection] = useState<MyCukieCollectionData | null>(null);
  const [filter, setFilter] = useState<CollectionFilter>('all');
  const [saleSelection, setSaleSelection] = useState<{
    cuki: MyCukieCollectionItem;
    preferredSurface?: 'uki';
  } | null>(null);
  const requestIdRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const collectionRef = useRef<MyCukieCollectionData | null>(null);
  const saleSelectionRef = useRef(saleSelection);
  const pendingRefreshTargetsRef = useRef<Map<string, CollectionRefreshTarget>>(new Map());
  const pendingRefreshTargetAssetsRef = useRef<Map<string, string>>(new Map());
  const [pendingRefreshAssets, setPendingRefreshAssets] = useState<Set<string>>(
    () => new Set(),
  );
  collectionRef.current = collection;
  saleSelectionRef.current = saleSelection;
  const items = useMemo(() => collection?.items ?? [], [collection]);
  const visibleItems = useMemo(() => items
    .filter((item) => filterMatches(item, filter))
    .sort((left, right) => collectionOrder(left) - collectionOrder(right) || (BigInt(left.tokenId) < BigInt(right.tokenId) ? -1 : 1)), [filter, items]);

  const load = useCallback(async (
    signal?: AbortSignal,
    expectedRequestId = requestIdRef.current,
    options: { preserve?: boolean } = {},
  ): Promise<MyCukieCollectionData | null> => {
    if (!walletAddress) return null;
    const requestedWallet = walletAddress;
    const isCurrentRequest = () => (
      requestIdRef.current === expectedRequestId
      && walletAddress === requestedWallet
      && !signal?.aborted
    );
    if (!options.preserve && isCurrentRequest()) setState('loading');
    const params = new URLSearchParams({ walletAddress });
    const response = await fetch('/api/cukies/mine?' + params.toString(), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    const body = await response.json() as MyCukieCollectionResponse;
    if (!response.ok || body.status !== 'ok') throw new Error('CUKIES_UNAVAILABLE');
    if (!isCurrentRequest()) return null;
    if (body.data.walletNormalized.toLowerCase() !== requestedWallet.toLowerCase()) {
      throw new Error('COLLECTION_CONTEXT_CHANGED');
    }
    collectionRef.current = body.data;
    setCollection(body.data);
    setState('ready');
    return body.data;
  }, [walletAddress]);

  const runRefresh = useCallback((target?: CollectionRefreshTarget) => {
    if (!walletAddress) return;
    if (target && (target.assetId || target.tokenId)) {
      const targetKey = collectionTargetKey(target);
      pendingRefreshTargetsRef.current.set(targetKey, target);
      const knownAssetId = target.assetId
        ?? collectionRef.current?.items.find((item) => sameCollectionIdentity(item, target))?.assetId;
      if (knownAssetId) pendingRefreshTargetAssetsRef.current.set(targetKey, knownAssetId);
      setPendingRefreshAssets((current) => {
        if (!knownAssetId || current.has(knownAssetId)) return current;
        const next = new Set(current);
        next.add(knownAssetId);
        return next;
      });
    }
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (target?.assetId) {
      setPendingRefreshAssets((current) => {
        const next = new Set(current);
        next.add(target.assetId as string);
        return next;
      });
    }
    void retryTransactionRefresh(
      async () => {
        try {
          const data = await load(controller.signal, requestId, { preserve: true });
          if (!data) return false;
          const resolvedAssets = new Set<string>();
          for (const [targetKey, pendingTarget] of pendingRefreshTargetsRef.current) {
            if (!collectionTargetMatches(data, pendingTarget)) continue;
            const resolvedAssetId = pendingRefreshTargetAssetsRef.current.get(targetKey)
              ?? data.items.find((item) => sameCollectionIdentity(item, pendingTarget))?.assetId;
            if (resolvedAssetId) resolvedAssets.add(resolvedAssetId);
            pendingRefreshTargetsRef.current.delete(targetKey);
            pendingRefreshTargetAssetsRef.current.delete(targetKey);
          }
          if (resolvedAssets.size > 0) {
            const stillPendingAssets = new Set(pendingRefreshTargetAssetsRef.current.values());
            setPendingRefreshAssets((current) => {
              const next = new Set(current);
              for (const assetId of resolvedAssets) {
                if (!stillPendingAssets.has(assetId)) next.delete(assetId);
              }
              return next;
            });
          }
          // A manual refresh ends after the first valid payload. A
          // post-transaction refresh keeps polling until every remembered
          // target converges, including targets from an earlier loop.
          return pendingRefreshTargetsRef.current.size === 0;
        } catch (reason) {
          if (isTransactionRefreshAborted(reason)) throw reason;
          return false;
        }
      },
      { signal: controller.signal },
    ).catch(() => {
      // A newer read, wallet change or unmount owns the next state.
    }).finally(() => {
      if (refreshAbortRef.current === controller) refreshAbortRef.current = null;
    });
  }, [load, walletAddress]);

  const refreshAfterSale = useCallback(() => {
    const selected = saleSelectionRef.current?.cuki;
    runRefresh(selected ? {
      assetId: selected.assetId,
      tokenId: selected.tokenId,
      collectionAddress: selected.collectionAddress,
      expectedState: 'listed',
    } : undefined);
  }, [runRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    refreshAbortRef.current?.abort();
    const requestedWallet = walletAddress?.toLowerCase() ?? null;
    const loadedWallet = collectionRef.current?.walletNormalized?.toLowerCase() ?? null;
    const walletChanged = Boolean(requestedWallet && loadedWallet && requestedWallet !== loadedWallet);
    if (!walletAddress || walletChanged) {
      collectionRef.current = null;
      pendingRefreshTargetsRef.current.clear();
      pendingRefreshTargetAssetsRef.current.clear();
      setPendingRefreshAssets(new Set());
      setCollection(null);
    }
    if (!walletAddress) {
      setState('idle');
      return;
    }
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    load(controller.signal, requestId).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestIdRef.current !== requestId) return;
      if (!collectionRef.current) {
        setCollection(null);
        setState('unavailable');
      } else {
        setState('ready');
      }
    });
    return () => {
      controller.abort();
      if (refreshAbortRef.current === controller) refreshAbortRef.current = null;
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [authLoading, load, walletAddress]);

  useEffect(() => {
    const refreshFromTransaction = (event: Event) => {
      const detail = event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
        ? event.detail as CollectionRefreshDetail
        : {};
      const selected = saleSelectionRef.current?.cuki;
      const target: CollectionRefreshTarget | undefined = detail.assetId || detail.tokenId
        ? {
            assetId: typeof detail.assetId === 'string' ? detail.assetId : selected?.assetId,
            tokenId: typeof detail.tokenId === 'string' ? detail.tokenId : selected?.tokenId,
            collectionAddress: typeof detail.collectionAddress === 'string'
              ? detail.collectionAddress
              : selected?.collectionAddress,
            expectedState: detail.expectedState ?? 'listed',
          }
        : selected
          ? {
              assetId: selected.assetId,
              tokenId: selected.tokenId,
              collectionAddress: selected.collectionAddress,
              expectedState: 'listed',
            }
          : undefined;
      runRefresh(target);
    };
    window.addEventListener('cukies:legacy-marketplace:refresh', refreshFromTransaction);
    window.addEventListener('cukies:uki-marketplace:refresh', refreshFromTransaction);
    return () => {
      refreshAbortRef.current?.abort();
      window.removeEventListener('cukies:legacy-marketplace:refresh', refreshFromTransaction);
      window.removeEventListener('cukies:uki-marketplace:refresh', refreshFromTransaction);
    };
  }, [runRefresh]);

  if (authLoading) {
    return (
      <div role="status" className="flex min-h-[24rem] items-center justify-center text-sm font-semibold text-[var(--uki-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--uki-lilac)]" />
        Preparando tu colección…
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <section className="grid min-h-[34rem] overflow-hidden rounded-[20px] border border-[var(--uki-lilac-border)] bg-[#09060f] lg:grid-cols-[1fr_0.8fr]">
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]"><Cookie className="h-4 w-4" aria-hidden="true" /> Tu colección</p>
          <h1 className="mt-3 max-w-2xl text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">Consulta y gestiona tus Cukies</h1>
          <p className="mt-4 max-w-xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">Conecta tu wallet para ver tus Cukies, su estado actual y las acciones disponibles para cada uno.</p>
          <LandingWalletConnectButton evmOnly className="mt-7 min-h-12 w-fit px-5" label="Conectar wallet" compactLabel="Conectar wallet" showCompactText={false} />
        </div>
        <div className="flex min-h-[20rem] items-center justify-center border-t border-white/10 bg-[radial-gradient(circle_at_center,rgba(228,92,255,0.18),transparent_60%)] lg:border-l lg:border-t-0">
          <Cookie className="h-28 w-28 text-[var(--uki-lilac)]" aria-hidden="true" />
        </div>
      </section>
    );
  }

  return (
    <div className="pb-10">
      <header className="border-b border-white/10 pb-7 pt-1 sm:pb-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]"><Cookie className="h-4 w-4" aria-hidden="true" /> Tu colección</p>
            <h1 className="mt-2 text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">Mis Cukies</h1>
            <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">Aquí aparecen los Cukies asociados a tu wallet. Abre una ficha para ver sus datos o elige una acción para utilizarlos.</p>
          </div>
          <button type="button" onClick={() => runRefresh()} disabled={state === 'loading'} className="inline-flex items-center gap-2 rounded-[8px] px-2 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-lilac)] transition hover:bg-[var(--uki-lilac-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09060f] disabled:opacity-50 motion-reduce:transition-none">
            <RefreshCw className={state === 'loading' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Actualizar colección
          </button>
        </div>
      </header>

      <section aria-labelledby="collection-summary-title" className="pt-7">
        <div className="grid overflow-hidden rounded-[16px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] sm:grid-cols-[1.25fr_repeat(3,0.75fr)]">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-muted)]">Tu colección</p>
            <h2 id="collection-summary-title" className="mt-2 font-headline text-3xl font-black text-[var(--uki-cream)]">{collection?.summary.total ?? 0} Cukies</h2>
            <p className="mt-2 text-sm font-semibold text-[var(--uki-muted)]">Total real entre tu wallet, el pool y Cukie Master.</p>
          </div>
          {[
            ['En tu wallet', collection?.summary.inWallet ?? 0, `${collection?.summary.available ?? 0} disponibles${collection?.summary.onSale ? ` · ${collection.summary.onSale} en venta` : ''}`],
            ['En el pool', collection?.summary.inPool ?? 0, 'Aportados para participar en partidas'],
            ['Cukie Master', collection?.summary.inCukieMaster ?? 0, 'Depositados para generar cupos'],
          ].map(([label, value, helper]) => (
            <div key={String(label)} className="border-t border-white/10 p-5 sm:border-l sm:border-t-0 sm:p-6">
              <p className="font-headline text-3xl font-black text-[var(--uki-lilac)]">{value}</p>
              <p className="mt-1 text-sm font-black text-[var(--uki-cream)]">{label}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{helper}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Acciones de tu colección" className="grid gap-3 pt-6 sm:grid-cols-2">
        <Link href="/cukie-hodler#mi-cukie-pool" className="group flex min-h-20 items-center justify-between gap-4 rounded-[13px] border border-white/10 bg-black/25 px-5 py-4 transition hover:border-[var(--uki-lilac-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09060f] motion-reduce:transition-none">
          <span className="flex items-center gap-3"><Layers3 className="h-5 w-5 text-[var(--uki-lilac)]" aria-hidden="true" /><span><span className="block font-black text-[var(--uki-cream)]">Aportar al pool</span><span className="mt-1 block text-xs font-semibold text-[var(--uki-muted)]">Elige un Cukie y participa en partidas</span></span></span>
          <ChevronRight className="h-4 w-4 text-[var(--uki-lilac)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
        <Link href="/marketplace" className="group flex min-h-20 items-center justify-between gap-4 rounded-[13px] border border-white/10 bg-black/25 px-5 py-4 transition hover:border-[var(--uki-lilac-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09060f] motion-reduce:transition-none">
          <span className="flex items-center gap-3"><Store className="h-5 w-5 text-[var(--uki-lilac)]" aria-hidden="true" /><span><span className="block font-black text-[var(--uki-cream)]">Comprar o vender</span><span className="mt-1 block text-xs font-semibold text-[var(--uki-muted)]">Abre el marketplace de Cukies</span></span></span>
          <ChevronRight className="h-4 w-4 text-[var(--uki-lilac)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </section>

      {pendingRefreshAssets.size > 0 ? (
        <div role="status" className="mt-6 rounded-[12px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 text-sm font-semibold text-[var(--uki-text)]">
          La transacción está confirmada. Estamos actualizando el estado del Cukie; no repitas la operación.
        </div>
      ) : null}

      {state === 'unavailable' ? (
        <div role="alert" className="mt-6 rounded-[12px] border border-white/10 bg-black/25 p-5">
          <p className="font-black text-[var(--uki-cream)]">No podemos cargar tu colección ahora</p>
          <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">Vuelve a intentarlo en unos instantes.</p>
        </div>
      ) : state === 'loading' && items.length === 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-[16px] border border-white/10 bg-white/[0.04]" />)}
        </div>
      ) : items.length > 0 ? (
        <section aria-labelledby="collection-list-title" className="pt-8">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">Inventario</p><h2 id="collection-list-title" className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl">Tus Cukies</h2></div>
            <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
              <span className="sr-only">Filtrar colección</span>
              <select aria-label="Filtrar colección" value={filter} onChange={(event) => setFilter(event.target.value as CollectionFilter)} className="min-h-10 rounded-[8px] border border-white/10 bg-black/30 px-3 text-xs font-black uppercase tracking-[0.06em] text-[var(--uki-text)] outline-none transition focus:border-[var(--uki-lilac-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] motion-reduce:transition-none">
                <option value="all">Todos ({items.length})</option>
                <option value="listed">En venta ({items.filter((item) => item.state === 'listed').length})</option>
                <option value="pool">Pool ({items.filter((item) => item.custody === 'cukie_pool' || item.custody === 'cukie_pool_recovery').length})</option>
                <option value="master">Staking Master ({items.filter((item) => item.custody === 'cukie_master').length})</option>
                <option value="available">Disponibles ({items.filter((item) => item.custody === 'wallet' && item.state === 'available').length})</option>
              </select>
            </label>
          </div>
          {visibleItems.length === 0 ? (
            <p className="mt-5 rounded-[12px] border border-white/10 bg-black/25 p-5 text-sm font-semibold text-[var(--uki-muted)]">
              No hay Cukies en este filtro.
            </p>
          ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((cukie) => {
              const explicitActions = actionsFor(cukie);
              const isRefreshPending = pendingRefreshAssets.has(cukie.assetId);
              const hasAlternateUkiSale = cukie.state === 'available'
                && cukie.marketplaceSurface === 'legacy'
                && cukie.sellSurfaces?.includes('uki');
              const actionCount = (explicitActions.length > 0 ? explicitActions.length : 1)
                + (hasAlternateUkiSale ? 1 : 0)
                + 1;
              const network = networkPresentation(cukie.network);
              const NetworkIcon = network.Icon;
              const status = statusPresentation(cukie);
              const StatusIcon = status.Icon;
              const actionGridClass = actionCount > 1 ? 'grid-cols-2' : 'grid-cols-1';
              const marketplaceHref = cukie.marketplaceSurface === 'legacy'
                ? legacyMarketplaceHref(cukie) ?? '/marketplace'
                : cukie.marketplaceSurface === 'uki'
                  ? ukiMarketplaceHref(cukie) ?? '/marketplace'
                  : null;
              const marketplaceLabel = cukie.marketplaceSurface === 'legacy' ? 'Ver ficha' : 'Ver marketplace';
              const marketplaceGridClass = actionCount % 2 === 1 ? 'col-span-2' : '';

              return (
                <article
                  key={cukie.assetId}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#0a0710] shadow-[0_16px_50px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--uki-lilac-border-strong)] hover:shadow-[0_20px_60px_rgba(228,92,255,0.12)] motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <div className="relative aspect-[4/4.75] overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(228,92,255,0.14),transparent_58%),#0d0914]">
                    <CukiImage
                      src={cukie.imageUrl}
                      alt={`Cukie #${cukie.tokenId}`}
                      sizes="(min-width: 1280px) 30vw, (min-width: 640px) 50vw, 100vw"
                      className="object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.018] motion-reduce:transform-none"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09060f]/80 via-transparent to-[#09060f]/10" aria-hidden="true" />
                    <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/20 bg-[#100b17]/80 px-2.5 py-1 text-[11px] font-black text-[var(--uki-cream)] shadow-[0_5px_20px_rgba(0,0,0,0.22)] backdrop-blur-md">
                          <NetworkIcon className={`h-3.5 w-3.5 shrink-0 ${network.className}`} aria-hidden="true" />
                          <span className="break-words">{network.label}</span>
                        </span>
                        {isLegacyAsset(cukie) ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(242,195,75,0.35)] bg-[#1a1207]/80 px-2.5 py-1 text-[11px] font-black text-[var(--uki-gold)] backdrop-blur-md">
                            <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Legacy
                          </span>
                        ) : null}
                      </div>
                      <span className={`inline-flex max-w-[58%] min-w-0 items-center justify-end gap-1.5 rounded-full border px-2.5 py-1 text-right text-[11px] font-black leading-tight shadow-[0_5px_20px_rgba(0,0,0,0.22)] backdrop-blur-md ${status.className}`}>
                        <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="break-words">{stateLabel(cukie)}</span>
                      </span>
                    </div>
                    <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[#100b17]/80 px-2.5 py-1 text-[11px] font-black text-[var(--uki-cream)] backdrop-blur-md">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                        {generationLabel(cukie)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(242,195,75,0.35)] bg-[#1a1207]/80 px-2.5 py-1 text-[11px] font-black text-[var(--uki-gold)] backdrop-blur-md">
                        <Gem className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {rarityLabel(cukie)}
                      </span>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
                    <h3 className="break-words font-headline text-xl font-black tracking-[-0.02em] text-[var(--uki-cream)]">Cukie #{cukie.tokenId}</h3>
                    {itemActionDescription(cukie) ? (
                      <p className="mt-3 flex items-start gap-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                        <span>{itemActionDescription(cukie)}</span>
                      </p>
                    ) : null}
                    <div className="mt-auto pt-4">
                      <div className={`grid gap-2 ${actionGridClass}`}>
                        {explicitActions.length > 0 ? explicitActions.map((action) => {
                          const href = actionHref(cukie, action);
                          const ActionIcon = actionIcon(action);
                          if (!href) {
                            return (
                              <span key={action} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-2 text-center text-[11px] font-black leading-tight text-[var(--uki-muted)]">
                                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                Acción no disponible
                              </span>
                            );
                          }
                          const className = actionClassName(action);
                          const content = <><ActionIcon className={`h-4 w-4 shrink-0 ${action === 'sell' ? 'text-[#120817]' : 'text-[var(--uki-lilac)]'}`} aria-hidden="true" /><span className="min-w-0 break-words">{actionLabel(action)}</span></>;
                          if (isRefreshPending) {
                            return (
                              <span
                                key={action}
                                role="status"
                                className={`${className} cursor-wait opacity-70`}
                              >
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--uki-lilac)]" aria-hidden="true" />
                                <span className="min-w-0 break-words">Actualizando estado…</span>
                              </span>
                            );
                          }
                          if (action === 'sell') {
                            return (
                              <a
                                key={action}
                                href={href}
                                aria-haspopup="dialog"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setSaleSelection({ cuki: cukie });
                                }}
                                className={className}
                              >
                                {content}
                              </a>
                            );
                          }
                          return <Link key={action} href={href} className={className}>{content}</Link>;
                        }) : cukie.custody === 'cukie_pool_recovery' ? (
                          (() => {
                            const fallback = itemAction(cukie);
                            const FallbackIcon = fallbackActionIcon(cukie);
                            if (isRefreshPending) {
                              return <span role="status" className={`${actionClassName('request_pool_exit')} cursor-wait opacity-70`}><Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--uki-lilac)]" aria-hidden="true" /><span className="min-w-0 break-words">Actualizando estado…</span></span>;
                            }
                            return <Link href={fallback.href} className={`${actionClassName('request_pool_exit')}`}><FallbackIcon className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" /><span className="min-w-0 break-words">{fallback.label}</span></Link>;
                          })()
                        ) : hasActionsField(cukie) ? (
                          <span className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-2 text-center text-[11px] font-black leading-tight text-[var(--uki-muted)]">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Sin acción disponible
                          </span>
                        ) : (
                          (() => {
                            const fallback = itemAction(cukie);
                            const FallbackIcon = fallbackActionIcon(cukie);
                            if (isRefreshPending) {
                              return <span role="status" className={`${actionClassName('deposit_pool')} cursor-wait opacity-70`}><Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--uki-lilac)]" aria-hidden="true" /><span className="min-w-0 break-words">Actualizando estado…</span></span>;
                            }
                            return <Link href={fallback.href} className={`${actionClassName('deposit_pool')}`}><FallbackIcon className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" /><span className="min-w-0 break-words">{fallback.label}</span></Link>;
                          })()
                        )}
                        {hasAlternateUkiSale ? isRefreshPending ? (
                          <span role="status" className={`${actionClassName('deposit_pool')} cursor-wait opacity-70`}>
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--uki-lilac)]" aria-hidden="true" />
                            <span className="min-w-0 break-words">Actualizando estado…</span>
                          </span>
                        ) : (
                          <a
                            href={ukiMarketplaceHref(cukie) ?? '/marketplace'}
                            aria-haspopup="dialog"
                            onClick={(event) => {
                              event.preventDefault();
                              setSaleSelection({ cuki: cukie, preferredSurface: 'uki' });
                            }}
                            className={actionClassName('deposit_pool')}
                          >
                            <Store className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                            <span className="min-w-0 break-words">Vender en UKI</span>
                          </a>
                        ) : null}
                        {marketplaceHref ? (
                          <Link href={marketplaceHref} className={`${navigationLinkClass} w-full ${marketplaceGridClass}`}>
                            <Eye className="h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                            <span className="min-w-0 break-words">{marketplaceLabel}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--uki-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-2 text-center text-[11px] font-black leading-tight text-[var(--uki-muted)] ${marketplaceGridClass}`}>
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Ficha no disponible
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          )}
        </section>
      ) : state === 'ready' ? (
        <div className="mt-6 rounded-[16px] border border-white/10 bg-black/25 p-8 text-center">
          <Cookie className="mx-auto h-10 w-10 text-[var(--uki-lilac)]" aria-hidden="true" />
          <h2 className="mt-4 font-headline text-2xl font-black text-[var(--uki-cream)]">Aún no hay Cukies en esta wallet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">Cuando tengas uno, aparecerá aquí con su imagen, estado y acciones disponibles.</p>
          <Link href="/marketplace" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 text-sm font-black text-[#09060f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09060f]">Explorar marketplace <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      ) : null}

      <section aria-label="Herramientas para tus Cukies" className="mt-8 grid gap-3 border-t border-white/10 pt-7 sm:grid-cols-3">
        {[
          ['/bridge', 'Bridge', 'Consulta movimientos entre redes y sigue los Cukies en transferencia.'],
          ['/breeding', 'Crías', 'Elige padres compatibles y revisa las crías activas o terminadas.'],
          ['/cukiepoints', 'Cukie Points', 'Consulta saldo personal y movimientos de puntos por red.'],
        ].map(([href, label, helper]) => (
          <Link key={href} href={href} className="group rounded-[13px] border border-white/10 bg-black/25 p-4 transition hover:border-[var(--uki-lilac-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09060f] motion-reduce:transition-none">
            <span className="font-black text-[var(--uki-cream)]">{label}</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--uki-muted)]">{helper}</span>
            <ChevronRight className="mt-3 h-4 w-4 text-[var(--uki-lilac)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        ))}
      </section>

      {saleSelection ? (
        <CukieSaleDialog
          cuki={saleSelection.cuki}
          preferredSurface={saleSelection.preferredSurface}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setSaleSelection(null);
          }}
          onCompleted={refreshAfterSale}
        />
      ) : null}
    </div>
  );
}
