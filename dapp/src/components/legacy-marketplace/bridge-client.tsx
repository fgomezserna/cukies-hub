'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

import { Button } from '@/components/ui/button';
import { useTronLink } from '@/hooks/use-tronlink';
import { legacyMarketplaceBscAbis } from '@/lib/legacy-marketplace/abis';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import {
  readLegacyTronContract,
  sendLegacyTronContract,
} from '@/lib/legacy-marketplace/tron';
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

type TronBridgeSnapshot = {
  price: string | null;
  rawPrice: string | null;
  paused: boolean | null;
  approved: boolean | null;
};

const bscTokenAddress = legacyMarketplaceContracts.bsc.contracts.token;
const bscBridgeAddress = legacyMarketplaceContracts.bsc.contracts.bridge;
const tronBridgeAddress = legacyMarketplaceContracts.tron.contracts.bridge;

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

  if (!window.tronWeb?.address?.toHex) {
    throw new Error('TronLink es necesario para convertir destino TRON.');
  }

  const hex = String(window.tronWeb.address.toHex(value));
  if (!hex.startsWith('41') || hex.length !== 42) {
    throw new Error('La direccion TRON destino no es valida.');
  }

  return `0x${hex.slice(2)}` as Address;
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
        href={`/marketplace/${cuki.tokenId}`}
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

