'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  LockKey,
  ShieldCheck,
  Storefront,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { formatUnits, zeroHash, type Address, type Hash } from 'viem';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { Button } from '@/components/ui/button';
import { useHasMounted } from '@/hooks/use-has-mounted';
import {
  ukiMarketplaceNftReadAbi,
  ukiMarketplaceReadAbi,
  ukiMarketplaceWriteAbi,
} from '@/lib/uki-marketplace/abi';
import {
  defaultUkiMarketplaceExpiry,
  validateUkiMarketplaceListing,
} from '@/lib/uki-marketplace/listing';
import { ukiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';
import type {
  UkiMarketplaceInventoryItem,
  UkiMarketplaceInventoryResponse,
  UkiMarketplaceOrderView,
  UkiMarketplaceOrdersResponse,
} from '@/lib/uki-marketplace/types';
import { useAuth } from '@/providers/auth-provider';

const SELLER_ORDER_LIMIT = 50;
const INDEXER_RETRY_COUNT = 8;
const INDEXER_RETRY_MS = 2_500;

type SellerDataState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      inventory: UkiMarketplaceInventoryItem[];
      orders: UkiMarketplaceOrderView[];
    }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }
  | { kind: 'error' };

type TransactionPhase =
  | 'idle'
  | 'verifying'
  | 'approving'
  | 'publishing'
  | 'cancelling'
  | 'syncing';

