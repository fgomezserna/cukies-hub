'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Baby,
  Check,
  Dna,
  Heart,
  Loader2,
  type LucideIcon,
  Network,
  RefreshCcw,
  Sparkles,
  Wallet,
} from 'lucide-react';
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

import { Button } from '@/components/ui/button';
import { legacyMarketplaceBscAbis } from '@/lib/legacy-marketplace/abis';
import {
  legacyBscPublicClient,
  readLegacyBscContract,
} from '@/lib/legacy-marketplace/bsc';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import {
  readLegacyTronContract,
  sendLegacyTronContract,
} from '@/lib/legacy-marketplace/tron';
import type {
  LegacyBreedingCandidatesResponse,
  LegacyCompletedBreedsResponse,
  LegacyMarketplaceCukiItem,
} from '@/lib/legacy-marketplace/types';
import { useTronLink } from '@/hooks/use-tronlink';

import { CukiImage } from './cuki-image';
import {
  formatLegacyDate,
  getCukiDisplayName,
  getTypeLabel,
  shortWallet,
} from './format';

type BreedingNetwork = 'BSC' | 'TRON';
export type BreedingTab = 'start' | 'active' | 'completed';

type OnChainBreed = {
  id: string;
  parents: [string, string];
  breedStart: number;
  breedFinish: number;
  completed: boolean;
  result: string;
  birthNetwork: BreedingNetwork;
};

const bscTokenAddress = legacyMarketplaceContracts.bsc.contracts.token;
const bscPointsAddress = legacyMarketplaceContracts.bsc.contracts.points;
const bscBreedingAddress = legacyMarketplaceContracts.bsc.contracts.breedingPoints;
const tronBreedingAddress =
  legacyMarketplaceContracts.tron.contracts.breedingPoints;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown breeding error';
}

function sameToken(
  left?: LegacyMarketplaceCukiItem | null,
  right?: LegacyMarketplaceCukiItem | null,
) {
  return Boolean(left && right && left.tokenId === right.tokenId);
}

function formatPoints(value?: bigint | number | string | null) {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'bigint') return value.toLocaleString('en-US');

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : String(value);
}

function normalizeBreedTuple(
  id: unknown,
  value: unknown,
  network: BreedingNetwork,
): OnChainBreed | null {
  const tuple = value as readonly unknown[];
  const parent1 = tuple[0];
  const parent2 = tuple[1];

  if (parent1 === undefined || parent2 === undefined) return null;

  const start = Number(tuple[2] ?? 0);
  const finish = Number(tuple[3] ?? 0);

  return {
    id: String(id),
    parents: [String(parent1), String(parent2)],
    breedStart: start < 10_000_000_000 ? start * 1000 : start,
    breedFinish: finish < 10_000_000_000 ? finish * 1000 : finish,
    completed: Boolean(tuple[5]),
    result: String(tuple[6] ?? '0'),
    birthNetwork: network,
  };
}

function getBreedProgress(breed: OnChainBreed) {
  const duration = breed.breedFinish - breed.breedStart;
  if (duration <= 0) return 0;

  return Math.min(
    Math.max(((Date.now() - breed.breedStart) / duration) * 100, 0),
    100,
  );
}

