'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Check,
  CircleCheck,
  Loader2,
  RefreshCcw,
  Route,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { isAddress, type Address } from 'viem';

import { Button } from '@/components/ui/button';
import { useTronLink } from '@/hooks/use-tronlink';
import {
  legacyMarketplaceTronAbis,
} from '@/lib/legacy-marketplace/abis';
import type { CukiesBridgeRuntimeConfig } from '@/lib/legacy-marketplace/bridge-runtime';
import {
  getLegacyTronTransactionId,
  readTronContractAt,
  sendTronContractAt,
  waitForLegacyTronReceipt,
} from '@/lib/legacy-marketplace/tron';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

import { CukiImage } from './cuki-image';
import {
  getCukiDisplayName,
  getStateLabel,
  getTypeLabel,
} from './format';

type BridgeNetwork = 'BSC' | 'TRON';

type TronBridgeSnapshot = {
  price: string | null;
  rawPrice: string | null;
  paused: boolean | null;
  approved: boolean | null;
};

type BridgeTransferStatus =
  | 'submitted'
  | 'confirmed'
  | 'relaying'
  | 'minted'
  | 'failed'
  | 'manual_review';

type BridgeTransfer = {
  txHash: string;
  tokenId: string;
  destinationOwner: Address;
  status: BridgeTransferStatus;
  destinationTxHash: string | null;
  sourceEventIndex: number | null;
  error: string | null;
  updatedAt: number;
};

type BridgeStatusApiResponse = {
  status?: string;
  destinationTxHash?: string | null;
  sourceEventIndex?: number | null;
  error?: string | null;
};

const BRIDGE_TRANSFER_STORAGE_KEY = 'cukies:legacy-bridge:last-transfer';
const SOURCE_NETWORK: BridgeNetwork = 'TRON';
const DESTINATION_NETWORK: BridgeNetwork = 'BSC';

function emptyTronBridgeSnapshot(): TronBridgeSnapshot {
  return {
    price: null,
    rawPrice: null,
    paused: null,
    approved: null,
  };
}
type BridgeCukiResponse = {
  item?: LegacyMarketplaceCukiItem;
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
};

function enabledBridgeRuntime(
  config: CukiesBridgeRuntimeConfig,
): EnabledBridgeRuntime | null {
  if (
    !config.enabled
    || config.issues.length > 0
    || !config.bsc.chainId
    || !config.bsc.collectionAddress
    || !config.bsc.endpointAddress
    || !config.tron.collectionAddress
    || !config.tron.endpointAddress
    || !config.tron.rpcUrl
  ) {
    return null;
  }

  // The runtime builder only enables testnet for historical safety fixtures;
  // production is pinned to mainnet. Keeping the shape check here prevents a
  // malformed server payload from mounting any wallet or contract hooks.
  const isProductionMainnet = config.mode === 'mainnet'
    && config.appEnv === 'production'
    && config.bsc.chainId === 56
    && config.tron.network === 'mainnet';
  const isLegacyStageFixture = config.mode === 'testnet'
    && config.appEnv === 'staging'
    && config.bsc.chainId === 97
    && config.tron.network === 'nile';

  if (!isProductionMainnet && !isLegacyStageFixture) return null;

  return {
    bscChainId: config.bsc.chainId,
    bscNetworkLabel: config.bsc.networkLabel,
    bscTokenAddress: config.bsc.collectionAddress,
    bscBridgeAddress: config.bsc.endpointAddress,
    tronNetworkLabel: config.tron.networkLabel,
    tronRpcUrl: config.tron.rpcUrl,
    tronTokenAddress: config.tron.collectionAddress,
    tronBridgeAddress: config.tron.endpointAddress,
  };
}

