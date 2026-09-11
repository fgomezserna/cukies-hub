'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft,
  Check,
  Loader2,
  Network,
  RefreshCcw,
  Route,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { formatEther, isAddress, type Address } from 'viem';
import {
  useAccount,
  useConfig,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { getAccount, getChainId } from 'wagmi/actions';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTronLink } from '@/hooks/use-tronlink';
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';
import {
  legacyMarketplaceBscAbis,
  legacyMarketplaceTronAbis,
} from '@/lib/legacy-marketplace/abis';
import { cukiesBridgeEndpointAbi } from '@/lib/legacy-marketplace/bridge-endpoint-abi';
import {
  cukiesBridgeRuntimeConfig,
  type CukiesBridgeRuntimeConfig,
} from '@/lib/legacy-marketplace/bridge-runtime';
import {
  assertEvmActionContext,
  assertTronActionContext,
  captureTronActionContext,
  isSameTronWallet,
} from '@/lib/legacy-marketplace/action-safety';
import {
  getLegacyTronWeb,
  getLegacyTronWalletRpcOrigin,
  isLegacyTronWalletOnRpc,
  readTronContractAt,
  sendTronContractAt,
} from '@/lib/legacy-marketplace/tron';
import {
  assertTronSendResult,
  tronTransactionId,
  waitForLegacyTronReceipt,
} from '@/lib/legacy-marketplace/transaction';
import {
  isTransactionRefreshAborted,
  retryTransactionRefresh,
  TransactionReplacementError,
  TransactionReplacementPendingError,
  waitForConfirmedEvmTransaction,
  throwIfTransactionRefreshAborted,
} from '@/lib/transaction-refresh';
import type {
  LegacyMarketplaceCukiItem,
  LegacyMarketplaceListResponse,
} from '@/lib/legacy-marketplace/types';

import { CukiImage } from './cuki-image';
import {
  getCukiDisplayName,
  getStateLabel,
  getTypeLabel,
  shortWallet,
} from './format';

type BridgeNetwork = 'BSC' | 'TRON';
type BridgeTab = 'prepare' | 'tracking';

const BRIDGE_TAB_HASH: Record<BridgeTab, string> = {
  prepare: '#bridge-preparar',
  tracking: '#seguimiento',
};

function bridgeTabForHash(hash: string): BridgeTab {
  return hash === '#seguimiento' ? 'tracking' : 'prepare';
}

type TronBridgeSnapshot = {
  price: string | null;
  rawPrice: string | null;
  paused: boolean | null;
  approved: boolean | null;
};

type EnabledBridgeRuntime = {
  bscChainId: 56 | 97;
  bscNetworkLabel: string;
  bscTokenAddress: Address;
  bscBridgeAddress: Address;
  tronNetworkLabel: string;
  tronRpcUrl: string;
  tronTokenAddress: string;
  tronBridgeAddress: string;
  operationsEnabled: boolean;
  readOnly: boolean;
};

function enabledBridgeRuntime(
  config: CukiesBridgeRuntimeConfig,
): EnabledBridgeRuntime | null {
  if (
    !config.enabled ||
    (config.bsc.chainId !== 56 && config.bsc.chainId !== 97) ||
    !config.bsc.collectionAddress ||
    !config.bsc.endpointAddress ||
    !config.tron.collectionAddress ||
    !config.tron.endpointAddress ||
    !config.tron.rpcUrl
  ) {
    return null;
  }

  return {
    bscChainId: config.bsc.chainId,
    bscNetworkLabel: config.bsc.networkLabel,
    bscTokenAddress: config.bsc.collectionAddress,
    bscBridgeAddress: config.bsc.endpointAddress,
    tronNetworkLabel: config.tron.networkLabel,
    tronRpcUrl: config.tron.rpcUrl,
    tronTokenAddress: config.tron.collectionAddress,
    tronBridgeAddress: config.tron.endpointAddress,
    operationsEnabled: config.operationsEnabled,
    readOnly: !config.operationsEnabled,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown bridge error';
}

function getDestinationNetwork(source: BridgeNetwork): BridgeNetwork {
  return source === 'BSC' ? 'TRON' : 'BSC';
}

function getDestinationPrefix(destination: BridgeNetwork) {
  return destination === 'BSC' ? 1 : 0;
}

function formatBscBridgePrice(value?: bigint | null) {
  if (value === undefined || value === null) return '-';

  return `${Number(formatEther(value)).toLocaleString('en-US', {
    maximumFractionDigits: 6,
  })} BNB`;
}

function formatTronBridgePrice(value: unknown) {
  if (value === undefined || value === null) return '-';

  const numeric = Number(String(value));
  if (!Number.isFinite(numeric)) return String(value);

  return `${(numeric / 1_000_000).toLocaleString('en-US', {
    maximumFractionDigits: 6,
  })} TRX`;
}

function canConvertTronDestination(value: string) {
  return value.startsWith('T') || isAddress(value);
}

function tronDestinationToSolidityAddress(value: string): Address {
  if (isAddress(value)) return value;

  const tronWeb = getLegacyTronWeb();
  if (!tronWeb?.address?.toHex) {
    throw new Error('TronLink es necesario para convertir destino TRON.');
  }

  const hex = String(tronWeb.address.toHex(value));
  if (!hex.startsWith('41') || hex.length !== 42) {
    throw new Error('La direccion TRON destino no es valida.');
  }

  return `0x${hex.slice(2)}` as Address;
}

async function fetchBridgeCukies(
  params: {
    owner: string;
    network: BridgeNetwork;
    state: 'available' | 'inBridge';
    limit?: number;
    tokenId?: string;
  },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    owner: params.owner,
    network: params.network,
    state: params.state,
    limit: String(params.limit ?? 60),
    sort: 'newest',
  });
  if (params.tokenId) query.set('search', params.tokenId);
  const response = await fetch(`/api/cukies?${query}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('No se han podido cargar Cukies.');
  const payload = await response.json() as LegacyMarketplaceListResponse;
  return Array.isArray(payload.items) ? payload.items : [];
}

function sameBridgeAsset(
  item: LegacyMarketplaceCukiItem,
  tokenId: string,
  collectionAddress?: string | null,
) {
  if (item.tokenId !== tokenId) return false;
  if (!collectionAddress) return true;
  const itemCollection = item.collectionAddress;
  return typeof itemCollection === 'string'
    && itemCollection.toLowerCase() === collectionAddress.toLowerCase();
}

function BridgeCukiCard({
  cuki,
  selected,
  disabled,
  onSelect,
}: {
  cuki: LegacyMarketplaceCukiItem;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <div className="relative aspect-square overflow-hidden rounded-[8px] bg-[#0d0914]">
        <CukiImage
          src={cuki.imageUrl}
          alt={getCukiDisplayName(cuki)}
          sizes="88px"
          className="object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-headline text-lg font-bold text-white">
          {getCukiDisplayName(cuki)}
          </p>
          {selected && <Check className="h-4 w-4 shrink-0 text-lilac-100" />}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {getTypeLabel(cuki.type)} · {cuki.network} · Gen{' '}
          {cuki.skills.generation ?? '-'}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 text-slate-300">
            {getStateLabel(cuki.state)}
          </span>
          <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 text-slate-300">
            Life {cuki.skills.life ?? 0}
          </span>
          <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 text-slate-300">
            Energy {cuki.skills.energy ?? 0}
          </span>
        </div>
      </div>
    </>
  );

  if (!onSelect) {
    return (
      <Link
        href={`/marketplace/${cuki.tokenId}`}
        className="group grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-lilac-300/35 hover:bg-lilac-300/10"
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`group grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-[8px] border p-3 text-left transition ${
        selected
          ? 'border-lilac-300/70 bg-lilac-300/15'
          : 'border-white/10 bg-white/[0.03] hover:border-lilac-300/35 hover:bg-lilac-300/10'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {content}
    </button>
  );
}