export function BridgeClient() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContract, isPending: isWriting } = useWriteContract();
  const {
    address: tronAddress,
    connect: connectTron,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
  } = useTronLink();
  const [sourceNetwork, setSourceNetwork] = useState<BridgeNetwork>('TRON');
  const [destinationOwner, setDestinationOwner] = useState('');
  const [candidates, setCandidates] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [bridgingCukies, setBridgingCukies] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [selectedCuki, setSelectedCuki] =
    useState<LegacyMarketplaceCukiItem | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isLoadingBridging, setIsLoadingBridging] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tronSnapshot, setTronSnapshot] = useState<TronBridgeSnapshot>({
    price: null,
    rawPrice: null,
    paused: null,
    approved: null,
  });

  const destinationNetwork = getDestinationNetwork(sourceNetwork);
  const sourceOwner = sourceNetwork === 'BSC' ? address : tronAddress;
  const bscReady = sourceNetwork === 'BSC' && isConnected && chainId === 56;
  const tronReady = sourceNetwork === 'TRON' && isTronConnected;
  const ready = sourceNetwork === 'BSC' ? bscReady : tronReady;
  const disabled = isWriting || isSwitchingChain;

  const { data: bscBridgePrice } = useReadContract({
    address: bscBridgeAddress,
    abi: legacyMarketplaceBscAbis.bridge,
    functionName: 'bridgePrice',
    chainId: 56,
  });
  const { data: bscPaused } = useReadContract({
    address: bscBridgeAddress,
    abi: legacyMarketplaceBscAbis.bridge,
    functionName: 'paused',
    chainId: 56,
  });
  const { data: bscApproved } = useReadContract({
    address: bscTokenAddress,
    abi: legacyMarketplaceBscAbis.token,
    functionName: 'isApprovedForAll',
    args: address ? [address, bscBridgeAddress] : undefined,
    chainId: 56,
    query: {
      enabled: Boolean(address),
    },
  });

  const bridgePrice =
    sourceNetwork === 'BSC'
      ? formatBscBridgePrice(bscBridgePrice as bigint | undefined)
      : (tronSnapshot.price ?? '-');
  const bridgePaused =
    sourceNetwork === 'BSC' ? Boolean(bscPaused) : tronSnapshot.paused === true;
  const approved =
    sourceNetwork === 'BSC' ? Boolean(bscApproved) : tronSnapshot.approved === true;

  const suggestedDestination = useMemo(() => {
    if (sourceNetwork === 'TRON') return address ?? '';
    return tronAddress ?? '';
  }, [address, sourceNetwork, tronAddress]);

  useEffect(() => {
    setSelectedCuki(null);
    setStatus(null);
    setDestinationOwner(suggestedDestination);
  }, [sourceNetwork, suggestedDestination]);

  const refreshCandidates = useCallback(async () => {
    if (!sourceOwner) {
      setCandidates([]);
      return;
    }

    setIsLoadingCandidates(true);
    try {
      const query = new URLSearchParams({
        owner: sourceOwner,
        network: sourceNetwork,
        state: 'available',
        limit: '60',
        sort: 'newest',
      });
      const response = await fetch(
        `/api/legacy-marketplace/cukies?${query}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('No se han podido cargar Cukies.');

      const payload = (await response.json()) as LegacyMarketplaceListResponse;
      setCandidates(payload.items);
    } catch (error) {
      setStatus(getErrorMessage(error));
      setCandidates([]);
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [sourceNetwork, sourceOwner]);

  const refreshBridgingCukies = useCallback(async () => {
    const wallets = [address, tronAddress].filter(
      (wallet): wallet is string => Boolean(wallet),
    );

    if (wallets.length === 0) {
      setBridgingCukies([]);
      return;
    }

    setIsLoadingBridging(true);
    try {
      const responses = await Promise.all(
        wallets.map(async (wallet) => {
          const query = new URLSearchParams({
            owner: wallet,
            state: 'inBridge',
            limit: '30',
            sort: 'newest',
          });
          const response = await fetch(
            `/api/legacy-marketplace/cukies?${query}`,
            { cache: 'no-store' },
          );
          if (!response.ok) return [];

          const payload = (await response.json()) as LegacyMarketplaceListResponse;
          return payload.items;
        }),
      );

      const seen = new Set<string>();
      const items = responses
        .flat()
        .filter((item) => {
          if (seen.has(item.tokenId)) return false;
          seen.add(item.tokenId);
          return true;
        });
      setBridgingCukies(items);
    } catch (error) {
      setStatus(getErrorMessage(error));
      setBridgingCukies([]);
    } finally {
      setIsLoadingBridging(false);
    }
  }, [address, tronAddress]);

  const refreshTronSnapshot = useCallback(async () => {
    if (!tronAddress || !window.tronWeb) {
      setTronSnapshot({
        price: null,
        rawPrice: null,
        paused: null,
        approved: null,
      });
      return;
    }

    try {
      const [price, paused, approval] = await Promise.all([
        readLegacyTronContract<unknown>(
          window.tronWeb,
          'bridge',
          'bridgePrice',
        ),
        readLegacyTronContract<unknown>(window.tronWeb, 'bridge', 'paused'),
        readLegacyTronContract<unknown>(
          window.tronWeb,
          'token',
          'isApprovedForAll',
          [tronAddress, tronBridgeAddress],
        ),
      ]);
      setTronSnapshot({
        price: formatTronBridgePrice(price),
        rawPrice: String(price),
        paused: Boolean(paused),
        approved: Boolean(approval),
      });
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }, [tronAddress]);

  useEffect(() => {
    void refreshCandidates();
  }, [refreshCandidates]);

  useEffect(() => {
    void refreshBridgingCukies();
  }, [refreshBridgingCukies]);

  useEffect(() => {
    void refreshTronSnapshot();
  }, [refreshTronSnapshot]);

  function ensureBsc() {
    if (sourceNetwork !== 'BSC') return false;
    if (!isConnected) {
      setStatus('Conecta una wallet EVM desde el header.');
      return false;
    }
    if (chainId !== 56) {
      switchChain({ chainId: 56 });
      return false;
    }
    return true;
  }

  async function ensureTron() {
    if (sourceNetwork !== 'TRON') return false;
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
    return true;
  }

  function getDestinationOwnerForContract() {
    const value = destinationOwner.trim();
    if (!value) throw new Error('Introduce una wallet destino.');

    if (destinationNetwork === 'BSC') {
      if (!isAddress(value)) throw new Error('La wallet destino BSC no es valida.');
      return value;
    }

    if (!canConvertTronDestination(value)) {
      throw new Error('La wallet destino TRON no es valida.');
    }

    return tronDestinationToSolidityAddress(value);
  }

  async function approveBridge() {
    if (sourceNetwork === 'BSC') {
      if (!ensureBsc()) return;
      setStatus('Enviando approval del bridge en BSC...');
      writeContract({
        address: bscTokenAddress,
        abi: legacyMarketplaceBscAbis.token,
        functionName: 'setApprovalForAll',
        args: [bscBridgeAddress, true],
      });
      return;
    }

    if (!(await ensureTron()) || !window.tronWeb) return;
    setStatus('Enviando approval del bridge en TRON...');
    try {
      await sendLegacyTronContract(
        window.tronWeb,
        'token',
        'setApprovalForAll',
        [tronBridgeAddress, true],
        { feeLimit: 800_000_000, shouldPollResponse: false },
      );
      setTronSnapshot((current) => ({ ...current, approved: true }));
      setStatus('Approval de bridge enviado.');
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function startBridge() {
    if (!selectedCuki) {
      setStatus('Selecciona un Cukie para enviar al bridge.');
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

    if (sourceNetwork === 'BSC') {
      if (!ensureBsc()) return;
      setStatus('Enviando Cukie al bridge desde BSC...');
      writeContract({
        address: bscBridgeAddress,
        abi: legacyMarketplaceBscAbis.bridge,
        functionName: 'jumpInBridge',
        args: [BigInt(selectedCuki.tokenId), contractDestination as Address, destinationPrefix],
        value: (bscBridgePrice as bigint | undefined) ?? BigInt(0),
      });
      return;
    }

    if (!(await ensureTron()) || !window.tronWeb) return;
    setStatus('Enviando Cukie al bridge desde TRON...');
    try {
      await sendLegacyTronContract(
        window.tronWeb,
        'bridge',
        'jumpInBridge',
        [selectedCuki.tokenId, contractDestination, destinationPrefix],
        {
          callValue: Number(tronSnapshot.rawPrice ?? 0),
          feeLimit: 800_000_000,
          shouldPollResponse: false,
        },
      );
      setSelectedCuki(null);
      setStatus('Bridge iniciado. Refresca el monitor en unos segundos.');
      void refreshCandidates();
      void refreshBridgingCukies();
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[8px] border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-headline text-2xl font-bold text-white">
                Source network
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Select where the Cukie currently lives.
              </p>
            </div>
            <div className="inline-flex rounded-[8px] border border-white/10 bg-white/[0.03] p-1">
              {(['TRON', 'BSC'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSourceNetwork(item)}
                  className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                    sourceNetwork === item
                      ? 'bg-cyan-300 text-slate-950'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              ['Source', sourceNetwork, Network],
              ['Destination', destinationNetwork, Route],
              ['Bridge price', bridgePrice, ArrowRightLeft],
              ['Status', bridgePaused ? 'Paused' : 'Open', ShieldAlert],
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
            <Wallet className="h-5 w-5 text-cyan-200" />
            <div>
              <h2 className="font-headline text-xl font-bold text-white">
                Destination wallet
              </h2>
              <p className="text-xs text-slate-400">
                {sourceNetwork} to {destinationNetwork}
              </p>
            </div>
          </div>
          <label className="grid gap-2">
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
              className="h-11 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>
          <Button
            variant="outline"
            onClick={() => setDestinationOwner(suggestedDestination)}
            disabled={!suggestedDestination}
            className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
          >
            Use connected destination
          </Button>
        </aside>
      </section>

      {!ready && (
        <div className="rounded-[8px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          {sourceNetwork === 'BSC' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Conecta una wallet EVM y usa BNB Smart Chain.</span>
              {isConnected && chainId !== 56 && (
                <Button onClick={() => switchChain({ chainId: 56 })}>
                  Switch to BSC
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Conecta TronLink para iniciar bridge desde TRON.</span>
              <Button onClick={() => void ensureTron()}>Connect TronLink</Button>
            </div>
          )}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[8px] border border-white/10 bg-black/30 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-headline text-2xl font-bold text-white">
                Select Cukie
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Cukies disponibles en la wallet seleccionada.
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
              Refresh
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {candidates.length > 0 ? (
              candidates.map((cuki) => (
                <BridgeCukiCard
                  key={cuki.tokenId}
                  cuki={cuki}
                  selected={selectedCuki?.tokenId === cuki.tokenId}
                  disabled={!ready}
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

        <aside className="grid content-start gap-4 rounded-[8px] border border-cyan-300/20 bg-black/35 p-5">
          <div>
            <h2 className="font-headline text-2xl font-bold text-white">
              Bridge desk
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Revisa destino, coste y confirma el bridge.
            </p>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Selected Cukie
            </p>
            <p className="mt-1 font-semibold text-white">
              {selectedCuki ? getCukiDisplayName(selectedCuki) : 'Not selected'}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Destination
            </p>
            <p className="mt-1 break-all font-mono text-sm font-semibold text-white">
              {destinationOwner || '-'}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Required fee
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-white">
              {bridgePrice}
            </p>
          </div>

          {!approved && (
            <Button
              onClick={() => void approveBridge()}
              disabled={disabled || !ready}
              variant="outline"
              className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
            >
              <Check className="mr-2 h-4 w-4" />
              Approve bridge
            </Button>
          )}

          <Button
            onClick={() => void startBridge()}
            disabled={
              disabled ||
              !ready ||
              !selectedCuki ||
              !approved ||
              !destinationOwner ||
              bridgePaused
            }
            className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Start bridge
          </Button>
        </aside>
      </section>

      <section className="rounded-[8px] border border-white/10 bg-black/30 p-5">
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
            onClick={() => void refreshBridgingCukies()}
            className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
          >
            {isLoadingBridging ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {bridgingCukies.length > 0 ? (
            bridgingCukies.map((cuki) => (
              <BridgeCukiCard key={cuki.tokenId} cuki={cuki} />
            ))
          ) : (
            <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400 lg:col-span-2">
              No bridge entries loaded for connected wallets.
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