function hasExpectedBridgeIdentity(
  cuki: LegacyMarketplaceCukiItem,
  network: BridgeNetwork,
  runtime: EnabledBridgeRuntime,
) {
  if (
    typeof cuki.id !== 'string'
    || typeof cuki.tokenId !== 'string'
    || typeof cuki.network !== 'string'
    || !/^\d+$/.test(cuki.tokenId)
    || cuki.network.toUpperCase() !== network
  ) {
    return false;
  }

  if (network === 'BSC') {
    const expectedId = [
      runtime.bscChainId,
      runtime.bscTokenAddress.toLowerCase(),
      cuki.tokenId,
    ].join(':');
    return cuki.id.toLowerCase() === expectedId;
  }

  return cuki.id === `TRON:${runtime.tronTokenAddress}:${cuki.tokenId}`;
}

function hasExpectedBridgeOwner(
  cuki: LegacyMarketplaceCukiItem,
  network: BridgeNetwork,
  sourceOwner: string | undefined | null,
) {
  if (!sourceOwner || typeof cuki.owner !== 'string') return false;

  if (network === 'BSC') return false;
  return sourceOwner === cuki.owner;
}

function isExpectedBridgeCuki(
  cuki: LegacyMarketplaceCukiItem,
  network: BridgeNetwork,
  runtime: EnabledBridgeRuntime,
  sourceOwner: string | undefined | null,
  expectedState: 'available' | 'inBridge',
) {
  return cuki.state === expectedState
    && hasExpectedBridgeIdentity(cuki, network, runtime)
    && hasExpectedBridgeOwner(cuki, network, sourceOwner);
}

function addTronBridgeIdentityParams(
  query: URLSearchParams,
  runtime: EnabledBridgeRuntime,
) {
  query.set('network', SOURCE_NETWORK);
  query.set('collectionAddress', runtime.tronTokenAddress);
  return query;
}