function BridgeUnavailable() {
  return (
    <section
      role="status"
      data-testid="cukies-bridge-disabled"
      className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-5 text-amber-50"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
        <div>
          <h2 className="font-headline text-xl font-bold text-white">
            Bridge no disponible
          </h2>
          <p className="mt-2 text-sm text-amber-100/90">
            Las transferencias están desactivadas mientras el servicio no esté
            listo. Tus Cukies no se moverán.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/cukies"
              className="inline-flex items-center rounded-[8px] border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-sm font-semibold text-amber-50"
            >
              Volver a Mis Cukies
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BridgeClient() {
  const runtime = enabledBridgeRuntime(cukiesBridgeRuntimeConfig);
  if (!runtime) return <BridgeUnavailable />;

  return <BridgeOperationsClient runtime={runtime} />;
}

function BridgeOperationsClient({
  runtime,
}: {
  runtime: EnabledBridgeRuntime;
}) {
  const {
    bscChainId,
    bscNetworkLabel,
    bscTokenAddress,
    bscBridgeAddress,
    tronNetworkLabel,
    tronRpcUrl,
    tronTokenAddress,
    tronBridgeAddress,
    operationsEnabled,
    readOnly,
  } = runtime;
  const { address, chainId, isConnected } = useAccount();
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient({ chainId: bscChainId });
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const {
    address: tronAddress,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
    isLoading: isTronLoading,
  } = useTronLink();
  const { requestWallet } = useWalletCoordinator();
  const [sourceNetwork] = useState<BridgeNetwork>('TRON');
  const [destinationOwner, setDestinationOwner] = useState('');
  const [candidates, setCandidates] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [bridgingCukies, setBridgingCukies] = useState<
    LegacyMarketplaceCukiItem[]
  >([]);
  const [selectedCuki, setSelectedCuki] =
    useState<LegacyMarketplaceCukiItem | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isLoadingBridging, setIsLoadingBridging] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BridgeTab>('prepare');
  const [tronSnapshot, setTronSnapshot] = useState<TronBridgeSnapshot>({
    price: null,
    rawPrice: null,
    paused: null,
    approved: null,
  });
  const tronSnapshotRequestRef = useRef(0);
  const candidatesRequestRef = useRef(0);
  const bridgingRequestRef = useRef(0);
  const candidatesAbortRef = useRef<AbortController | null>(null);
  const bridgingAbortRef = useRef<AbortController | null>(null);
  const operationLockRef = useRef(false);
  const operationAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const bridgeRefreshAbortRef = useRef<AbortController | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [approvalPending, setApprovalPending] = useState<string | null>(null);
  const [bscApprovalOverride, setBscApprovalOverride] = useState(false);
  const [pendingBridge, setPendingBridge] = useState<{
    cuki: LegacyMarketplaceCukiItem;
    sourceNetwork: BridgeNetwork;
    sourceOwner: string;
    destinationNetwork: BridgeNetwork;
    destinationOwner: string;
    destinationCollectionAddress: string | null;
    hash: string;
    phase: 'source-pending' | 'in-transit';
  } | null>(null);

  const syncTabFromLocation = useCallback(() => {
    if (typeof window === 'undefined') return;
    setActiveTab(bridgeTabForHash(window.location.hash));
  }, []);

  useEffect(() => {
    syncTabFromLocation();
    window.addEventListener('hashchange', syncTabFromLocation);
    window.addEventListener('popstate', syncTabFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncTabFromLocation);
      window.removeEventListener('popstate', syncTabFromLocation);
    };
  }, [syncTabFromLocation]);

  function selectTab(value: string) {
    const tab = value as BridgeTab;
    if (tab !== 'prepare' && tab !== 'tracking') return;
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const nextHash = BRIDGE_TAB_HASH[tab];
      if (window.location.hash !== nextHash) {
        window.history.pushState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.search}${nextHash}`,
        );
      }
    }
  }

  const destinationNetwork = getDestinationNetwork(sourceNetwork);
  const sourceOwner = sourceNetwork === 'BSC' ? address : tronAddress;
  const sourceChainId = sourceNetwork === 'BSC' ? chainId : null;
  const tronWeb = getLegacyTronWeb();
  const tronWalletRpcOrigin = getLegacyTronWalletRpcOrigin(tronWeb);
  const bscReady =
    sourceNetwork === 'BSC' && isConnected && chainId === bscChainId;
  const tronReady =
    sourceNetwork === 'TRON' &&
    isTronConnected &&
    isLegacyTronWalletOnRpc(tronWeb, tronRpcUrl);
  const ready = sourceNetwork === 'BSC' ? bscReady : tronReady;
  const disabled = isWriting || isTronLoading || operationBusy || Boolean(approvalPending) || Boolean(pendingBridge);

  const { data: bscBridgePrice } = useReadContract({
    address: bscBridgeAddress,
    abi: cukiesBridgeEndpointAbi,
    functionName: 'bridgePrice',
    chainId: bscChainId,
  });
  const { data: bscPaused } = useReadContract({
    address: bscBridgeAddress,
    abi: cukiesBridgeEndpointAbi,
    functionName: 'paused',
    chainId: bscChainId,
  });
  const { data: bscApproved } = useReadContract({
    address: bscTokenAddress,
    abi: legacyMarketplaceBscAbis.token,
    functionName: 'isApprovedForAll',
    args: address ? [address, bscBridgeAddress] : undefined,
    chainId: bscChainId,
    query: {
      enabled: Boolean(address),
    },
  });

  const bridgePrice =
    sourceNetwork === 'BSC'
      ? formatBscBridgePrice(bscBridgePrice as bigint | undefined)
      : tronSnapshot.price ?? '-';
  const bridgePaused: boolean | null =
    sourceNetwork === 'BSC'
      ? typeof bscPaused === 'boolean' ? bscPaused : null
      : tronSnapshot.paused;
  const bridgeStatusLabel =
    bridgePaused === null
      ? 'Sin verificar'
      : bridgePaused
        ? 'Pausado'
        : 'Disponible';
  const approved =
    sourceNetwork === 'BSC'
      ? Boolean(bscApproved) || bscApprovalOverride
      : tronSnapshot.approved === true;

  const suggestedDestination = useMemo(() => {
    if (sourceNetwork === 'TRON') return address ?? '';
    return tronAddress ?? '';
  }, [address, sourceNetwork, tronAddress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      candidatesAbortRef.current?.abort();
      bridgingAbortRef.current?.abort();
      operationAbortRef.current?.abort();
      bridgeRefreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const activeOperation = operationAbortRef.current;
    activeOperation?.abort();
    if (activeOperation) {
      operationAbortRef.current = null;
      operationLockRef.current = false;
      setOperationBusy(false);
    }
    bridgeRefreshAbortRef.current?.abort();
    candidatesAbortRef.current?.abort();
    bridgingAbortRef.current?.abort();
    tronSnapshotRequestRef.current += 1;
    setPendingBridge(null);
    setApprovalPending(null);
    setBscApprovalOverride(false);
    setCandidates([]);
    setBridgingCukies([]);
    setSelectedCuki(null);
    setStatus(null);
  }, [sourceChainId, sourceNetwork, sourceOwner, tronWalletRpcOrigin]);

  useEffect(() => {
    setDestinationOwner(suggestedDestination);
  }, [suggestedDestination]);

  const refreshCandidates = useCallback(async (options: { preserve?: boolean } = {}) => {
    const requestId = candidatesRequestRef.current + 1;
    candidatesRequestRef.current = requestId;
    candidatesAbortRef.current?.abort();
    const controller = new AbortController();
    candidatesAbortRef.current = controller;
    const requestedOwner = sourceOwner;
    const isCurrent = () => {
      const currentTronWeb = getLegacyTronWeb();
      const currentOwner = sourceNetwork === 'BSC'
        ? getAccount(wagmiConfig).address
        : currentTronWeb?.defaultAddress?.base58;
      const ownerMatches = sourceNetwork === 'BSC'
        ? (currentOwner?.toLowerCase() ?? null) === (requestedOwner?.toLowerCase() ?? null)
        : Boolean(currentTronWeb && requestedOwner && currentOwner
          && isSameTronWallet(currentTronWeb, requestedOwner, currentOwner));
      return requestId === candidatesRequestRef.current
        && !controller.signal.aborted
        && ownerMatches
        && (sourceNetwork !== 'TRON'
          || isLegacyTronWalletOnRpc(currentTronWeb, tronRpcUrl));
    };
    if (!requestedOwner) {
      if (!options.preserve) setCandidates([]);
      setIsLoadingCandidates(false);
      return [];
    }

    setIsLoadingCandidates(true);
    try {
      const items = await fetchBridgeCukies({
        owner: requestedOwner,
        network: sourceNetwork,
        state: 'available',
        limit: 60,
      }, controller.signal);
      if (!isCurrent()) return [];
      setCandidates(items);
      return items;
    } catch (error) {
      if (!isCurrent()) return [];
      if (!isTransactionRefreshAborted(error) && !(error instanceof DOMException && error.name === 'AbortError')) {
        setStatus(getErrorMessage(error));
        if (!options.preserve) setCandidates([]);
      }
      return [];
    } finally {
      if (isCurrent()) {
        setIsLoadingCandidates(false);
        if (candidatesAbortRef.current === controller) candidatesAbortRef.current = null;
      }
    }
  }, [sourceNetwork, sourceOwner, tronRpcUrl, wagmiConfig]);

  const refreshBridgingCukies = useCallback(async (options: { preserve?: boolean } = {}) => {
    const requestId = bridgingRequestRef.current + 1;
    bridgingRequestRef.current = requestId;
    bridgingAbortRef.current?.abort();
    const controller = new AbortController();
    bridgingAbortRef.current = controller;
    const wallets = [address, tronAddress].filter((wallet): wallet is string =>
      Boolean(wallet),
    );

    if (wallets.length === 0) {
      if (!options.preserve) setBridgingCukies([]);
      setIsLoadingBridging(false);
      return [];
    }

    setIsLoadingBridging(true);
    try {
      const responses = await Promise.all(
        wallets.map((wallet) => fetchBridgeCukies({
          owner: wallet,
          network: wallet === address ? 'BSC' : 'TRON',
          state: 'inBridge',
          limit: 30,
        }, controller.signal).catch(() => [])),
      );

      const currentBscOwner = getAccount(wagmiConfig).address;
      const currentTronWeb = getLegacyTronWeb();
      const currentTronOwner = currentTronWeb?.defaultAddress?.base58;
      const tronOwnerMatches = tronAddress
        ? Boolean(currentTronWeb && currentTronOwner
          && isSameTronWallet(currentTronWeb, tronAddress, currentTronOwner))
        : !currentTronOwner;
      const contextIsCurrent = requestId === bridgingRequestRef.current
        && !controller.signal.aborted
        && (currentBscOwner?.toLowerCase() ?? null) === (address?.toLowerCase() ?? null)
        && tronOwnerMatches;
      if (!contextIsCurrent) return [];

      const seen = new Set<string>();
      const items = responses.flat().filter((item) => {
        if (seen.has(item.tokenId)) return false;
        seen.add(item.tokenId);
        return true;
      });
      setBridgingCukies(items);
      return items;
    } catch (error) {
      if (requestId === bridgingRequestRef.current && !controller.signal.aborted) {
        setStatus(getErrorMessage(error));
        if (!options.preserve) setBridgingCukies([]);
      }
      return [];
    } finally {
      if (requestId === bridgingRequestRef.current && !controller.signal.aborted) {
        setIsLoadingBridging(false);
        if (bridgingAbortRef.current === controller) bridgingAbortRef.current = null;
      }
    }
  }, [address, tronAddress, wagmiConfig]);

  const refreshTronSnapshot = useCallback(async () => {
    const requestId = tronSnapshotRequestRef.current + 1;
    tronSnapshotRequestRef.current = requestId;
    const currentTronWeb = getLegacyTronWeb();
    const requestAddress = tronAddress;
    const requestRpcOrigin = getLegacyTronWalletRpcOrigin(currentTronWeb);
    const clearSnapshot = () => setTronSnapshot({
      price: null,
      rawPrice: null,
      paused: null,
      approved: null,
    });
    const contextIsCurrent = () => {
      const latestTronWeb = getLegacyTronWeb();
      return (
        requestId === tronSnapshotRequestRef.current
        && Boolean(latestTronWeb && requestAddress && latestTronWeb.defaultAddress?.base58
          && isSameTronWallet(latestTronWeb, requestAddress, latestTronWeb.defaultAddress.base58))
        && requestRpcOrigin === getLegacyTronWalletRpcOrigin(latestTronWeb)
        && isLegacyTronWalletOnRpc(latestTronWeb, tronRpcUrl)
      );
    };
    if (
      !requestAddress
      || !currentTronWeb
      || !isLegacyTronWalletOnRpc(currentTronWeb, tronRpcUrl)
    ) {
      clearSnapshot();
      if (tronAddress && currentTronWeb && tronWalletRpcOrigin !== tronRpcUrl) {
        setStatus(`Cambia TronLink a ${tronNetworkLabel} para consultar el bridge.`);
      }
      return;
    }
    clearSnapshot();

    try {
      const [price, paused, approval] = await Promise.all([
        readTronContractAt<unknown>(
          currentTronWeb,
          cukiesBridgeEndpointAbi,
          tronBridgeAddress,
          'bridgePrice',
        ),
        readTronContractAt<unknown>(
          currentTronWeb,
          cukiesBridgeEndpointAbi,
          tronBridgeAddress,
          'paused',
        ),
        readTronContractAt<unknown>(
          currentTronWeb,
          legacyMarketplaceTronAbis.token,
          tronTokenAddress,
          'isApprovedForAll',
          [requestAddress, tronBridgeAddress],
        ),
      ]);
      if (!contextIsCurrent()) {
        return;
      }
      setTronSnapshot({
        price: formatTronBridgePrice(price),
        rawPrice: String(price),
        paused: typeof paused === 'boolean' ? paused : null,
        approved: Boolean(approval),
      });
    } catch (error) {
      if (!contextIsCurrent()) return;
      clearSnapshot();
      setStatus(getErrorMessage(error));
    }
  }, [
    tronAddress,
    tronBridgeAddress,
    tronTokenAddress,
    tronNetworkLabel,
    tronRpcUrl,
    tronWalletRpcOrigin,
  ]);

  useEffect(() => {
    void refreshCandidates();
  }, [refreshCandidates]);

  useEffect(() => {
    void refreshBridgingCukies();
  }, [refreshBridgingCukies]);

  useEffect(() => {
    void refreshTronSnapshot();
  }, [refreshTronSnapshot]);

  function assertCurrentBscContext(expectedOwner: string) {
    const current = getAccount(wagmiConfig);
    assertEvmActionContext({
      expectedAddress: expectedOwner,
      expectedChainId: bscChainId,
      currentAddress: current.address,
      currentChainId: getChainId(wagmiConfig),
    });
  }

  function captureCurrentTronContext() {
    const current = getLegacyTronWeb();
    if (!current) throw new Error('TRON_NOT_READY');
    return captureTronActionContext(current, tronRpcUrl);
  }

  function assertCurrentTronContext(expected: ReturnType<typeof captureCurrentTronContext>) {
    const current = getLegacyTronWeb();
    if (!current) throw new Error('TRON_NOT_READY');
    assertTronActionContext(current, expected);
  }

  function dispatchBridgeRefresh(hash: string, cuki: LegacyMarketplaceCukiItem) {
    window.dispatchEvent(new CustomEvent('cukies:legacy-marketplace:refresh', {
      detail: {
        hash,
        tokenId: cuki.tokenId,
        collectionAddress: cuki.collectionAddress ?? undefined,
      },
    }));
  }

  function beginOperation() {
    operationAbortRef.current?.abort();
    const controller = new AbortController();
    operationAbortRef.current = controller;
    return controller;
  }

  function ownsOperation(controller: AbortController) {
    return mountedRef.current
      && operationAbortRef.current === controller
      && !controller.signal.aborted;
  }

  function retainPendingBridge(
    cuki: LegacyMarketplaceCukiItem,
    sourceOwner: string,
    destinationOwner: string,
    hash: string,
    phase: 'source-pending' | 'in-transit',
  ) {
    setPendingBridge({
      cuki,
      sourceNetwork,
      sourceOwner,
      destinationNetwork,
      destinationOwner,
      destinationCollectionAddress: destinationNetwork === 'BSC' ? bscTokenAddress : tronTokenAddress,
      hash,
      phase,
    });
  }

  async function reconcileBridgeProjection(
    pending: NonNullable<typeof pendingBridge>,
    signal: AbortSignal,
  ) {
    const destination = await fetchBridgeCukies({
      owner: pending.destinationOwner,
      network: pending.destinationNetwork,
      state: 'available',
      // Search by token id so a large destination wallet cannot hide the
      // transferred asset behind the first page of newest results.
      tokenId: pending.cuki.tokenId,
      limit: 5,
    }, signal);
    if (!mountedRef.current || signal.aborted) return false;
    // The source receipt proves custody was handed to the bridge only. The
    // operation is complete after the destination projection has the same
    // token and collection identity for the requested owner.
    return destination.some((item) => sameBridgeAsset(
      item,
      pending.cuki.tokenId,
      pending.destinationCollectionAddress,
    ));
  }

  function bridgeSourceContextMatches(pending: NonNullable<typeof pendingBridge>) {
    const currentSourceOwner = sourceNetwork === 'BSC'
      ? getAccount(wagmiConfig).address
      : getLegacyTronWeb()?.defaultAddress?.base58;
    const currentTronWeb = sourceNetwork === 'TRON' ? getLegacyTronWeb() : null;
    const sourceOwnerMatches = sourceNetwork === 'BSC'
      ? Boolean(currentSourceOwner)
        && currentSourceOwner!.toLowerCase() === pending.sourceOwner.toLowerCase()
      : Boolean(currentTronWeb && currentSourceOwner
        && isSameTronWallet(currentTronWeb, pending.sourceOwner, currentSourceOwner));
    return pending.sourceNetwork === sourceNetwork
      && sourceOwnerMatches
      && (sourceNetwork !== 'TRON' || isLegacyTronWalletOnRpc(currentTronWeb, tronRpcUrl));
  }

  function startBridgeProjectionRefresh(pending: NonNullable<typeof pendingBridge>) {
    bridgeRefreshAbortRef.current?.abort();
    const controller = new AbortController();
    bridgeRefreshAbortRef.current = controller;
    const ownsProjection = () => mountedRef.current
      && bridgeRefreshAbortRef.current === controller
      && !controller.signal.aborted;
    void retryTransactionRefresh(
      async () => {
        try {
          if (!ownsProjection()) return true;
          if (!bridgeSourceContextMatches(pending)) throw new Error('WALLET_CONTEXT_CHANGED');
          const complete = await reconcileBridgeProjection(pending, controller.signal);
          if (!ownsProjection()) return true;
          // The source wallet/RPC may change while the destination read is in
          // flight; validate it again before mutating pending state.
          if (!bridgeSourceContextMatches(pending)) throw new Error('WALLET_CONTEXT_CHANGED');
          if (complete) {
            setPendingBridge((current) => current?.hash === pending.hash ? null : current);
            setSelectedCuki(null);
            setStatus('Bridge completado. El Cukie ya está disponible en la red destino.');
            dispatchBridgeRefresh(pending.hash, pending.cuki);
            return true;
          }
          setPendingBridge((current) => current?.hash === pending.hash
            ? { ...current, phase: 'in-transit' }
            : current);
          setStatus('Bridge confirmado en la red origen. El Cukie sigue en tránsito hacia la red destino; no repitas la operación.');
          return false;
        } catch (reason) {
          if (isTransactionRefreshAborted(reason)) throw reason;
          if (reason instanceof Error && reason.message === 'WALLET_CONTEXT_CHANGED') throw reason;
          return false;
        }
      },
      { signal: controller.signal },
    ).then((complete) => {
      if (!ownsProjection() || complete) return;
      setStatus('Bridge confirmado en la red origen. La entrega en la red destino aún no aparece; puedes comprobarlo más tarde sin firmar otra vez.');
    }).catch((reason) => {
      if (!ownsProjection() || isTransactionRefreshAborted(reason)) return;
      if (reason instanceof Error && reason.message === 'WALLET_CONTEXT_CHANGED') {
        setStatus('El bridge ya fue confirmado, pero la cuenta o la red cambió. Vuelve a conectar la wallet original para seguirlo.');
      }
    }).finally(() => {
      if (bridgeRefreshAbortRef.current === controller) bridgeRefreshAbortRef.current = null;
    });
  }

  const trackingCukies = useMemo(() => {
    if (!pendingBridge || pendingBridge.phase !== 'in-transit') return bridgingCukies;
    if (bridgingCukies.some((item) => sameBridgeAsset(
      item,
      pendingBridge.cuki.tokenId,
      pendingBridge.cuki.collectionAddress,
    ))) return bridgingCukies;
    return [
      { ...pendingBridge.cuki, state: 'inBridge' },
      ...bridgingCukies,
    ];
  }, [bridgingCukies, pendingBridge]);

  function ensureBsc() {
    if (sourceNetwork !== 'BSC') return false;
    const current = getAccount(wagmiConfig);
    const currentChainId = getChainId(wagmiConfig);
    if (current.address && currentChainId === bscChainId) return true;
    void requestWallet({
      kind: 'evm',
      targetChainId: bscChainId,
      reason: `Conecta una wallet EVM en ${bscNetworkLabel} para iniciar el bridge.`,
    }).catch((error) => setStatus(getErrorMessage(error)));
    return false;
  }

  async function ensureTron() {
    if (sourceNetwork !== 'TRON') return false;
    if (!isTronInstalled) {
      setStatus('Instala o activa TronLink para operar bridge en TRON.');
      return false;
    }
    try {
      await requestWallet({
        kind: 'tron',
        targetTronNetwork: 'mainnet',
        reason: `Conecta TronLink en ${tronNetworkLabel} para iniciar el bridge.`,
      });
    } catch (error) {
      setStatus(getErrorMessage(error));
      return false;
    }
    const currentTronWeb = getLegacyTronWeb();
    if (!currentTronWeb) {
      setStatus('TronLink no ha expuesto tronWeb todavia.');
      return false;
    }
    if (!isLegacyTronWalletOnRpc(currentTronWeb, tronRpcUrl)) {
      setStatus(`Cambia TronLink a ${tronNetworkLabel} antes de continuar.`);
      return false;
    }
    return true;
  }

  function getDestinationOwnerForContract() {
    const value = destinationOwner.trim();
    if (!value) throw new Error('Introduce una wallet destino.');

    if (destinationNetwork === 'BSC') {
      if (!isAddress(value))
        throw new Error('La wallet destino BSC no es valida.');
      return value;
    }

    if (!canConvertTronDestination(value)) {
      throw new Error('La wallet destino TRON no es valida.');
    }

    return tronDestinationToSolidityAddress(value);
  }

  async function approveBridge() {
    if (!operationsEnabled || operationLockRef.current || approvalPending || pendingBridge) {
      if (!operationsEnabled) {
      setStatus('El bridge Legacy se encuentra en modo lectura; no se solicitan approvals.');
      }
      return;
    }
    operationLockRef.current = true;
    setOperationBusy(true);
    const operationController = beginOperation();
    let pendingHash: string | null = null;
    let receiptConfirmed = false;
    try {
      if (sourceNetwork === 'BSC') {
        if (!ensureBsc()) return;
        if (!publicClient) throw new Error('TRANSACTION_PENDING');
        const owner = getAccount(wagmiConfig).address;
        if (!owner) throw new Error('WALLET_CONTEXT_CHANGED');
        setStatus('Enviando approval del bridge en BSC...');
        const hash = await writeContractAsync({
          address: bscTokenAddress,
          abi: legacyMarketplaceBscAbis.token,
          functionName: 'setApprovalForAll',
          args: [bscBridgeAddress, true],
          chainId: bscChainId,
        });
        throwIfTransactionRefreshAborted(operationController.signal);
        if (!ownsOperation(operationController)) return;
        assertCurrentBscContext(owner);
        pendingHash = hash;
        setApprovalPending(hash);
        setStatus('Approval enviada. Esperando confirmación en BNB Smart Chain…');
        let confirmed;
        try {
          confirmed = await waitForConfirmedEvmTransaction(publicClient, hash);
        } catch (reason) {
          if (reason instanceof TransactionReplacementPendingError && ownsOperation(operationController)) {
            pendingHash = reason.hash;
            setApprovalPending(reason.hash);
          }
          throw reason;
        }
        throwIfTransactionRefreshAborted(operationController.signal);
        if (!ownsOperation(operationController)) return;
        if (confirmed.receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
        assertCurrentBscContext(owner);
        receiptConfirmed = true;
        setApprovalPending(null);
        setBscApprovalOverride(true);
        setStatus('Approval de bridge confirmada en BNB Smart Chain.');
        return;
      }

      if (!(await ensureTron())) return;
      throwIfTransactionRefreshAborted(operationController.signal);
      const currentTronWeb = getLegacyTronWeb();
      if (!currentTronWeb) throw new Error('TRON_NOT_READY');
      const actionContext = captureCurrentTronContext();
      setStatus('Enviando approval del bridge en TRON...');
      const result = await sendTronContractAt(
        currentTronWeb,
        legacyMarketplaceTronAbis.token,
        tronTokenAddress,
        'setApprovalForAll',
        [tronBridgeAddress, true],
        { feeLimit: 800_000_000, shouldPollResponse: false },
      );
      throwIfTransactionRefreshAborted(operationController.signal);
      if (!ownsOperation(operationController)) return;
      assertCurrentTronContext(actionContext);
      assertTronSendResult(result);
      pendingHash = tronTransactionId(result);
      if (!pendingHash) throw new Error('TRANSACTION_ID_UNAVAILABLE');
      setApprovalPending(pendingHash);
      setStatus('Approval enviada. Esperando confirmación en TRON…');
      await waitForLegacyTronReceipt(pendingHash, { signal: operationController.signal });
      if (!ownsOperation(operationController)) return;
      assertCurrentTronContext(actionContext);
      receiptConfirmed = true;
      setApprovalPending(null);
      setTronSnapshot((current) => ({ ...current, approved: true }));
      setStatus('Approval de bridge confirmada en TRON.');
    } catch (error) {
      if (!ownsOperation(operationController) || isTransactionRefreshAborted(error)) return;
      if (error instanceof Error && error.message === 'WALLET_CONTEXT_CHANGED') return;
      if (error instanceof TransactionReplacementPendingError) {
        setStatus('La wallet actualizó la transacción; sigue pendiente. Puedes comprobarla sin firmar otra vez.');
      } else if (error instanceof TransactionReplacementError || (error instanceof Error && error.message === 'TRANSACTION_REVERTED')) {
        setApprovalPending(null);
        setStatus(getErrorMessage(error));
      } else if (pendingHash && !receiptConfirmed) {
        setApprovalPending(pendingHash);
        setStatus('La aprobación sigue pendiente. No la repitas; vuelve a comprobarla más tarde.');
      } else if (receiptConfirmed) {
        setStatus('La aprobación ya fue confirmada, pero la cuenta o la red cambió. Vuelve a conectar la wallet original.');
      } else {
        setApprovalPending(null);
        setStatus(getErrorMessage(error));
      }
    } finally {
      if (operationAbortRef.current === operationController) {
        operationAbortRef.current = null;
        operationLockRef.current = false;
        if (mountedRef.current) setOperationBusy(false);
      }
    }
  }

  async function checkPendingApproval() {
    const hash = approvalPending;
    if (!hash || operationLockRef.current) return;
    operationLockRef.current = true;
    setOperationBusy(true);
    const operationController = beginOperation();
    let confirmed = false;
    try {
      if (sourceNetwork === 'BSC') {
        if (!publicClient) throw new Error('TRANSACTION_PENDING');
        const owner = getAccount(wagmiConfig).address;
        if (!owner) throw new Error('WALLET_CONTEXT_CHANGED');
        const result = await waitForConfirmedEvmTransaction(
          publicClient,
          hash as `0x${string}`,
        );
        throwIfTransactionRefreshAborted(operationController.signal);
        if (!ownsOperation(operationController)) return;
        if (result.receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
        assertCurrentBscContext(owner);
        confirmed = true;
        setApprovalPending(null);
        setBscApprovalOverride(true);
        setStatus('Approval de bridge confirmada en BNB Smart Chain.');
        return;
      }

      const context = captureCurrentTronContext();
      await waitForLegacyTronReceipt(hash, { signal: operationController.signal });
      if (!ownsOperation(operationController)) return;
      assertCurrentTronContext(context);
      confirmed = true;
      setApprovalPending(null);
      setTronSnapshot((current) => ({ ...current, approved: true }));
      setStatus('Approval de bridge confirmada en TRON.');
    } catch (error) {
      if (!ownsOperation(operationController) || isTransactionRefreshAborted(error)) return;
      if (error instanceof Error && error.message === 'WALLET_CONTEXT_CHANGED') return;
      if (error instanceof TransactionReplacementPendingError) {
        setApprovalPending(error.hash);
        setStatus('La wallet actualizó la transacción; sigue pendiente. Puedes comprobarla sin firmar otra vez.');
      } else if (error instanceof TransactionReplacementError || (error instanceof Error && error.message === 'TRANSACTION_REVERTED')) {
        setApprovalPending(null);
        setStatus(getErrorMessage(error));
      } else if (!confirmed) {
        setStatus('La aprobación sigue pendiente. No la repitas; vuelve a comprobarla más tarde.');
      }
    } finally {
      if (operationAbortRef.current === operationController) {
        operationAbortRef.current = null;
        operationLockRef.current = false;
        if (mountedRef.current) setOperationBusy(false);
      }
    }
  }

  async function checkPendingBridge() {
    const pending = pendingBridge;
    if (!pending || operationLockRef.current) return;
    // Once the source receipt is confirmed the bridge is still in transit.
    // Re-running this read-only projection check lets a delayed relayer or
    // indexer converge after the bounded background window without signing a
    // second bridge transaction.
    if (pending.phase === 'in-transit') {
      setStatus('Comprobando la entrega en la red destino…');
      startBridgeProjectionRefresh(pending);
      return;
    }
    operationLockRef.current = true;
    setOperationBusy(true);
    const operationController = beginOperation();
    let receiptConfirmed = false;
    try {
      let confirmedHash = pending.hash;
      if (pending.sourceNetwork === 'BSC') {
        if (!publicClient) throw new Error('TRANSACTION_PENDING');
        const owner = getAccount(wagmiConfig).address;
        if (!owner) throw new Error('WALLET_CONTEXT_CHANGED');
        const result = await waitForConfirmedEvmTransaction(
          publicClient,
          pending.hash as `0x${string}`,
        );
        throwIfTransactionRefreshAborted(operationController.signal);
        if (!ownsOperation(operationController)) return;
        if (result.receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
        assertCurrentBscContext(owner);
        confirmedHash = result.hash;
      } else {
        const context = captureCurrentTronContext();
        await waitForLegacyTronReceipt(pending.hash, { signal: operationController.signal });
        if (!ownsOperation(operationController)) return;
        assertCurrentTronContext(context);
      }
      receiptConfirmed = true;
      const promoted = { ...pending, hash: confirmedHash, phase: 'in-transit' as const };
      setPendingBridge(promoted);
      setStatus('Bridge confirmado en la red origen. El Cukie está en tránsito; no repitas la operación.');
      dispatchBridgeRefresh(confirmedHash, pending.cuki);
      startBridgeProjectionRefresh(promoted);
    } catch (error) {
      if (!ownsOperation(operationController) || isTransactionRefreshAborted(error)) return;
      if (error instanceof Error && error.message === 'WALLET_CONTEXT_CHANGED') return;
      if (error instanceof TransactionReplacementPendingError) {
        setPendingBridge((current) => current?.hash === pending.hash
          ? { ...current, hash: error.hash }
          : current);
        setStatus('La wallet actualizó la transacción; el bridge sigue pendiente. Puedes comprobarlo sin firmar otra vez.');
      } else if (error instanceof TransactionReplacementError || (error instanceof Error && error.message === 'TRANSACTION_REVERTED')) {
        setPendingBridge(null);
        setStatus(getErrorMessage(error));
      } else if (!receiptConfirmed) {
        setStatus('El bridge sigue pendiente de confirmación. No lo repitas; vuelve a comprobarlo más tarde.');
      }
    } finally {
      if (operationAbortRef.current === operationController) {
        operationAbortRef.current = null;
        operationLockRef.current = false;
        if (mountedRef.current) setOperationBusy(false);
      }
    }
  }

  async function startBridge() {
    const cuki = selectedCuki;
    if (!operationsEnabled) {
      setStatus('El bridge Legacy se encuentra en modo lectura; no se envian transacciones.');
      return;
    }
    if (!cuki || operationLockRef.current || pendingBridge || approvalPending) {
      setStatus('Selecciona un Cukie para enviar al bridge.');
      return;
    }

    if (bridgePaused === null) {
      setStatus('El estado del bridge aún no se ha podido verificar.');
      return;
    }

    if (bridgePaused) {
      setStatus('El bridge esta pausado en la red origen.');
      return;
    }

    let contractDestination: string;
    try {
      contractDestination = getDestinationOwnerForContract();
    } catch (error) {
      setStatus(getErrorMessage(error));
      return;
    }

    const destinationPrefix = getDestinationPrefix(destinationNetwork);
    operationLockRef.current = true;
    setOperationBusy(true);
    const operationController = beginOperation();
    let pendingHash: string | null = null;
    let receiptConfirmed = false;
    let pendingContext: ReturnType<typeof captureCurrentTronContext> | null = null;
    const requestedSourceOwner = sourceOwner;
    if (!requestedSourceOwner) {
      operationLockRef.current = false;
      if (operationAbortRef.current === operationController) operationAbortRef.current = null;
      setOperationBusy(false);
      setStatus('Conecta la wallet origen para continuar.');
      return;
    }
    const destinationOwnerForRead = destinationNetwork === 'TRON'
      ? destinationOwner.trim()
      : contractDestination;
    try {
      if (sourceNetwork === 'BSC') {
        if (!ensureBsc()) return;
        if (!publicClient) throw new Error('TRANSACTION_PENDING');
        const owner = getAccount(wagmiConfig).address;
        if (!owner) throw new Error('WALLET_CONTEXT_CHANGED');
        setStatus('Enviando Cukie al bridge desde BSC...');
        const hash = await writeContractAsync({
          address: bscBridgeAddress,
          abi: cukiesBridgeEndpointAbi,
          functionName: 'requestBridge',
          args: [BigInt(cuki.tokenId), contractDestination as Address, destinationPrefix],
          value: (bscBridgePrice as bigint | undefined) ?? BigInt(0),
          chainId: bscChainId,
        });
        throwIfTransactionRefreshAborted(operationController.signal);
        if (!ownsOperation(operationController)) return;
        assertCurrentBscContext(owner);
        pendingHash = hash;
        retainPendingBridge(cuki, owner, destinationOwnerForRead, hash, 'source-pending');
        setStatus('Bridge enviado. Esperando confirmación en BNB Smart Chain…');
        let confirmed;
        try {
          confirmed = await waitForConfirmedEvmTransaction(publicClient, hash);
        } catch (reason) {
          if (reason instanceof TransactionReplacementPendingError && ownsOperation(operationController)) {
            pendingHash = reason.hash;
            retainPendingBridge(cuki, owner, destinationOwnerForRead, reason.hash, 'source-pending');
          }
          throw reason;
        }
        throwIfTransactionRefreshAborted(operationController.signal);
        if (!ownsOperation(operationController)) return;
        if (confirmed.receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
        assertCurrentBscContext(owner);
        pendingHash = confirmed.hash;
        receiptConfirmed = true;
      } else {
        if (!(await ensureTron())) return;
        throwIfTransactionRefreshAborted(operationController.signal);
        const currentTronWeb = getLegacyTronWeb();
        if (!currentTronWeb) throw new Error('TRON_NOT_READY');
        pendingContext = captureCurrentTronContext();
        setStatus('Enviando Cukie al bridge desde TRON...');
        const result = await sendTronContractAt(
          currentTronWeb,
          cukiesBridgeEndpointAbi,
          tronBridgeAddress,
          'requestBridge',
          [cuki.tokenId, contractDestination, destinationPrefix],
          {
            callValue: Number(tronSnapshot.rawPrice ?? 0),
            feeLimit: 800_000_000,
            shouldPollResponse: false,
          },
        );
        throwIfTransactionRefreshAborted(operationController.signal);
        if (!ownsOperation(operationController)) return;
        assertCurrentTronContext(pendingContext);
        assertTronSendResult(result);
        pendingHash = tronTransactionId(result);
        if (!pendingHash) throw new Error('TRANSACTION_ID_UNAVAILABLE');
        retainPendingBridge(cuki, requestedSourceOwner, destinationOwnerForRead, pendingHash, 'source-pending');
        setStatus('Bridge enviado. Esperando confirmación en TRON…');
        await waitForLegacyTronReceipt(pendingHash, { signal: operationController.signal });
        if (!ownsOperation(operationController)) return;
        assertCurrentTronContext(pendingContext);
        receiptConfirmed = true;
      }

      if (!pendingHash) throw new Error('TRANSACTION_ID_UNAVAILABLE');
      const owner = sourceNetwork === 'BSC'
        ? getAccount(wagmiConfig).address ?? requestedSourceOwner
        : requestedSourceOwner;
      const pending = {
        cuki,
        sourceNetwork,
        sourceOwner: owner,
        destinationNetwork,
        destinationOwner: destinationOwnerForRead,
        destinationCollectionAddress: destinationNetwork === 'BSC' ? bscTokenAddress : tronTokenAddress,
        hash: pendingHash,
        phase: 'in-transit' as const,
      };
      setPendingBridge(pending);
      setSelectedCuki(null);
      setOperationBusy(false);
      setStatus('Bridge confirmado en la red origen. El Cukie está en tránsito; no repitas la operación.');
      dispatchBridgeRefresh(pendingHash, cuki);
      startBridgeProjectionRefresh(pending);
    } catch (error) {
      if (!ownsOperation(operationController) || isTransactionRefreshAborted(error)) return;
      if (error instanceof Error && error.message === 'WALLET_CONTEXT_CHANGED') return;
      if (error instanceof TransactionReplacementPendingError) {
        setStatus('La wallet actualizó la transacción; el bridge sigue pendiente. Puedes comprobarlo sin firmar otra vez.');
      } else if (error instanceof TransactionReplacementError || (error instanceof Error && error.message === 'TRANSACTION_REVERTED')) {
        setPendingBridge(null);
        setStatus(getErrorMessage(error));
      } else if (pendingHash && !receiptConfirmed) {
        retainPendingBridge(cuki, requestedSourceOwner, destinationOwnerForRead, pendingHash, 'source-pending');
        setStatus('El bridge sigue pendiente de confirmación. No lo repitas; vuelve a comprobarlo más tarde.');
      } else if (receiptConfirmed) {
        setStatus('El bridge ya fue confirmado en la red origen, pero la cuenta o la red cambió. Vuelve a conectar la wallet original para seguirlo.');
      } else {
        setPendingBridge(null);
        setStatus(getErrorMessage(error));
      }
    } finally {
      if (operationAbortRef.current === operationController) {
        operationAbortRef.current = null;
        operationLockRef.current = false;
        if (mountedRef.current) setOperationBusy(false);
      }
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <Tabs value={activeTab} onValueChange={selectTab} className="min-w-0">
        <TabsList
          aria-label="Secciones del bridge"
          className="grid h-auto w-full min-w-0 grid-cols-2 gap-1 rounded-[10px] border border-white/10 bg-black/25 p-1"
        >
          <TabsTrigger
            value="prepare"
            className="min-h-11 min-w-0 rounded-[8px] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-400 focus-visible:ring-lilac-300 data-[state=active]:bg-lilac-300/15 data-[state=active]:text-white sm:text-sm"
          >
            Preparar
          </TabsTrigger>
          <TabsTrigger
            value="tracking"
            className="min-h-11 min-w-0 rounded-[8px] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-400 focus-visible:ring-lilac-300 data-[state=active]:bg-lilac-300/15 data-[state=active]:text-white sm:text-sm"
          >
            Seguimiento
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="prepare"
          forceMount
          hidden={activeTab !== 'prepare'}
          className="mt-6 min-w-0 data-[state=inactive]:hidden"
        >
          <div id="bridge-preparar" className="grid min-w-0 gap-6 scroll-mt-24">
            <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 rounded-[8px] border border-white/10 bg-black/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-headline text-2xl font-bold text-white">
                      Migracion TRON a BSC
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Transfiere tus Cukies entre las redes disponibles.
                    </p>
                  </div>
                  <div className="rounded-[8px] border border-lilac-300/30 bg-lilac-300/10 px-4 py-2 text-sm font-semibold text-lilac-100">
                    TRON → BNB Smart Chain
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    ['Origen', sourceNetwork, Network],
                    ['Destino', destinationNetwork, Route],
                    ['Coste del bridge', bridgePrice, ArrowRightLeft],
                    ['Estado', bridgeStatusLabel, ShieldAlert],
                  ].map(([label, value, Icon]) => (
                    <div
                      key={String(label)}
                      className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3"
                    >
                      <Icon className="mb-3 h-4 w-4 text-lilac-200" />
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        {label as string}
                      </p>
                      <p className="mt-1 truncate font-semibold text-white">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="grid min-w-0 gap-3 rounded-[8px] border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <Wallet className="h-5 w-5 text-lilac-200" />
                  <div>
                    <h2 className="font-headline text-xl font-bold text-white">
                      Wallet destino
                    </h2>
                    <p className="text-xs text-slate-400">
                      {sourceNetwork} a {destinationNetwork}
                    </p>
                  </div>
                </div>
                <label className="grid min-w-0 gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Destination owner
                  </span>
                  <input
                    value={destinationOwner}
                    onChange={(event) => setDestinationOwner(event.target.value)}
                    placeholder={
                      destinationNetwork === 'BSC'
                        ? '0x... destination'
                        : 'T... destination'
                    }
                    className="h-11 min-w-0 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-lilac-300/50"
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={() => setDestinationOwner(suggestedDestination)}
                  disabled={!suggestedDestination}
                  className="min-w-0 whitespace-normal border-lilac-300/25 bg-lilac-300/10 text-center text-lilac-100 hover:bg-lilac-300/20"
                >
                  Usar wallet conectada como destino
                </Button>
              </aside>
            </section>

            {readOnly && (
              <div
                role="status"
                className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100"
              >
                Contratos Legacy identificados en sus redes existentes. Esta vista
                permite consultar wallet, estado y movimientos. Las transferencias
                estarán disponibles cuando finalice la revisión.
              </div>
            )}

            {!ready && (
              <div className="rounded-[8px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
                {sourceNetwork === 'BSC' ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>Conecta una wallet EVM y usa {bscNetworkLabel}.</span>
                    {isConnected && chainId !== bscChainId && (
                      <Button onClick={() => void ensureBsc()}>
                        Cambiar a {bscNetworkLabel}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      Conecta TronLink en {tronNetworkLabel} para iniciar el bridge.
                    </span>
                    <Button onClick={() => void ensureTron()}>
                      Conectar TronLink
                    </Button>
                  </div>
                )}
              </div>
            )}

            <section className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 rounded-[8px] border border-white/10 bg-black/30 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-headline text-2xl font-bold text-white">
                      Selecciona un Cukie
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Cukies disponibles en la wallet seleccionada.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={isLoadingCandidates}
                    onClick={() => void refreshCandidates()}
                    className="border-lilac-300/25 bg-lilac-300/10 text-lilac-100 hover:bg-lilac-300/20"
                  >
                    {isLoadingCandidates ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="mr-2 h-4 w-4" />
                    )}
                    Actualizar
                  </Button>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {candidates.length > 0 ? (
                    candidates.map((cuki) => (
                      <BridgeCukiCard
                        key={cuki.tokenId}
                      cuki={cuki}
                      selected={selectedCuki?.tokenId === cuki.tokenId}
                        disabled={!ready || !operationsEnabled || Boolean(pendingBridge)}
                        onSelect={() => setSelectedCuki(cuki)}
                      />
                    ))
                  ) : (
                    <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400 lg:col-span-2">
                      {sourceOwner
                        ? 'No hay Cukies disponibles para bridge en esta wallet/red.'
                        : 'Conecta la wallet origen para cargar candidatos.'}
                    </div>
                  )}
                </div>
              </div>

              <aside className="grid min-w-0 content-start gap-4 rounded-[8px] border border-lilac-300/20 bg-black/35 p-5">
                <div>
                  <h2 className="font-headline text-2xl font-bold text-white">
                    Resumen del bridge
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Revisa destino, coste y confirma el bridge.
                  </p>
                </div>

                <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Cukie seleccionado
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    {selectedCuki
                      ? getCukiDisplayName(selectedCuki)
                      : 'Sin seleccionar'}
                  </p>
                </div>
                <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Destino
                  </p>
                  <p className="mt-1 break-all font-mono text-sm font-semibold text-white">
                    {destinationOwner || '-'}
                  </p>
                </div>
                <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Coste requerido
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-white">
                    {bridgePrice}
                  </p>
                </div>

                {approvalPending && (
                  <div className="grid gap-3 rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                    <p>La aprobación está pendiente. No firmes otra vez mientras comprobamos su resultado.</p>
                    <Button
                      variant="outline"
                      onClick={() => void checkPendingApproval()}
                      disabled={isWriting || isTronLoading || operationBusy}
                      className="border-amber-200/30 bg-amber-200/10 text-amber-50 hover:bg-amber-200/20"
                    >
                      Comprobar aprobación
                    </Button>
                  </div>
                )}

                {pendingBridge && (
                  <div className="grid gap-3 rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                    <p>
                      {pendingBridge.phase === 'source-pending'
                        ? 'El envío está pendiente de confirmación en la red origen. No firmes otra vez.'
                        : 'El bridge está confirmado en la red origen y sigue en tránsito. No repitas la operación.'}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => void checkPendingBridge()}
                      disabled={isWriting || isTronLoading || operationBusy}
                      className="border-amber-200/30 bg-amber-200/10 text-amber-50 hover:bg-amber-200/20"
                    >
                      {pendingBridge.phase === 'source-pending' ? 'Comprobar envío' : 'Comprobar entrega'}
                    </Button>
                  </div>
                )}

                {!approved && (
                  <Button
                    onClick={() => void approveBridge()}
                    disabled={disabled || !ready || !operationsEnabled}
                    variant="outline"
                    className="border-lilac-300/25 bg-lilac-300/10 text-lilac-100 hover:bg-lilac-300/20"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Aprobar bridge
                  </Button>
                )}

                <Button
                  onClick={() => void startBridge()}
                  disabled={
                    disabled ||
                    !ready ||
                    !operationsEnabled ||
                    !selectedCuki ||
                    !approved ||
                    !destinationOwner ||
                    bridgePaused !== false
                  }
                  className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                >
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Iniciar bridge
                </Button>
              </aside>
            </section>
          </div>
        </TabsContent>

        <TabsContent
          value="tracking"
          forceMount
          hidden={activeTab !== 'tracking'}
          className="mt-6 min-w-0 data-[state=inactive]:hidden"
        >
          <section
            id="seguimiento"
            className="min-w-0 rounded-[8px] border border-white/10 bg-black/30 p-5"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-headline text-2xl font-bold text-white">
                  Bridge en curso
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Cukies que ya estan en proceso de bridge.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={isLoadingBridging}
                onClick={() => {
                  void refreshBridgingCukies();
                  if (pendingBridge?.phase === 'in-transit') void checkPendingBridge();
                }}
                className="border-lilac-300/25 bg-lilac-300/10 text-lilac-100 hover:bg-lilac-300/20"
              >
                {isLoadingBridging ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                Actualizar
              </Button>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {trackingCukies.length > 0 ? (
                trackingCukies.map((cuki) => (
                  <BridgeCukiCard key={cuki.tokenId} cuki={cuki} />
                ))
              ) : (
                <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400 lg:col-span-2">
                  No hay movimientos de bridge para las wallets conectadas.
                </div>
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {status && (
        <div className="rounded-[8px] border border-lilac-300/20 bg-lilac-300/10 p-3 text-sm text-lilac-100">
          {status}
        </div>
      )}
    </div>
  );
}
