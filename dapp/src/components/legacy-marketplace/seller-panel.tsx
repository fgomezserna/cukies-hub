'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { Button } from '@/components/ui/button';
import { useTronLink } from '@/hooks/use-tronlink';
import type {
  LegacyMarketplaceCukiItem,
  LegacyMarketplaceListResponse,
} from '@/lib/legacy-marketplace/types';

import { CukiCard } from './cuki-card';

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable';

export function LegacyMarketplaceSellerPanel() {
  const { address } = useAccount();
  const {
    address: tronAddress,
    connect: connectTron,
    isInstalled: isTronInstalled,
  } = useTronLink();
  const [state, setState] = useState<LoadState>('idle');
  const [items, setItems] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const wallets = useMemo(
    () => [
      ...(address ? [{ address, network: 'BSC' }] : []),
      ...(tronAddress ? [{ address: tronAddress, network: 'TRON' }] : []),
    ],
    [address, tronAddress],
  );

  useEffect(() => {
    if (wallets.length === 0) {
      setItems([]);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    Promise.all(
      wallets.map(async (wallet) => {
        const query = new URLSearchParams({
          owner: wallet.address,
          network: wallet.network,
          state: 'available',
          limit: '60',
          sort: 'number-asc',
        });
        const response = await fetch(`/api/legacy-marketplace/cukies?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('LEGACY_INVENTORY_UNAVAILABLE');
        return response.json() as Promise<LegacyMarketplaceListResponse>;
      }),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        setItems(results.flatMap((result) => result.items));
        setState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setState('unavailable');
      });
    return () => controller.abort();
  }, [reloadKey, wallets]);

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
          <Button type="button" variant="outline" onClick={() => void connectTron()}>
            <Wallet className="mr-2 h-4 w-4" />
            {isTronInstalled ? 'Conectar TronLink' : 'Instalar TronLink'}
          </Button>
        )}
      </div>

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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => <CukiCard key={`${item.network}-${item.tokenId}`} cuki={item} />)}
        </div>
      )}
    </div>
  );
}