function CandidateCard({
  cuki,
  selected,
  disabled,
  onSelect,
}: {
  cuki: LegacyMarketplaceCukiItem;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`group grid min-w-0 grid-cols-[84px_minmax(0,1fr)] gap-3 rounded-[8px] border p-3 text-left transition ${
        selected
          ? 'border-cyan-300/70 bg-cyan-300/15'
          : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/35 hover:bg-cyan-300/10'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-[8px] bg-[#071211]">
        <CukiImage
          src={cuki.imageUrl}
          alt={getCukiDisplayName(cuki)}
          sizes="84px"
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
          {getTypeLabel(cuki.type)} · {cuki.network}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 text-slate-300">
            Breed {cuki.skills.breeder ?? 0}
          </span>
          <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 text-slate-300">
            Life {cuki.skills.life ?? 0}
          </span>
          <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 text-slate-300">
            Kids {cuki.childrenCount ?? 0}
          </span>
        </div>
      </div>
    </button>
  );
}

function BreedCard({
  breed,
  onOpen,
  disabled,
}: {
  breed: OnChainBreed;
  onOpen?: (breed: OnChainBreed) => void;
  disabled?: boolean;
}) {
  const progress = getBreedProgress(breed);
  const canOpen = progress >= 100 && !breed.completed;

  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-headline text-xl font-bold text-white">
            Breed #{breed.id}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {breed.birthNetwork} · parents #{breed.parents[0]} and #
            {breed.parents[1]}
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
          {breed.completed ? 'Completed' : canOpen ? 'Ready' : 'Active'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Start</p>
          <p className="mt-1 font-semibold text-white">
            {formatLegacyDate(breed.breedStart)}
          </p>
        </div>
        <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Finish</p>
          <p className="mt-1 font-semibold text-white">
            {formatLegacyDate(breed.breedFinish)}
          </p>
        </div>
      </div>

      {!breed.completed && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {Math.round(progress)}% breeding progress
            </p>
            {canOpen && onOpen && (
              <Button
                onClick={() => onOpen(breed)}
                disabled={disabled}
                className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
              >
                <Baby className="mr-2 h-4 w-4" />
                Open Cukie
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CompletedCukiCard({ cuki }: { cuki: LegacyMarketplaceCukiItem }) {
  return (
    <Link
      href={`/marketplace/${cuki.tokenId}`}
      className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-[8px] border border-white/10 bg-white/[0.03] p-3 transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
    >
      <div className="relative aspect-square overflow-hidden rounded-[8px] bg-[#071211]">
        <CukiImage src={cuki.imageUrl} alt={getCukiDisplayName(cuki)} sizes="96px" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-headline text-lg font-bold text-white">
          {getCukiDisplayName(cuki)}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {cuki.birthNetwork ?? cuki.network} · Gen {cuki.skills.generation ?? '-'}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Parents {cuki.parents.map((parent) => `#${parent.tokenId}`).join(' · ') || '-'}
        </p>
      </div>
    </Link>
  );
}