function tronWalletRpcOrigin() {
  if (typeof window === 'undefined') return null;
  const configuredHost = window.tronWeb?.fullNode?.host
    ?? window.tronLink?.tronWeb?.fullNode?.host
    ?? window.tron?.tronWeb?.fullNode?.host;
  if (typeof configuredHost !== 'string') return null;

  try {
    return new URL(configuredHost).origin;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido del bridge.';
}

function formatTronBridgePrice(value: unknown) {
  if (value === undefined || value === null) return '-';

  const numeric = Number(String(value));
  if (!Number.isFinite(numeric)) return String(value);

  return `${(numeric / 1_000_000).toLocaleString('es-ES', {
    maximumFractionDigits: 6,
  })} TRX`;
}

function isValidBscDestination(value: string) {
  const normalized = value.trim();
  return isAddress(normalized) && !/^0x0{40}$/i.test(normalized);
}

function readStoredTransfer(): BridgeTransfer | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(BRIDGE_TRANSFER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BridgeTransfer>;
    if (
      typeof parsed.txHash !== 'string'
      || typeof parsed.tokenId !== 'string'
      || typeof parsed.destinationOwner !== 'string'
      || !isValidBscDestination(parsed.destinationOwner)
      || !['submitted', 'confirmed', 'relaying', 'minted', 'failed', 'manual_review']
        .includes(String(parsed.status))
    ) {
      return null;
    }

    return {
      txHash: parsed.txHash,
      tokenId: parsed.tokenId,
      destinationOwner: parsed.destinationOwner as Address,
      status: parsed.status as BridgeTransferStatus,
      destinationTxHash: typeof parsed.destinationTxHash === 'string'
        ? parsed.destinationTxHash
        : null,
      sourceEventIndex: typeof parsed.sourceEventIndex === 'number'
        ? parsed.sourceEventIndex
        : null,
      error: typeof parsed.error === 'string' ? parsed.error : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function persistTransfer(transfer: BridgeTransfer | null) {
  if (typeof window === 'undefined') return;

  try {
    if (transfer) {
      window.localStorage.setItem(
        BRIDGE_TRANSFER_STORAGE_KEY,
        JSON.stringify(transfer),
      );
    } else {
      window.localStorage.removeItem(BRIDGE_TRANSFER_STORAGE_KEY);
    }
  } catch {
    // localStorage is only a convenience for recovery after reload; the live
    // status remains in React state when browser storage is unavailable.
  }
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
      <div className="relative aspect-square overflow-hidden rounded-[8px] bg-[#071211]">
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
          {selected && <Check className="h-4 w-4 shrink-0 text-cyan-100" />}
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
        href={`/marketplace/${encodeURIComponent(cuki.id)}`}
        className="group grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
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
          ? 'border-cyan-300/70 bg-cyan-300/15'
          : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/35 hover:bg-cyan-300/10'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {content}
    </button>
  );
}

function BridgeUnavailable({ config }: { config: CukiesBridgeRuntimeConfig }) {
  const isStageMode = config.mode === 'testnet';
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
            {isStageMode
              ? 'Bridge Testnet desactivado de forma segura'
              : 'Bridge TRON → BSC no disponible'}
          </h2>
          <p className="mt-2 text-sm text-amber-100/90">
            {isStageMode
              ? 'Stage no usara los contratos legacy de mainnet. El bridge se habilitara solo con endpoints de custodia e identidad canonica verificable.'
              : 'La operacion solo se habilita en produccion con los contratos legacy mainnet verificados de TRON y BSC.'}
          </p>
          {config.issues.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
              {config.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function statusLabel(status: BridgeTransferStatus) {
  switch (status) {
    case 'submitted': return 'Enviado en TRON';
    case 'confirmed': return 'TRON confirmado';
    case 'relaying': return 'Relaying hacia BSC';
    case 'minted': return 'Cukie acuñado en BSC';
    case 'failed': return 'Bridge fallido';
    case 'manual_review': return 'Revisión manual';
  }
}

function statusTone(status: BridgeTransferStatus) {
  if (status === 'failed' || status === 'manual_review') {
    return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  }
  if (status === 'minted') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
  return 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100';
}

function mapApiStatus(value: unknown): BridgeTransferStatus | null {
  switch (value) {
    case 'relaying': return 'relaying';
    case 'minted': return 'minted';
    case 'failed': return 'failed';
    case 'manual_review': return 'manual_review';
    default: return null;
  }
}

export function BridgeClient({ config }: { config: CukiesBridgeRuntimeConfig }) {
  const runtime = enabledBridgeRuntime(config);
  if (!runtime) return <BridgeUnavailable config={config} />;

  return <BridgeOperationsClient runtime={runtime} />;
}

function BridgeOperationsClient({ runtime }: { runtime: EnabledBridgeRuntime }) {
  const {
    bscNetworkLabel,
    tronNetworkLabel,
    tronRpcUrl,
    tronTokenAddress,
    tronBridgeAddress,
  } = runtime;
  const {
    address: tronAddress,
    connect: connectTron,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
  } = useTronLink();
  const [destinationOwner, setDestinationOwner] = useState('');
  const [destinationTouched, setDestinationTouched] = useState(false);
  const [candidates, setCandidates] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [bridgingCukies, setBridgingCukies] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [selectedCuki, setSelectedCuki] =
    useState<LegacyMarketplaceCukiItem | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isLoadingBridging, setIsLoadingBridging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [burnAcknowledged, setBurnAcknowledged] = useState(false);
  const [tronSnapshot, setTronSnapshot] = useState<TronBridgeSnapshot>(
    emptyTronBridgeSnapshot,
  );
  const [transfer, setTransfer] = useState<BridgeTransfer | null>(readStoredTransfer);

  const tronRpcOrigin = tronWalletRpcOrigin();
  const tronReady = Boolean(
    isTronConnected
    && tronAddress
    && tronRpcOrigin === tronRpcUrl,
  );
  const bridgePaused = tronSnapshot.paused === true;
  const approved = tronSnapshot.approved === true;
  const bridgeReady = tronSnapshot.paused === false
    && tronSnapshot.rawPrice !== null
    && tronSnapshot.approved === true;
  const destinationError = useMemo(() => {
    if (!destinationOwner.trim()) return 'Introduce una wallet EVM de BSC destino.';
    if (!isValidBscDestination(destinationOwner)) {
      return 'La wallet destino BSC no es valida.';
    }
    return null;
  }, [destinationOwner]);

  useEffect(() => {
    persistTransfer(transfer);
  }, [transfer]);

  useEffect(() => {
    setSelectedCuki(null);
    setBurnAcknowledged(false);
    setStatus(null);
  }, [tronAddress]);

  const refreshCandidates = useCallback(async () => {
    if (!tronAddress) {
      setCandidates([]);
      return;
    }

    setIsLoadingCandidates(true);
    try {
      const query = addTronBridgeIdentityParams(new URLSearchParams({
        owner: tronAddress,
        state: 'available',
        limit: '60',
        sort: 'newest',
      }), runtime);
      const response = await fetch(
        `/api/cukies?${query.toString()}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('No se han podido cargar Cukies TRON.');

      const payload = await response.json() as { items?: LegacyMarketplaceCukiItem[] };
      const compatibleItems = (payload.items ?? []).filter((item) =>
        isExpectedBridgeCuki(
          item,
          SOURCE_NETWORK,
          runtime,
          tronAddress,
          'available',
        ),
      );
      setCandidates(compatibleItems);
      setSelectedCuki((current) =>
        current && compatibleItems.some((item) => item.id === current.id)
          ? current
          : null,
      );
    } catch (error) {
      setStatus(getErrorMessage(error));
      setCandidates([]);
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [runtime, tronAddress]);

  const refreshBridgingCukies = useCallback(async () => {
    if (!tronAddress) {
      setBridgingCukies([]);
      return;
    }

    setIsLoadingBridging(true);
    try {
      const query = addTronBridgeIdentityParams(new URLSearchParams({
        owner: tronAddress,
        state: 'inBridge',
        limit: '30',
        sort: 'newest',
      }), runtime);
      const response = await fetch(
        `/api/cukies?${query.toString()}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('No se han podido cargar bridges en curso.');

      const payload = await response.json() as { items?: LegacyMarketplaceCukiItem[] };
      setBridgingCukies((payload.items ?? []).filter((item) =>
        isExpectedBridgeCuki(
          item,
          SOURCE_NETWORK,
          runtime,
          tronAddress,
          'inBridge',
        ),
      ));
    } catch (error) {
      setStatus(getErrorMessage(error));
      setBridgingCukies([]);
    } finally {
      setIsLoadingBridging(false);
    }
  }, [runtime, tronAddress]);

  const refreshTronSnapshot = useCallback(async () => {
    if (
      !tronAddress
      || !window.tronWeb
      || tronRpcOrigin !== tronRpcUrl
    ) {
      setTronSnapshot(emptyTronBridgeSnapshot());
      return;
    }

    try {
      const [price, paused, approval] = await Promise.all([
        readTronContractAt<unknown>(
          window.tronWeb,
          legacyMarketplaceTronAbis.bridge,
          tronBridgeAddress,
          'bridgePrice',
        ),
        readTronContractAt<unknown>(
          window.tronWeb,
          legacyMarketplaceTronAbis.bridge,
          tronBridgeAddress,
          'paused',
        ),
        readTronContractAt<unknown>(
          window.tronWeb,
          legacyMarketplaceTronAbis.token,
          tronTokenAddress,
          'isApprovedForAll',
          [tronAddress, tronBridgeAddress],
        ),
      ]);
      if (tronWalletRpcOrigin() !== tronRpcUrl) {
        setTronSnapshot(emptyTronBridgeSnapshot());
        return;
      }

      setTronSnapshot({
        price: formatTronBridgePrice(price),
        rawPrice: String(price),
        paused: Boolean(paused),
        approved: Boolean(approval),
      });
    } catch (error) {
      setTronSnapshot(emptyTronBridgeSnapshot());
      setStatus(getErrorMessage(error));
    }
  }, [tronAddress, tronBridgeAddress, tronRpcOrigin, tronRpcUrl, tronTokenAddress]);

  useEffect(() => {
    void refreshCandidates();
  }, [refreshCandidates]);

  useEffect(() => {
    void refreshBridgingCukies();
  }, [refreshBridgingCukies]);

  useEffect(() => {
    void refreshTronSnapshot();
  }, [refreshTronSnapshot]);

  async function ensureTron() {
    if (!isTronInstalled) {
      setStatus('Instala o activa TronLink para operar bridge en TRON.');
      return false;
    }
    if (!isTronConnected) {
      await connectTron();
      return false;
    }
    if (!window.tronWeb) {
      setStatus('TronLink no ha expuesto tronWeb todavia.');
      return false;
    }
    if (tronWalletRpcOrigin() !== tronRpcUrl) {
      setStatus(`Cambia TronLink a ${tronNetworkLabel} antes de continuar.`);
      return false;
    }
    return true;
  }

  async function revalidateSelectedCukiForWrite() {
    const candidate = selectedCuki;
    if (
      !tronReady
      || !candidate
      || !isExpectedBridgeCuki(
        candidate,
        SOURCE_NETWORK,
        runtime,
        tronAddress,
        'available',
      )
    ) {
      setSelectedCuki(null);
      setStatus(
        'El Cukie ya no coincide con la identidad, owner o estado disponible de la wallet origen.',
      );
      return null;
    }

    try {
      const response = await fetch(
        `/api/cukies/${encodeURIComponent(candidate.id)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error('No se ha podido revalidar el Cukie antes de operar.');
      }

      const payload = await response.json() as BridgeCukiResponse;
      const current = payload.item;
      if (
        !current
        || current.id !== candidate.id
        || !isExpectedBridgeCuki(
          current,
          SOURCE_NETWORK,
          runtime,
          tronAddress,
          'available',
        )
      ) {
        throw new Error(
          'El Cukie ya no coincide con la identidad, owner o estado disponible de la wallet origen.',
        );
      }

      setSelectedCuki(current);
      return current;
    } catch (error) {
      setSelectedCuki(null);
      setStatus(getErrorMessage(error));
      return null;
    }
  }

  async function waitForSubmittedTransfer(current: BridgeTransfer) {
    if (!window.tronWeb) return;

    try {
      await waitForLegacyTronReceipt(window.tronWeb, current.txHash);
      setTransfer((previous) => previous && previous.txHash === current.txHash
        ? { ...previous, status: 'confirmed', updatedAt: Date.now(), error: null }
        : previous);
      setStatus(
        'Transaccion TRON confirmada. El relayer esta procesando el mint en BSC.',
      );
      void refreshCandidates();
      void refreshBridgingCukies();
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.startsWith('No se pudo confirmar')) {
        setStatus(`${message} Conserva este hash y vuelve a consultar.`);
        return;
      }
      setTransfer((previous) => previous && previous.txHash === current.txHash
        ? { ...previous, status: 'failed', updatedAt: Date.now(), error: message }
        : previous);
      setStatus(`La transaccion TRON fallo: ${message}`);
    }
  }

  async function approveBridge() {
    const currentCuki = await revalidateSelectedCukiForWrite();
    if (!currentCuki || !(await ensureTron()) || !window.tronWeb) return;

    setIsSubmitting(true);
    setStatus('Enviando approval del bridge en TRON...');
    try {
      const rawTransaction = await sendTronContractAt(
        window.tronWeb,
        legacyMarketplaceTronAbis.token,
        tronTokenAddress,
        'setApprovalForAll',
        [tronBridgeAddress, true],
        { feeLimit: 800_000_000, shouldPollResponse: false },
      );
      const transactionId = getLegacyTronTransactionId(rawTransaction);
      if (!transactionId) throw new Error('TRON no devolvio un hash de approval.');
      setStatus('Approval TRON enviado. Esperando receipt confirmado...');
      await waitForLegacyTronReceipt(window.tronWeb, transactionId);
      setTronSnapshot((current) => ({ ...current, approved: true }));
      setStatus('Approval del bridge confirmado en TRON.');
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startBridge() {
    const currentCuki = await revalidateSelectedCukiForWrite();
    if (!currentCuki) return;

    if (!isValidBscDestination(destinationOwner)) {
      setDestinationTouched(true);
      setStatus(destinationError ?? 'La wallet destino BSC no es valida.');
      return;
    }
    if (!burnAcknowledged) {
      setStatus('Confirma que entiendes que el burn/custodia en TRON es irreversible.');
      return;
    }
    if (bridgePaused) {
      setStatus('El bridge esta pausado en TRON.');
      return;
    }
    if (tronSnapshot.paused !== false || tronSnapshot.rawPrice === null) {
      setStatus('No se ha podido confirmar el precio o estado del bridge TRON. Refresca antes de firmar.');
      return;
    }
    if (!(await ensureTron()) || !window.tronWeb) return;

    setIsSubmitting(true);
    setStatus('Enviando Cukie al bridge legacy desde TRON...');
    try {
      // This is the deployed legacy ABI/method. Do not replace it with the
      // newer BridgeEndpoint `requestBridge` interface.
      const rawTransaction = await sendTronContractAt(
        window.tronWeb,
        legacyMarketplaceTronAbis.bridge,
        tronBridgeAddress,
        'jumpInBridge',
        [currentCuki.tokenId, destinationOwner.trim(), 1],
        {
          callValue: Number(tronSnapshot.rawPrice ?? 0),
          feeLimit: 800_000_000,
          shouldPollResponse: false,
        },
      );
      const transactionId = getLegacyTronTransactionId(rawTransaction);
      if (!transactionId) throw new Error('TRON no devolvio un hash de transaccion.');

      const submitted: BridgeTransfer = {
        txHash: transactionId,
        tokenId: currentCuki.tokenId,
        destinationOwner: destinationOwner.trim() as Address,
        status: 'submitted',
        destinationTxHash: null,
        sourceEventIndex: null,
        error: null,
        updatedAt: Date.now(),
      };
      setTransfer(submitted);
      setStatus(`TRON submitted: ${transactionId}. Esperando receipt confirmado...`);
      await waitForSubmittedTransfer(submitted);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const refreshRelayerStatus = useCallback(async (current: BridgeTransfer) => {
    const query = new URLSearchParams({ sourceTxHash: current.txHash });
    if (current.sourceEventIndex !== null) {
      query.set('sourceEventIndex', String(current.sourceEventIndex));
    }

    try {
      const response = await fetch(
        `/api/legacy-marketplace/bridge-status?${query.toString()}`,
        { cache: 'no-store' },
      );
      if (!response.ok) return;
      const payload = await response.json() as BridgeStatusApiResponse;
      const nextStatus = mapApiStatus(payload.status);
      if (!nextStatus) return;

      setTransfer((previous) => {
        if (!previous || previous.txHash !== current.txHash) return previous;
        return {
          ...previous,
          status: nextStatus,
          destinationTxHash: typeof payload.destinationTxHash === 'string'
            ? payload.destinationTxHash
            : previous.destinationTxHash,
          sourceEventIndex: typeof payload.sourceEventIndex === 'number'
            ? payload.sourceEventIndex
            : previous.sourceEventIndex,
          error: typeof payload.error === 'string' ? payload.error : null,
          updatedAt: Date.now(),
        };
      });

      if (nextStatus === 'minted') {
        setSelectedCuki(null);
        setBurnAcknowledged(false);
        setStatus('Bridge completado: Cukie acuñado en BSC tras el receipt del relayer.');
        void refreshCandidates();
        void refreshBridgingCukies();
      } else if (nextStatus === 'manual_review') {
        setStatus('El bridge requiere revisión manual. Conserva ambos hashes y no reintentes.');
      } else if (nextStatus === 'failed') {
        setStatus(payload.error ?? 'El relayer marco el bridge como fallido.');
      } else {
        setStatus('TRON confirmado. El relayer esta procesando el mint en BSC.');
      }
    } catch {
      // Keep the last confirmed/relaying state visible and retry on the next
      // interval; an unavailable read is not evidence of a failed bridge.
    }
  }, [refreshCandidates, refreshBridgingCukies]);

  useEffect(() => {
    if (
      !transfer
      || transfer.status === 'minted'
      || transfer.status === 'failed'
      || transfer.status === 'manual_review'
      || transfer.status === 'submitted'
    ) {
      return undefined;
    }

    let cancelled = false;
    const poll = async () => {
      if (!cancelled) await refreshRelayerStatus(transfer);
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshRelayerStatus, transfer]);

  const bridgePrice = tronSnapshot.price ?? '-';
  const disabled = isSubmitting;

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[8px] border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-headline text-2xl font-bold text-white">
                Migracion TRON a BSC
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Flujo de produccion unidireccional con contratos legacy mainnet.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-[8px] border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100">
              <Wallet className="h-4 w-4" />
              TRON Mainnet → BSC Mainnet
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              ['Origen', SOURCE_NETWORK, Wallet],
              ['Destino', DESTINATION_NETWORK, Route],
              ['Bridge price', bridgePrice, ArrowRightLeft],
              ['Estado', bridgePaused ? 'Pausado' : 'Abierto', ShieldAlert],
            ].map(([label, value, Icon]) => (
              <div
                key={String(label)}
                className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3"
              >
                <Icon className="mb-3 h-4 w-4 text-cyan-200" />
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

        <aside className="grid gap-3 rounded-[8px] border border-white/10 bg-black/30 p-4">
          <div className="flex items-center gap-3">
            <ArrowRight className="h-5 w-5 text-cyan-200" />
            <div>
              <h2 className="font-headline text-xl font-bold text-white">
                Wallet destino BSC
              </h2>
              <p className="text-xs text-slate-400">
                Se valida antes de firmar en TronLink.
              </p>
            </div>
          </div>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dirección EVM destino
            </span>
            <input
              value={destinationOwner}
              onChange={(event) => {
                setDestinationOwner(event.target.value);
                setDestinationTouched(true);
              }}
              onBlur={() => setDestinationTouched(true)}
              placeholder="0x... wallet BSC"
              aria-invalid={destinationTouched && Boolean(destinationError)}
              className="h-11 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>
          {destinationTouched && destinationError && (
            <p role="alert" className="text-xs text-amber-200">{destinationError}</p>
          )}
          <p className="text-xs leading-5 text-slate-400">
            Solo se admite una address EVM BSC válida; una address TRON no se
            puede usar como destino de este flujo.
          </p>
        </aside>
      </section>

      {!tronReady && (
        <div className="rounded-[8px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Conecta TronLink en {tronNetworkLabel} para iniciar el bridge.</span>
            <Button onClick={() => void ensureTron()}>Conectar TronLink</Button>
          </div>
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[8px] border border-white/10 bg-black/30 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-headline text-2xl font-bold text-white">
                Selecciona tu Cukie TRON
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Solo aparecen NFTs disponibles y custodiados por la wallet TRON conectada.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={isLoadingCandidates}
              onClick={() => void refreshCandidates()}
              className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
            >
              {isLoadingCandidates ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refrescar
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {candidates.length > 0 ? (
              candidates.map((cuki) => (
                <BridgeCukiCard
                  key={cuki.id}
                  cuki={cuki}
                  selected={selectedCuki?.id === cuki.id}
                  disabled={!tronReady || disabled}
                  onSelect={() => setSelectedCuki(cuki)}
                />
              ))
            ) : (
              <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400 lg:col-span-2">
                {tronAddress
                  ? 'No hay Cukies disponibles para bridge en esta wallet TRON.'
                  : 'Conecta la wallet TRON origen para cargar candidatos.'}
              </div>
            )}
          </div>
        </div>

        <aside className="grid content-start gap-4 rounded-[8px] border border-cyan-300/20 bg-black/35 p-5">
          <div>
            <h2 className="font-headline text-2xl font-bold text-white">
              Bridge desk
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Revisa destino, coste y el aviso irreversible antes de firmar.
            </p>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Cukie seleccionado
            </p>
            <p className="mt-1 font-semibold text-white">
              {selectedCuki ? getCukiDisplayName(selectedCuki) : 'Ninguno'}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Wallet BSC destino
            </p>
            <p className="mt-1 break-all font-mono text-sm font-semibold text-white">
              {destinationOwner || '-'}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Tarifa TRON
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-white">
              {bridgePrice}
            </p>
          </div>

          <div
            role="alert"
            data-testid="bridge-irreversible-warning"
            className="rounded-[8px] border border-amber-300/35 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
              <span>
                Irreversible: el NFT se quema o queda en custodia del bridge en TRON.
                No cierres TronLink ni vuelvas a enviar la operación mientras se
                confirma y se relaya a BSC.
              </span>
            </div>
            <label className="mt-3 flex items-start gap-2 font-semibold text-amber-50">
              <input
                type="checkbox"
                checked={burnAcknowledged}
                onChange={(event) => setBurnAcknowledged(event.target.checked)}
                className="mt-1 accent-amber-300"
              />
              Entiendo que el burn/custodia es irreversible.
            </label>
          </div>

          {!approved && (
            <Button
              onClick={() => void approveBridge()}
              disabled={disabled || !tronReady || !selectedCuki}
              variant="outline"
              className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
            >
              <Check className="mr-2 h-4 w-4" />
              Aprobar bridge en TRON
            </Button>
          )}

          <Button
            onClick={() => void startBridge()}
            disabled={
              disabled
              || !tronReady
              || !selectedCuki
              || !approved
              || !bridgeReady
              || Boolean(destinationError)
              || !burnAcknowledged
              || bridgePaused
            }
            className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Iniciar TRON → BSC
          </Button>
        </aside>
      </section>

      {transfer && (
        <section
          aria-live="polite"
          data-testid="bridge-transfer-status"
          className={`rounded-[8px] border p-5 ${statusTone(transfer.status)}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-headline text-xl font-bold">
                {transfer.status === 'minted' ? <CircleCheck className="h-5 w-5" /> : <Loader2 className="h-5 w-5" />}
                {statusLabel(transfer.status)}
              </div>
              <p className="mt-2 break-all font-mono text-xs">
                TRON tx: {transfer.txHash}
              </p>
              {transfer.destinationTxHash && (
                <p className="mt-1 break-all font-mono text-xs">
                  BSC tx: {transfer.destinationTxHash}
                </p>
              )}
              {transfer.error && (
                <p className="mt-2 text-xs">{transfer.error}</p>
              )}
            </div>
            {transfer.status === 'submitted' && (
              <Button
                variant="outline"
                disabled={disabled || !tronReady}
                onClick={() => void waitForSubmittedTransfer(transfer)}
                className="border-cyan-300/30 text-cyan-50"
              >
                Consultar receipt TRON
              </Button>
            )}
          </div>
          {transfer.status === 'confirmed' && (
            <p className="mt-3 text-xs">
              El job todavía puede estar pendiente: se consulta sin cache cada 5 segundos.
            </p>
          )}
        </section>
      )}

      <section className="rounded-[8px] border border-white/10 bg-black/30 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-headline text-2xl font-bold text-white">
              Bridges en curso
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Estado indexado de NFTs TRON que siguen en custodia del bridge.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={isLoadingBridging}
            onClick={() => void refreshBridgingCukies()}
            className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
          >
            {isLoadingBridging ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Refrescar
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {bridgingCukies.length > 0 ? (
            bridgingCukies.map((cuki) => (
              <BridgeCukiCard key={cuki.id} cuki={cuki} />
            ))
          ) : (
            <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400 lg:col-span-2">
              No hay entradas de bridge para la wallet TRON conectada.
            </div>
          )}
        </div>
      </section>

      {status && (
        <div className="rounded-[8px] border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
          {status}
        </div>
      )}
    </div>
  );
}