function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function shortIdentity(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatUkiAmount(raw: string) {
  if (!/^\d+$/.test(raw)) return '—';
  const amount = formatUnits(BigInt(raw), 18);
  const [integer, fraction = ''] = amount.split('.');
  const grouped = BigInt(integer).toLocaleString('es-ES');
  const visibleFraction = fraction.slice(0, 4).replace(/0+$/, '');
  return visibleFraction ? `${grouped},${visibleFraction}` : grouped;
}

function transactionError(reason: unknown) {
  if (reason instanceof Error) {
    const message = reason.message.toLowerCase();
    if (message.includes('user rejected') || message.includes('user denied') || message.includes('rejected')) {
      return 'La wallet canceló la firma. No se ha cambiado ninguna orden.';
    }
    if (reason.message.startsWith('MARKETPLACE_UI:')) {
      return reason.message.slice('MARKETPLACE_UI:'.length);
    }
  }
  return 'La transacción no pudo confirmarse. Revisa la wallet, la red y vuelve a intentarlo.';
}

function statusLabel(status: UkiMarketplaceOrderView['status']) {
  return ({
    active: 'Activa',
    sold: 'Vendida',
    cancelled: 'Cancelada',
    expired: 'Caducada',
    invalid: 'Invalidada',
    requires_attention: 'Requiere aprobación',
  } as const)[status];
}

function statusClass(status: UkiMarketplaceOrderView['status']) {
  if (status === 'active') return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100';
  if (status === 'requires_attention') return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
  return 'border-white/10 bg-white/[0.035] text-slate-300';
}

function blockerLabel(item: UkiMarketplaceInventoryItem) {
  if (item.listingBlockers.includes('conflicting_activity')) {
    return 'Tiene otra actividad o anuncio pendiente';
  }
  if (item.listingBlockers.includes('asset_not_available')) {
    return 'No está disponible para publicar';
  }
  return null;
}

function rarityLabel(rarity: string) {
  return ({
    common: 'Común',
    uncommon: 'No común',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Legendario',
    goat: 'Goat',
  } as Record<string, string>)[rarity] ?? 'Sin verificar';
}

async function waitForIndexer() {
  await new Promise((resolve) => window.setTimeout(resolve, INDEXER_RETRY_MS));
}

export function UkiMarketplaceSellerPanel() {
  const hasMounted = useHasMounted();
  const { user, walletType, isLoading: authLoading, fetchUser } = useAuth();
  const { address, chainId, connector, isConnected } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const expectedChainId = ukiMarketplacePublicConfig.chainId;
  const publicClient = usePublicClient({ chainId: expectedChainId ?? undefined });
  const [dataState, setDataState] = useState<SellerDataState>({ kind: 'idle' });
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [ukiPrice, setUkiPrice] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [phase, setPhase] = useState<TransactionPhase>('idle');
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);
  const [currentFeeBps, setCurrentFeeBps] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  const configReady = ukiMarketplacePublicConfig.ready
    && expectedChainId !== null
    && Boolean(ukiMarketplacePublicConfig.marketplaceAddress);
  const authenticatedWallet = Boolean(
    hasMounted
    && isConnected
    && address
    && walletType === 'evm'
    && sameAddress(address, user?.walletAddress),
  );
  const correctChain = Boolean(
    authenticatedWallet
    && chainId === ukiMarketplacePublicConfig.chainId,
  );
  const busy = phase !== 'idle';

  useEffect(() => {
    setExpiresAt(defaultUkiMarketplaceExpiry());
  }, []);

  const refresh = useCallback(async (options: { background?: boolean } = {}) => {
    if (!address || !authenticatedWallet) return null;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!options.background) setDataState({ kind: 'loading' });
    try {
      const walletAddress = encodeURIComponent(address);
      const [inventoryResponse, ordersResponse] = await Promise.all([
        fetch(`/api/marketplace/v1/inventory?walletAddress=${walletAddress}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        }),
        fetch(
          `/api/marketplace/v1/orders?scope=seller&walletAddress=${walletAddress}&limit=${SELLER_ORDER_LIMIT}`,
          { cache: 'no-store', credentials: 'same-origin' },
        ),
      ]);
      const [inventoryBody, ordersBody] = await Promise.all([
        inventoryResponse.json() as Promise<UkiMarketplaceInventoryResponse>,
        ordersResponse.json() as Promise<UkiMarketplaceOrdersResponse>,
      ]);
      if (requestIdRef.current !== requestId) return null;
      if (inventoryResponse.status === 401 || ordersResponse.status === 401) {
        setDataState({ kind: 'unauthorized' });
        return null;
      }
      if (inventoryResponse.status === 503 || ordersResponse.status === 503) {
        setDataState({ kind: 'unavailable' });
        return null;
      }
      if (
        !inventoryResponse.ok
        || !ordersResponse.ok
        || inventoryBody.status !== 'ok'
        || ordersBody.status !== 'ok'
      ) {
        setDataState({ kind: 'error' });
        return null;
      }
      const next = {
        kind: 'ready' as const,
        inventory: inventoryBody.data.items,
        orders: ordersBody.data.orders,
      };
      setDataState(next);
      setSelectedAssetId((current) => {
        if (current && next.inventory.some((item) => item.assetId === current)) return current;
        return next.inventory.find((item) => item.listingEligible)?.assetId
          ?? next.inventory[0]?.assetId
          ?? null;
      });
      return next;
    } catch {
      if (requestIdRef.current === requestId) setDataState({ kind: 'error' });
      return null;
    }
  }, [address, authenticatedWallet]);

  useEffect(() => {
    if (!configReady || authLoading || !authenticatedWallet) {
      setDataState({ kind: 'idle' });
      return;
    }
    void refresh();
  }, [authLoading, authenticatedWallet, configReady, refresh]);

  useEffect(() => {
    if (!configReady || !publicClient || !ukiMarketplacePublicConfig.marketplaceAddress) return;
    let disposed = false;
    publicClient.readContract({
      address: ukiMarketplacePublicConfig.marketplaceAddress,
      abi: ukiMarketplaceReadAbi,
      functionName: 'feeBps',
    }).then((value) => {
      if (!disposed) setCurrentFeeBps(Number(value));
    }).catch(() => {
      if (!disposed) setCurrentFeeBps(null);
    });
    return () => {
      disposed = true;
    };
  }, [configReady, publicClient]);

  const selectedAsset = useMemo(() => (
    dataState.kind === 'ready'
      ? dataState.inventory.find((item) => item.assetId === selectedAssetId) ?? null
      : null
  ), [dataState, selectedAssetId]);
  const activeAssetOrder = useMemo(() => (
    dataState.kind === 'ready' && selectedAsset
      ? dataState.orders.find((order) => (
          order.status === 'active'
          && sameAddress(order.collectionAddress, selectedAsset.collectionAddress)
          && order.tokenId === selectedAsset.tokenId
        )) ?? null
      : null
  ), [dataState, selectedAsset]);
  const validation = useMemo(() => validateUkiMarketplaceListing({
    ukiPrice,
    expiresAt,
  }), [expiresAt, ukiPrice]);

  const latestTxUrl = latestTxHash && ukiMarketplacePublicConfig.explorerBaseUrl
    ? `${ukiMarketplacePublicConfig.explorerBaseUrl}/tx/${latestTxHash}`
    : null;

  async function writeAndConfirm(input: Parameters<typeof writeContractAsync>[0]) {
    if (!publicClient) throw new Error('MARKETPLACE_UI:No podemos comprobar la red ahora.');
    const hash = await writeContractAsync(input);
    setLatestTxHash(hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error('MARKETPLACE_UI:La operación no se ha completado.');
    }
    return hash;
  }

  async function pollIndexedOrder(orderId: string, expected: 'present' | 'active' | 'closed') {
    for (let attempt = 0; attempt < INDEXER_RETRY_COUNT; attempt += 1) {
      const next = await refresh({ background: true });
      const order = next?.orders.find((candidate) => candidate.orderId === orderId);
      if (
        (expected === 'present' && Boolean(order))
        || (expected === 'active' && order?.status === 'active')
        || (expected === 'closed' && Boolean(order && order.status !== 'active'))
      ) {
        return true;
      }
      await waitForIndexer();
    }
    return false;
  }

  async function publishSelectedAsset() {
    const marketplaceAddress = ukiMarketplacePublicConfig.marketplaceAddress;
    if (
      !selectedAsset
      || !selectedAsset.listingEligible
      || activeAssetOrder
      || !validation.valid
      || !address
      || !marketplaceAddress
      || expectedChainId === null
      || !correctChain
      || !publicClient
      || busy
    ) return;

    const collectionAddress = selectedAsset.collectionAddress as Address;
    const tokenId = BigInt(selectedAsset.tokenId);
    setActiveOperationId(selectedAsset.assetId);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    try {
      setPhase('verifying');
      const [owner, collectionAllowed, approved, approvedForAll, activeOrderId] = await Promise.all([
        publicClient.readContract({
          address: collectionAddress,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'ownerOf',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'collectionAllowed',
          args: [collectionAddress],
        }),
        publicClient.readContract({
          address: collectionAddress,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'getApproved',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: collectionAddress,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'isApprovedForAll',
          args: [address, marketplaceAddress],
        }),
        publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'activeOrderIds',
          args: [collectionAddress, tokenId],
        }),
      ]);
      if (!sameAddress(owner, address)) {
        throw new Error('MARKETPLACE_UI:La wallet ya no es propietaria de este Cukie.');
      }
      if (collectionAllowed !== true) {
        throw new Error('MARKETPLACE_UI:Esta colección no está habilitada para publicar.');
      }
      if (activeOrderId !== zeroHash) {
        const currentState = await publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'orderState',
          args: [activeOrderId],
        });
        if (currentState === 1) {
          throw new Error('MARKETPLACE_UI:Este Cukie ya tiene una orden UKI activa.');
        }
      }

      if (!sameAddress(approved, marketplaceAddress) && approvedForAll !== true) {
        setPhase('approving');
        await writeAndConfirm({
          chainId: expectedChainId,
          address: collectionAddress,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'approve',
          args: [marketplaceAddress, tokenId],
        });
        const confirmedApproval = await publicClient.readContract({
          address: collectionAddress,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'getApproved',
          args: [tokenId],
        });
        if (!sameAddress(confirmedApproval, marketplaceAddress)) {
          throw new Error('MARKETPLACE_UI:No hemos podido confirmar el permiso del Cukie.');
        }
      }

      setPhase('publishing');
      await writeAndConfirm({
        chainId: expectedChainId,
        address: marketplaceAddress,
        abi: ukiMarketplaceWriteAbi,
        functionName: 'createOrder',
        args: [collectionAddress, tokenId, validation.ukiPriceRaw, validation.expiresAt],
      });
      const orderId = await publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'activeOrderIds',
        args: [collectionAddress, tokenId],
      });
      if (orderId === zeroHash) {
        throw new Error('MARKETPLACE_UI:La publicación se confirmó, pero no se pudo verificar su order ID.');
      }
      setPhase('syncing');
      setNotice(`Anuncio ${shortIdentity(orderId)} confirmado. Actualizando tu historial…`);
      window.dispatchEvent(new Event('cukies:uki-marketplace:refresh'));
      const indexed = await pollIndexedOrder(orderId, 'present');
      setNotice(indexed
        ? `Orden ${shortIdentity(orderId)} confirmada y visible en tu historial.`
        : `Anuncio ${shortIdentity(orderId)} confirmado. Puede tardar unos instantes en aparecer.`);
      setUkiPrice('');
      setExpiresAt(defaultUkiMarketplaceExpiry());
    } catch (reason) {
      setError(transactionError(reason));
    } finally {
      setPhase('idle');
      setActiveOperationId(null);
    }
  }

  async function cancelOrder(order: UkiMarketplaceOrderView) {
    const marketplaceAddress = ukiMarketplacePublicConfig.marketplaceAddress;
    if (
      busy
      || order.status !== 'active'
      || !address
      || !sameAddress(address, order.seller)
      || !marketplaceAddress
      || expectedChainId === null
      || !correctChain
      || !publicClient
    ) return;
    setActiveOperationId(order.orderId);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    try {
      setPhase('verifying');
      const currentState = await publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'orderState',
        args: [order.orderId],
      });
      if (currentState !== 1) {
        throw new Error('MARKETPLACE_UI:El anuncio ya no está activo. Actualiza tu historial.');
      }
      setPhase('cancelling');
      await writeAndConfirm({
        chainId: expectedChainId,
        address: marketplaceAddress,
        abi: ukiMarketplaceWriteAbi,
        functionName: 'cancelOrder',
        args: [order.orderId],
      });
      setPhase('syncing');
      setNotice(`Cancelación de ${shortIdentity(order.orderId)} confirmada. Actualizando el índice…`);
      window.dispatchEvent(new Event('cukies:uki-marketplace:refresh'));
      const indexed = await pollIndexedOrder(order.orderId, 'closed');
      setNotice(indexed
        ? 'Orden cancelada y reflejada en tu historial.'
        : 'Anuncio cancelado. Puede tardar unos instantes en reflejarse.');
    } catch (reason) {
      setError(transactionError(reason));
    } finally {
      setPhase('idle');
      setActiveOperationId(null);
    }
  }

  async function renewOrderApproval(order: UkiMarketplaceOrderView) {
    const marketplaceAddress = ukiMarketplacePublicConfig.marketplaceAddress;
    if (
      busy
      || order.status !== 'requires_attention'
      || order.attentionReason !== 'approval_required'
      || !address
      || !sameAddress(address, order.seller)
      || !marketplaceAddress
      || expectedChainId === null
      || !correctChain
      || !publicClient
    ) return;
    const collectionAddress = order.collectionAddress as Address;
    const tokenId = BigInt(order.tokenId);
    setActiveOperationId(order.orderId);
    setError(null);
    setNotice(null);
    setLatestTxHash(null);
    try {
      setPhase('verifying');
      const [owner, collectionAllowed, activeOrderId] = await Promise.all([
        publicClient.readContract({
          address: collectionAddress,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'ownerOf',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'collectionAllowed',
          args: [collectionAddress],
        }),
        publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'activeOrderIds',
          args: [collectionAddress, tokenId],
        }),
      ]);
      if (!sameAddress(owner, address) || collectionAllowed !== true || activeOrderId !== order.orderId) {
        throw new Error('MARKETPLACE_UI:La orden ya no puede recuperar su aprobación de forma segura.');
      }
      setPhase('approving');
      await writeAndConfirm({
        chainId: expectedChainId,
        address: collectionAddress,
        abi: ukiMarketplaceNftReadAbi,
        functionName: 'approve',
        args: [marketplaceAddress, tokenId],
      });
      const currentState = await publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'orderState',
        args: [order.orderId],
      });
      if (currentState !== 1) {
        throw new Error('MARKETPLACE_UI:La aprobación se confirmó, pero la orden continúa inválida.');
      }
      setPhase('syncing');
      setNotice(`Aprobación de ${shortIdentity(order.orderId)} restaurada. Actualizando el estado en vivo…`);
      window.dispatchEvent(new Event('cukies:uki-marketplace:refresh'));
      const indexed = await pollIndexedOrder(order.orderId, 'active');
      setNotice(indexed
        ? 'Aprobación restaurada; la orden vuelve a estar activa.'
        : 'Permiso restaurado. El anuncio puede tardar unos instantes en actualizarse.');
    } catch (reason) {
      setError(transactionError(reason));
    } finally {
      setPhase('idle');
      setActiveOperationId(null);
    }
  }

  async function renewSignedSession() {
    if (!address || !connector) return;
    setError(null);
    try {
      await fetchUser(address, {
        evmConnector: connector,
        promptForSignature: true,
        walletType: 'evm',
        requireSignedWallet: true,
      });
      await refresh();
    } catch {
      setError('No se pudo renovar la sesión firmada de esta wallet.');
    }
  }

  if (!configReady) {
    return (
      <section className="border-y border-amber-300/20 bg-amber-300/[0.045] px-4 py-6 sm:px-5">
        <div className="flex max-w-3xl gap-3">
          <WarningCircle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" weight="duotone" />
          <div>
            <h2 className="font-headline text-xl font-bold text-white">El marketplace no está disponible</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Falta parte de la configuración necesaria. Por seguridad, no puedes firmar operaciones ahora.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!hasMounted || authLoading) {
    return (
      <section aria-label="Cargando zona de vendedor" className="grid gap-4 border-y border-white/10 px-4 py-6 sm:grid-cols-[1.15fr_0.85fr] sm:px-5">
        <div className="h-40 animate-pulse rounded-[8px] bg-white/[0.045]" />
        <div className="h-40 animate-pulse rounded-[8px] bg-white/[0.035]" />
      </section>
    );
  }

  if (!authenticatedWallet) {
    return (
      <section className="grid gap-5 border-y border-white/10 px-4 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-lilac-100">Zona privada del vendedor</p>
          <h2 className="mt-1 font-headline text-2xl font-bold text-white">Conecta tu wallet para vender</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Podrás ver tus Cukies disponibles y publicar uno sin moverlo de tu wallet.
          </p>
        </div>
        <LandingWalletConnectButton
          evmOnly
          label="Conectar wallet para vender"
          compactLabel="Conectar"
          className="justify-center"
        />
      </section>
    );
  }

  if (!correctChain) {
    return (
      <section className="grid gap-5 border-y border-white/10 px-4 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Red incorrecta</p>
          <h2 className="mt-1 font-headline text-2xl font-bold text-white">Cambia a la red correcta</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">La cambiaremos desde tu wallet para que puedas continuar.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            if (expectedChainId) switchChain({ chainId: expectedChainId });
          }}
          disabled={isSwitchingChain}
          className="active:scale-[0.98]"
        >
          {isSwitchingChain ? 'Cambiando red…' : 'Cambiar de red'}
        </Button>
      </section>
    );
  }

  if (dataState.kind === 'loading' || dataState.kind === 'idle') {
    return (
      <section aria-label="Cargando inventario del vendedor" className="grid gap-4 border-y border-white/10 px-4 py-6 sm:grid-cols-[1.15fr_0.85fr] sm:px-5">
        <div className="h-56 animate-pulse rounded-[8px] bg-white/[0.045]" />
        <div className="h-56 animate-pulse rounded-[8px] bg-white/[0.035]" />
      </section>
    );
  }

  if (dataState.kind === 'unauthorized') {
    return (
      <section className="border-y border-amber-300/20 px-4 py-6 sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-headline text-xl font-bold text-white">La sesión firmada ha caducado</h2>
            <p className="mt-1 text-sm text-slate-400">Vuelve a firmar con la misma wallet para consultar inventario e historial.</p>
          </div>
          <Button type="button" onClick={() => void renewSignedSession()} className="active:scale-[0.98]">
            <LockKey aria-hidden className="mr-2 h-4 w-4" /> Renovar firma
          </Button>
        </div>
      </section>
    );
  }

  if (dataState.kind === 'unavailable' || dataState.kind === 'error') {
    return (
      <section className="border-y border-amber-300/20 px-4 py-6 sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-headline text-xl font-bold text-white">
              {dataState.kind === 'unavailable' ? 'La zona de vendedor aún no está activa' : 'No se pudo cargar tu zona de vendedor'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">Tus Cukies permanecen protegidos mientras el servicio no esté disponible.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void refresh()} className="active:scale-[0.98]">
            <ArrowClockwise aria-hidden className="mr-2 h-4 w-4" /> Reintentar
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="border-y border-white/10 bg-[#0d0914]/70">
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="min-w-0 px-4 py-6 sm:px-5 lg:border-r lg:border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-lilac-100">
                <Storefront aria-hidden className="h-4 w-4" weight="duotone" /> Zona privada del vendedor
              </p>
              <h2 className="mt-1 font-headline text-2xl font-bold text-white">Publicar un Cukie en UKI</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                El NFT permanece en tu wallet. La aprobación es por token y la venta solo se ejecuta de forma atómica.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy} className="border-white/10 bg-white/[0.03] active:scale-[0.98]">
              <ArrowClockwise aria-hidden className="mr-2 h-4 w-4" /> Actualizar
            </Button>
          </div>

          {notice ? (
            <p role="status" className="mt-5 flex gap-2 rounded-[8px] border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
              <CheckCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" weight="fill" /> {notice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-5 flex gap-2 rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <WarningCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" weight="duotone" /> {error}
            </p>
          ) : null}
          {latestTxUrl ? (
            <a href={latestTxUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex font-mono text-xs text-lilac-100 underline decoration-lilac-200/40 underline-offset-4">
              Ver última transacción {shortIdentity(latestTxHash ?? '')}
            </a>
          ) : null}

          {dataState.inventory.length === 0 ? (
            <div className="mt-6 border-t border-white/10 py-10 text-center">
              <Storefront aria-hidden className="mx-auto h-8 w-8 text-lilac-100" weight="duotone" />
              <h3 className="mt-3 font-headline text-lg font-bold text-white">No hay Cukies libres en esta wallet</h3>
              <p className="mt-1 text-sm text-slate-400">Los NFTs en staking, pool u otra custodia no pueden publicarse desde aquí.</p>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {dataState.inventory.map((item) => {
                  const selected = item.assetId === selectedAssetId;
                  const blocker = blockerLabel(item);
                  return (
                    <button
                      key={item.assetId}
                      type="button"
                      onClick={() => setSelectedAssetId(item.assetId)}
                      className={`grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-[8px] border p-3 text-left transition duration-300 ease-out active:scale-[0.98] ${selected ? 'border-lilac-200/45 bg-lilac-200/[0.08]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'}`}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-[6px] bg-black/25">
                        <CukiImage src={item.imageUrl} alt={`Cukie #${item.tokenId}`} sizes="72px" className="object-contain p-1" />
                      </div>
                      <span className="min-w-0">
                        <span className="block font-headline text-base font-bold text-white">Cukie #{item.tokenId}</span>
                        <span className="mt-1 block text-xs text-slate-400">{rarityLabel(item.rarity)}</span>
                        <span className={`mt-2 block text-xs ${blocker ? 'text-amber-200' : 'text-emerald-200'}`}>
                          {blocker ?? 'Disponible para publicar'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  Precio del vendedor en UKI
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Precio del vendedor en UKI"
                    value={ukiPrice}
                    onChange={(event) => setUkiPrice(event.target.value)}
                    placeholder="1250"
                    disabled={busy}
                    className="h-11 rounded-[8px] border border-white/10 bg-black/25 px-3 font-mono text-white outline-none transition focus:border-lilac-200/50 disabled:opacity-60"
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Recibes exactamente este importe en UKI.</span>
                  {!validation.valid && validation.priceError && ukiPrice ? <span className="text-xs font-normal text-amber-200">{validation.priceError}</span> : null}
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  Caducidad de la orden
                  <input
                    type="datetime-local"
                    aria-label="Caducidad de la orden"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    disabled={busy}
                    className="h-11 rounded-[8px] border border-white/10 bg-black/25 px-3 font-mono text-white outline-none transition focus:border-lilac-200/50 disabled:opacity-60"
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Entre 5 minutos y 90 días; por defecto, 7 días.</span>
                  {!validation.valid && validation.expiryError ? <span className="text-xs font-normal text-amber-200">{validation.expiryError}</span> : null}
                </label>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-xl text-xs leading-5 text-slate-400">
                  <p>El comprador paga la comisión en la moneda elegida. {currentFeeBps === null ? 'La comisión actual se mostrará antes de confirmar.' : `Comisión actual: ${(currentFeeBps / 100).toLocaleString('es-ES')}%.`}</p>
                  <p className="mt-1">Si falta permiso, la wallet pedirá primero aprobar este NFT y después publicar la orden.</p>
                </div>
                <Button
                  type="button"
                  onClick={() => void publishSelectedAsset()}
                  disabled={busy || !selectedAsset?.listingEligible || Boolean(activeAssetOrder) || !validation.valid}
                  className="min-w-52 active:scale-[0.98]"
                >
                  <ShieldCheck aria-hidden className="mr-2 h-4 w-4" weight="duotone" />
                  {activeOperationId === selectedAsset?.assetId && phase !== 'idle'
                    ? ({
                        verifying: 'Comprobando…',
                        approving: 'Confirmando aprobación…',
                        publishing: 'Confirmando publicación…',
                        cancelling: 'Cancelando…',
                        syncing: 'Actualizando índice…',
                        idle: 'Verificar y publicar',
                      } as const)[phase]
                    : activeAssetOrder
                      ? 'Ya tiene una orden activa'
                      : 'Verificar y publicar'}
                </Button>
              </div>
            </>
          )}
        </div>

        <aside className="min-w-0 px-4 py-6 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial privado</p>
          <h2 className="mt-1 font-headline text-xl font-bold text-white">Tus órdenes UKI</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Incluye órdenes activas, vendidas, canceladas, caducadas e invalidadas.</p>

          {dataState.orders.length === 0 ? (
            <div className="mt-6 border-t border-white/10 py-10 text-center">
              <Clock aria-hidden className="mx-auto h-7 w-7 text-slate-400" weight="duotone" />
              <p className="mt-3 text-sm font-semibold text-slate-300">Todavía no has publicado órdenes UKI.</p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-white/10 border-y border-white/10">
              {dataState.orders.map((order) => {
                const working = activeOperationId === order.orderId && busy;
                return (
                  <article key={order.orderId} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-headline font-bold text-white">Cukie #{order.tokenId}</p>
                        <p className="mt-1 font-mono text-[11px] text-slate-500">{shortIdentity(order.orderId)}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass(order.status)}`}>
                        {statusLabel(order.status)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500">Precio fijado</p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-white">{formatUkiAmount(order.ukiPriceRaw)} UKI</p>
                      </div>
                      {order.status === 'active' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void cancelOrder(order)}
                          disabled={busy}
                          className="border-rose-300/20 bg-rose-300/[0.06] text-rose-100 hover:bg-rose-300/10 active:scale-[0.98]"
                        >
                          <XCircle aria-hidden className="mr-1.5 h-4 w-4" />
                          {working ? 'Cancelando…' : 'Cancelar anuncio'}
                        </Button>
                      ) : null}
                      {order.status === 'requires_attention' && order.attentionReason === 'approval_required' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void renewOrderApproval(order)}
                          disabled={busy}
                          className="border-amber-300/20 bg-amber-300/[0.06] text-amber-100 hover:bg-amber-300/10 active:scale-[0.98]"
                        >
                          <ShieldCheck aria-hidden className="mr-1.5 h-4 w-4" weight="duotone" />
                          {working ? 'Aprobando…' : 'Restaurar aprobación'}
                        </Button>
                      ) : null}
                    </div>
                    {order.status === 'requires_attention' ? (
                      <p className="mt-3 flex gap-2 text-xs leading-5 text-amber-200">
                        <WarningCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> La aprobación del marketplace ya no está vigente. Esta orden no se muestra públicamente.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
