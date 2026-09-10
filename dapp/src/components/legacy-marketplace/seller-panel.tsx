'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { Button } from '@/components/ui/button';
import { useTronLink } from '@/hooks/use-tronlink';
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';
import type {
  LegacyMarketplaceCukiItem,
  LegacyMarketplaceListResponse,
} from '@/lib/legacy-marketplace/types';

import { CukiCard } from './cuki-card';

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable';
type WalletPage = { address: string; network: string; offset: number };
const PAGE_SIZE = 60;

async function fetchWalletPages(
  pages: WalletPage[],
  signal?: AbortSignal,
) {
  const results = await Promise.all(
    pages.map(async (wallet) => {
      const query = new URLSearchParams({
        owner: wallet.address,
        network: wallet.network,
        state: 'available',
        limit: String(PAGE_SIZE),
        offset: String(wallet.offset),
        sort: 'number-asc',
      });
      const response = await fetch(`/api/legacy-marketplace/cukies?${query}`, {
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error('LEGACY_INVENTORY_UNAVAILABLE');
      const payload = await response.json() as LegacyMarketplaceListResponse;
      if (payload.source === 'empty') throw new Error('LEGACY_INVENTORY_UNAVAILABLE');
      return { wallet, payload };
    }),
  );
  return {
    items: results.flatMap(({ payload }) => payload.items),
    nextPages: results.flatMap(({ wallet, payload }) => {
      const nextOffset = payload.offset + payload.items.length;
      return nextOffset < payload.total
        ? [{ ...wallet, offset: nextOffset }]
        : [];
    }),
  };
}

export function LegacyMarketplaceSellerPanel() {
  const { address } = useAccount();
  const {
    address: tronAddress,
    isInstalled: isTronInstalled,
  } = useTronLink();
  const { requestWallet } = useWalletCoordinator();
  const [state, setState] = useState<LoadState>('idle');
  const [items, setItems] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [nextPages, setNextPages] = useState<WalletPage[]>([]);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadGenerationRef = useRef(0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const wallets = useMemo(
    () => [
      ...(address ? [{ address, network: 'BSC' }] : []),
      ...(tronAddress ? [{ address: tronAddress, network: 'TRON' }] : []),
    ],
    [address, tronAddress],
  );

  useEffect(() => {
    loadGenerationRef.current += 1;
    const generation = loadGenerationRef.current;
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    if (wallets.length === 0) {
      setItems([]);
      setNextPages([]);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    setItems([]);
    setNextPages([]);
    fetchWalletPages(
      wallets.map((wallet) => ({ ...wallet, offset: 0 })),
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted || generation !== loadGenerationRef.current) return;
        setItems(result.items);
        setNextPages(result.nextPages);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== loadGenerationRef.current) return;
        setItems([]);
        setState('unavailable');
      });
    return () => {
      controller.abort();
      loadMoreControllerRef.current?.abort();
    };
  }, [reloadKey, wallets]);

  async function loadMore() {
    if (nextPages.length === 0 || state === 'loading') return;
    const generation = loadGenerationRef.current;
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setState('loading');
    try {
      const result = await fetchWalletPages(nextPages, controller.signal);
      if (controller.signal.aborted || generation !== loadGenerationRef.current) return;
      setItems((current) => {
        const byIdentity = new Map(
          [...current, ...result.items].map((item) => [
            `${item.network}:${item.tokenId}`,
            item,
          ]),
        );
        return [...byIdentity.values()];
      });
      setNextPages(result.nextPages);
      setState('ready');
    } catch {
      if (controller.signal.aborted || generation !== loadGenerationRef.current) return;
      setState('unavailable');
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
      }
    }
  }

  return (
    <div className="rounded-[14px] border border-white/10 bg-black/25 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200">Legacy · BSC/TRON Mainnet</p>
          <h3 className="mt-2 font-headline text-xl font-black text-[var(--uki-cream)]">Vende un Cukie de tu wallet</h3>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            Conecta la wallet propietaria, abre la ficha y fija el precio. El contrato vuelve a validar propiedad, estado y permiso antes de firmar.
          </p>
        </div>
        {wallets.length > 0 && (
          <Button type="button" variant="ghost" disabled={state === 'loading'} onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw className={`mr-2 h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {!address && <LandingWalletConnectButton evmOnly label="Conectar wallet BSC" compactLabel="Conectar BSC" />}
        {!tronAddress && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setWalletError(null);
              void requestWallet({
                kind: 'tron',
                targetTronNetwork: 'mainnet',
                reason: 'Conecta TronLink en TRON Mainnet para consultar tus Cukies Legacy.',
              }).catch((error: unknown) => {
                setWalletError(error instanceof Error ? error.message : 'No se pudo conectar TronLink.');
              });
            }}
          >
            <Wallet className="mr-2 h-4 w-4" />
            {isTronInstalled ? 'Conectar TronLink' : 'Instalar TronLink'}
          </Button>
        )}
      </div>
      {walletError ? <p role="alert" className="mt-3 text-sm font-semibold text-amber-100">{walletError}</p> : null}

      {state === 'loading' && items.length === 0 && (
        <p role="status" className="mt-5 flex items-center text-sm font-semibold text-[var(--uki-muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando Cukies disponibles…
        </p>
      )}
      {state === 'unavailable' && (
        <p role="alert" className="mt-5 rounded-[9px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          No se pudo consultar tu inventario Legacy. No se interpreta como una colección vacía.
        </p>
      )}
      {state === 'ready' && items.length === 0 && (
        <p className="mt-5 rounded-[9px] border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--uki-muted)]">
          No hay Cukies Legacy disponibles en las wallets conectadas. Los Cukies en venta, staking, crianza o bridge no se ofrecen para crear un anuncio nuevo.
        </p>
      )}
      {items.length > 0 && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => <CukiCard key={`${item.network}-${item.tokenId}`} cuki={item} />)}
          </div>
          {nextPages.length > 0 && (
            <div className="mt-5 flex justify-center">
              <Button type="button" variant="outline" disabled={state === 'loading'} onClick={() => void loadMore()}>
                {state === 'loading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cargar más Cukies
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