export function BreedingClient({
  initialTab = 'start',
}: {
  initialTab?: BreedingTab;
}) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContract, isPending: isWriting } = useWriteContract();
  const {
    address: tronAddress,
    connect: connectTron,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
  } = useTronLink();
  const [network, setNetwork] = useState<BreedingNetwork>('BSC');
  const [tab, setTab] = useState<BreedingTab>(initialTab);
  const [candidates, setCandidates] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [completedCukies, setCompletedCukies] = useState<LegacyMarketplaceCukiItem[]>([]);
  const [activeBreeds, setActiveBreeds] = useState<OnChainBreed[]>([]);
  const [parent1, setParent1] = useState<LegacyMarketplaceCukiItem | null>(null);
  const [parent2, setParent2] = useState<LegacyMarketplaceCukiItem | null>(null);
  const [tronMaxBreeds, setTronMaxBreeds] = useState<number | null>(null);
  const [tronPoints, setTronPoints] = useState<string | null>(null);
  const [tronCost, setTronCost] = useState<string | null>(null);
  const [tronApproved, setTronApproved] = useState<boolean | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isLoadingBreeds, setIsLoadingBreeds] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const owner = network === 'BSC' ? address : tronAddress;
  const bscReady = network === 'BSC' && isConnected && chainId === 56;
  const tronReady = network === 'TRON' && isTronConnected;
  const ready = network === 'BSC' ? bscReady : tronReady;
  const parentsSelected = Boolean(
    parent1 && parent2 && !sameToken(parent1, parent2),
  );

  const { data: bscMaxBreeds } = useReadContract({
    address: bscBreedingAddress,
    abi: legacyMarketplaceBscAbis.breedingPoints,
    functionName: 'getMaxBreedsByCukie',
    query: {
      enabled: network === 'BSC',
    },
  });
  const { data: bscPoints } = useReadContract({
    address: bscPointsAddress,
    abi: legacyMarketplaceBscAbis.points,
    functionName: 'getPoints',
    args: address ? [address] : undefined,
    query: {
      enabled: network === 'BSC' && Boolean(address),
    },
  });
  const { data: bscApproved } = useReadContract({
    address: bscTokenAddress,
    abi: legacyMarketplaceBscAbis.token,
    functionName: 'isApprovedForAll',
    args: address ? [address, bscBreedingAddress] : undefined,
    query: {
      enabled: network === 'BSC' && Boolean(address),
    },
  });
  const { data: bscCost } = useReadContract({
    address: bscBreedingAddress,
    abi: legacyMarketplaceBscAbis.breedingPoints,
    functionName: 'getCostPoints',
    args:
      parent1 && parent2 && !sameToken(parent1, parent2)
        ? [BigInt(parent1.tokenId), BigInt(parent2.tokenId)]
        : undefined,
    query: {
      enabled: network === 'BSC' && Boolean(parent1 && parent2),
    },
  });

  const maxBreeds = useMemo(() => {
    if (network === 'BSC' && bscMaxBreeds !== undefined) {
      return Number(bscMaxBreeds);
    }

    return tronMaxBreeds;
  }, [bscMaxBreeds, network, tronMaxBreeds]);

  const cost =
    network === 'BSC'
      ? formatPoints(bscCost as bigint | undefined)
      : (tronCost ?? '-');
  const points =
    network === 'BSC' ? formatPoints(bscPoints as bigint | undefined) : (tronPoints ?? '-');
  const approved = network === 'BSC' ? Boolean(bscApproved) : tronApproved === true;
  const summaryCards: Array<{
    label: string;
    value: string | number;
    Icon: LucideIcon;
  }> = [
    {
      label: 'Wallet',
      value: owner ? shortWallet(owner) : 'Not connected',
      Icon: Wallet,
    },
    { label: 'Network', value: network, Icon: Network },
    { label: 'Points', value: points, Icon: Sparkles },
    { label: 'Max breeds', value: maxBreeds ?? '-', Icon: Dna },
  ];

  const refreshCandidates = useCallback(async () => {
    if (!owner || maxBreeds === null) {
      setCandidates([]);
      return;
    }

    setIsLoadingCandidates(true);
    try {
      const query = new URLSearchParams({
        owner,
        network,
        maxBreeds: String(maxBreeds),
        limit: '60',
      });
      const response = await fetch(
        `/api/cukies/breeding/candidates?${query}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error('No se han podido cargar candidatos de breeding.');
      }
      const payload = (await response.json()) as LegacyBreedingCandidatesResponse;
      setCandidates(payload.items);
    } catch (error) {
      setStatus(getErrorMessage(error));
      setCandidates([]);
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [maxBreeds, network, owner]);

  const refreshCompleted = useCallback(async () => {
    const wallets = [address, tronAddress].filter(
      (wallet): wallet is string => Boolean(wallet),
    );

    if (wallets.length === 0) {
      setCompletedCukies([]);
      return;
    }

    const query = new URLSearchParams({
      limit: '24',
      offset: '0',
    });
    for (const wallet of wallets) query.append('wallet', wallet);

    try {
      const response = await fetch(
        `/api/cukies/breeding/completed?${query}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error('No se han podido cargar los bred Cukies.');
      }
      const payload = (await response.json()) as LegacyCompletedBreedsResponse;
      setCompletedCukies(payload.items);
    } catch (error) {
      setStatus(getErrorMessage(error));
      setCompletedCukies([]);
    }
  }, [address, tronAddress]);

  const fetchBscActiveBreeds = useCallback(async () => {
    if (!address) return [];

    const ids = (await readLegacyBscContract<readonly bigint[]>(
      'breedingPoints',
      'getAllBreedsOwner',
      [address],
    )) ?? [];

    const breeds = await Promise.all(
      ids.map(async (id) =>
        normalizeBreedTuple(
          id,
          await legacyBscPublicClient.readContract({
            address: bscBreedingAddress,
            abi: legacyMarketplaceBscAbis.breedingPoints,
            functionName: 'getBreed',
            args: [id],
          }),
          'BSC',
        ),
      ),
    );

    return breeds.filter((breed): breed is OnChainBreed => Boolean(breed));
  }, [address]);

  const fetchTronActiveBreeds = useCallback(async () => {
    if (!tronAddress || !window.tronWeb) return [];

    const ids =
      (await readLegacyTronContract<unknown[]>(
        window.tronWeb,
        'breedingPoints',
        'getAllBreedsOwner',
        [tronAddress],
      )) ?? [];
    const breeds = await Promise.all(
      ids.map(async (id) =>
        normalizeBreedTuple(
          id,
          await readLegacyTronContract(
            window.tronWeb,
            'breedingPoints',
            'getBreed',
            [id],
          ),
          'TRON',
        ),
      ),
    );

    return breeds.filter((breed): breed is OnChainBreed => Boolean(breed));
  }, [tronAddress]);

  const refreshActiveBreeds = useCallback(async () => {
    setIsLoadingBreeds(true);
    try {
      const breeds =
        network === 'BSC'
          ? await fetchBscActiveBreeds()
          : await fetchTronActiveBreeds();
      setActiveBreeds(breeds.filter((breed) => !breed.completed));
    } catch (error) {
      setStatus(getErrorMessage(error));
      setActiveBreeds([]);
    } finally {
      setIsLoadingBreeds(false);
    }
  }, [fetchBscActiveBreeds, fetchTronActiveBreeds, network]);

  const refreshTronSnapshot = useCallback(async () => {
    if (network !== 'TRON' || !tronAddress || !window.tronWeb) return;

    try {
      const [max, userPoints, approval] = await Promise.all([
        readLegacyTronContract<unknown>(
          window.tronWeb,
          'breedingPoints',
          'getMaxBreedsByCukie',
        ),
        readLegacyTronContract<unknown>(
          window.tronWeb,
          'points',
          'getPoints',
          [tronAddress],
        ),
        readLegacyTronContract<unknown>(
          window.tronWeb,
          'token',
          'isApprovedForAll',
          [tronAddress, tronBreedingAddress],
        ),
      ]);
      setTronMaxBreeds(Number(max));
      setTronPoints(formatPoints(String(userPoints)));
      setTronApproved(Boolean(approval));
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }, [network, tronAddress]);

  useEffect(() => {
    setParent1(null);
    setParent2(null);
    setStatus(null);
  }, [network]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void refreshCandidates();
  }, [refreshCandidates]);

  useEffect(() => {
    if (tab === 'active') void refreshActiveBreeds();
    if (tab === 'completed') void refreshCompleted();
  }, [refreshActiveBreeds, refreshCompleted, tab]);

  useEffect(() => {
    void refreshTronSnapshot();
  }, [refreshTronSnapshot]);

  useEffect(() => {
    if (
      network !== 'TRON' ||
      !window.tronWeb ||
      !parent1 ||
      !parent2 ||
      sameToken(parent1, parent2)
    ) {
      setTronCost(null);
      return;
    }

    let cancelled = false;
    readLegacyTronContract<unknown>(
      window.tronWeb,
      'breedingPoints',
      'getCostPoints',
      [parent1.tokenId, parent2.tokenId],
    )
      .then((value) => {
        if (!cancelled) setTronCost(formatPoints(String(value)));
      })
      .catch((error) => {
        if (!cancelled) setStatus(getErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [network, parent1, parent2]);

  function ensureBsc() {
    if (network !== 'BSC') return false;
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
    if (network !== 'TRON') return false;
    if (!isTronInstalled) {
      setStatus('Instala o activa TronLink para operar breeding en TRON.');
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

  async function approveBreeding() {
    if (network === 'BSC') {
      if (!ensureBsc()) return;
      setStatus('Enviando approval de breeding en BSC...');
      writeContract({
        address: bscTokenAddress,
        abi: legacyMarketplaceBscAbis.token,
        functionName: 'setApprovalForAll',
        args: [bscBreedingAddress, true],
      });
      return;
    }

    if (!(await ensureTron()) || !window.tronWeb) return;
    setStatus('Enviando approval de breeding en TRON...');
    try {
      await sendLegacyTronContract(
        window.tronWeb,
        'token',
        'setApprovalForAll',
        [tronBreedingAddress, true],
        { feeLimit: 800_000_000, shouldPollResponse: false },
      );
      setTronApproved(true);
      setStatus('Approval de breeding enviado.');
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function startBreeding() {
    if (!parent1 || !parent2 || sameToken(parent1, parent2)) {
      setStatus('Selecciona dos Cukies distintos.');
      return;
    }

    if (network === 'BSC') {
      if (!ensureBsc()) return;
      setStatus('Iniciando breeding en BSC...');
      writeContract({
        address: bscBreedingAddress,
        abi: legacyMarketplaceBscAbis.breedingPoints,
        functionName: 'start',
        args: [BigInt(parent1.tokenId), BigInt(parent2.tokenId)],
      });
      return;
    }

    if (!(await ensureTron()) || !window.tronWeb) return;
    setStatus('Iniciando breeding en TRON...');
    try {
      await sendLegacyTronContract(
        window.tronWeb,
        'breedingPoints',
        'start',
        [parent1.tokenId, parent2.tokenId],
        { feeLimit: 800_000_000, shouldPollResponse: false },
      );
      setParent1(null);
      setParent2(null);
      setStatus('Breeding iniciado. Refresca Active breeds en unos segundos.');
      void refreshCandidates();
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function openBreed(breed: OnChainBreed) {
    if (network === 'BSC') {
      if (!ensureBsc()) return;
      setStatus('Abriendo Cukie en BSC...');
      writeContract({
        address: bscBreedingAddress,
        abi: legacyMarketplaceBscAbis.breedingPoints,
        functionName: 'breed',
        args: [BigInt(breed.id)],
      });
      return;
    }

    if (!(await ensureTron()) || !window.tronWeb) return;
    setStatus('Abriendo Cukie en TRON...');
    try {
      await sendLegacyTronContract(
        window.tronWeb,
        'breedingPoints',
        'breed',
        [breed.id],
        { feeLimit: 800_000_000, shouldPollResponse: false },
      );
      setStatus('Cukie abierto. Refresca completed breeds en unos segundos.');
      void refreshActiveBreeds();
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  function selectParent(cuki: LegacyMarketplaceCukiItem) {
    if (parent1?.tokenId === cuki.tokenId) {
      setParent1(null);
      return;
    }

    if (parent2?.tokenId === cuki.tokenId) {
      setParent2(null);
      return;
    }

    if (!parent1) {
      setParent1(cuki);
      return;
    }

    if (!parent2) {
      setParent2(cuki);
      return;
    }

    setParent2(cuki);
  }

  const disabled = isWriting || isSwitchingChain;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-black/30 p-3">
        <div className="inline-flex rounded-[8px] border border-white/10 bg-white/[0.03] p-1">
          {(['BSC', 'TRON'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setNetwork(item)}
              className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                network === item
                  ? 'bg-cyan-300 text-slate-950'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-[8px] border border-white/10 bg-white/[0.03] p-1">
          {[
            ['start', 'Start'],
            ['active', 'Active'],
            ['completed', 'Completed'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as BreedingTab)}
              className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                tab === key
                  ? 'bg-white text-slate-950'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value, Icon }) => (
          <div
            key={label}
            className="rounded-[8px] border border-white/10 bg-black/30 p-4"
          >
            <Icon className="mb-3 h-4 w-4 text-cyan-200" />
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-1 truncate font-semibold text-white">
              {value}
            </p>
          </div>
        ))}
      </div>

      {!ready && (
        <div className="rounded-[8px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          {network === 'BSC' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Conecta una wallet EVM y usa BNB Smart Chain para breeding.
              </span>
              {isConnected && chainId !== 56 && (
                <Button onClick={() => switchChain({ chainId: 56 })}>
                  Switch to BSC
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Conecta TronLink para breeding en TRON.</span>
              <Button onClick={() => void ensureTron()}>Connect TronLink</Button>
            </div>
          )}
        </div>
      )}

      {tab === 'start' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-[8px] border border-white/10 bg-black/30 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-headline text-2xl font-bold text-white">
                  Select parents
                </h2>
              <p className="mt-1 text-sm text-slate-400">
                  Elige dos Cukies disponibles de tu wallet.
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
                  <CandidateCard
                    key={cuki.tokenId}
                    cuki={cuki}
                    selected={
                      parent1?.tokenId === cuki.tokenId ||
                      parent2?.tokenId === cuki.tokenId
                    }
                    disabled={!ready}
                    onSelect={() => selectParent(cuki)}
                  />
                ))
              ) : (
                <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400 lg:col-span-2">
                  {owner
                    ? 'No hay Cukies disponibles para breeding en esta wallet/red.'
                    : 'Conecta una wallet para cargar candidatos.'}
                </div>
              )}
            </div>
          </section>

          <aside className="grid content-start gap-4 rounded-[8px] border border-cyan-300/20 bg-black/35 p-5">
            <div>
              <h2 className="font-headline text-2xl font-bold text-white">
                Breeding desk
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Revisa padres, coste y confirma el breeding.
              </p>
            </div>

            {[parent1, parent2].map((parent, index) => (
              <div
                key={index}
                className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3"
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Parent {index + 1}
                </p>
                <p className="mt-1 font-semibold text-white">
                  {parent ? getCukiDisplayName(parent) : 'Not selected'}
                </p>
              </div>
            ))}

            <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Required points
              </p>
              <p className="mt-1 font-mono text-lg font-semibold text-white">
                {parentsSelected ? cost : '-'}
              </p>
            </div>

            {!approved && (
              <Button
                onClick={() => void approveBreeding()}
                disabled={disabled || !ready}
                variant="outline"
                className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
              >
                <Check className="mr-2 h-4 w-4" />
                Approve breeding
              </Button>
            )}

            <Button
              onClick={() => void startBreeding()}
              disabled={disabled || !ready || !parentsSelected || !approved}
              className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
            >
              <Heart className="mr-2 h-4 w-4" />
              Start breeding
            </Button>
          </aside>
        </div>
      )}

      {tab === 'active' && (
        <section className="rounded-[8px] border border-white/10 bg-black/30 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-headline text-2xl font-bold text-white">
              Active breeds
            </h2>
            <Button
              variant="outline"
              disabled={isLoadingBreeds || !ready}
              onClick={() => void refreshActiveBreeds()}
              className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
            >
              {isLoadingBreeds ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {activeBreeds.length > 0 ? (
              activeBreeds.map((breed) => (
                <BreedCard
                  key={`${breed.birthNetwork}-${breed.id}`}
                  breed={breed}
                  onOpen={openBreed}
                  disabled={disabled}
                />
              ))
            ) : (
              <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400 lg:col-span-2">
                No active breeds loaded for this network.
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'completed' && (
        <section className="rounded-[8px] border border-white/10 bg-black/30 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-headline text-2xl font-bold text-white">
              Completed breeds
            </h2>
            <Button
              variant="outline"
              onClick={() => void refreshCompleted()}
              className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {completedCukies.length > 0 ? (
              completedCukies.map((cuki) => (
                <CompletedCukiCard key={cuki.tokenId} cuki={cuki} />
              ))
            ) : (
              <div className="rounded-[8px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400 lg:col-span-2">
                No completed breeds loaded for connected wallets.
              </div>
            )}
          </div>
        </section>
      )}

      {status && (
        <div className="rounded-[8px] border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
          {status}
        </div>
      )}

    </div>
  );
}
