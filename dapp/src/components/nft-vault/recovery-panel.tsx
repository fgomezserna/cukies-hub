'use client';

import { useEffect, useMemo, useState } from 'react';
import { isAddress, zeroAddress, type Address, type Hash } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

import {
  cukieMasterNftVaultAbi,
  cukiePoolNftVaultAbi,
  getNftVaultExplorerTxUrl,
  ukiNftVaults,
} from '@/lib/contracts/uki-nft-vaults';

type VaultKind = 'cukie_master' | 'cukie_pool';
type MutationPhase = 'idle' | 'checking' | 'requesting_exit' | 'withdrawing';

type OnChainPosition = {
  collection: Address;
  tokenId: bigint;
  collectionCurrentlyAllowed: boolean;
  beneficialOwner: Address;
  depositEpoch: bigint;
  depositedAt: bigint;
  withdrawableAt: bigint;
};

type QueryResult =
  | { kind: 'idle' }
  | { kind: 'not_found' }
  | { kind: 'wrong_owner'; beneficialOwner: Address }
  | { kind: 'position'; position: OnChainPosition }
  | { kind: 'error'; message: string };

const ZERO_ADDRESS = zeroAddress.toLowerCase();

function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function tupleField(value: unknown, name: string, index: number) {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object' && name in value) {
    return (value as Record<string, unknown>)[name];
  }
  return undefined;
}

function uintField(value: unknown, name: string, index: number) {
  const field = tupleField(value, name, index);
  if (typeof field === 'bigint') return field;
  if (typeof field === 'number' && Number.isSafeInteger(field) && field >= 0) return BigInt(field);
  if (typeof field === 'string' && /^\d+$/.test(field)) return BigInt(field);
  return null;
}

function parsePosition(
  kind: VaultKind,
  collection: Address,
  tokenId: bigint,
  value: unknown,
  collectionCurrentlyAllowed: boolean,
): OnChainPosition | null {
  const ownerValue = tupleField(value, 'beneficialOwner', 0);
  const depositEpoch = uintField(value, 'depositEpoch', 1);
  const depositedAt = uintField(value, 'depositedAt', 2);
  const withdrawableAt = kind === 'cukie_pool'
    ? uintField(value, 'withdrawableAt', 5)
    : BigInt(0);

  if (
    typeof ownerValue !== 'string'
    || !isAddress(ownerValue)
    || depositEpoch === null
    || depositedAt === null
    || withdrawableAt === null
  ) return null;

  return {
    collection,
    tokenId,
    collectionCurrentlyAllowed,
    beneficialOwner: ownerValue,
    depositEpoch,
    depositedAt,
    withdrawableAt,
  };
}

function utcTimestampLabel(timestamp: bigint) {
  const milliseconds = Number(timestamp) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) return 'fecha no representable';
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return 'fecha no representable';
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function NftVaultRecoveryPanel({ kind }: { kind: VaultKind }) {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: ukiNftVaults.chainId ?? undefined });
  const { writeContractAsync } = useWriteContract();
  const configuredCollections = ukiNftVaults.recoveryCollectionAddresses;
  const configuredCollectionKey = configuredCollections
    .map((collection) => collection.toLowerCase())
    .join(',');
  const [collectionInput, setCollectionInput] = useState<string>(configuredCollections[0] ?? '');
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [result, setResult] = useState<QueryResult>({ kind: 'idle' });
  const [phase, setPhase] = useState<MutationPhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));
  const [chainTimeVerified, setChainTimeVerified] = useState(false);

  const vaultAddress = kind === 'cukie_master'
    ? ukiNftVaults.cukieMasterNftVaultAddress
    : ukiNftVaults.cukiePoolNftVaultAddress;
  const vaultAbi = kind === 'cukie_master'
    ? cukieMasterNftVaultAbi
    : cukiePoolNftVaultAbi;
  const configuredMode = kind === 'cukie_master'
    ? ukiNftVaults.mode.cukieMaster
    : ukiNftVaults.mode.cukiePool;
  const configuredReady = kind === 'cukie_master'
    ? ukiNftVaults.ready.cukieMaster
    : ukiNftVaults.ready.cukiePool;

  const publicConfigReady = Boolean(
    configuredMode === 'custodial'
    && configuredReady
    && ukiNftVaults.chainId
    && vaultAddress
    && isAddress(vaultAddress)
    && ukiNftVaults.collectionConfigInvalid !== true
    && ukiNftVaults.recoveryCollectionConfigInvalid !== true
    && configuredCollections.length > 0
    && configuredCollections.every((collection) => isAddress(collection)),
  );
  const connectedWalletReady = Boolean(isConnected && address && isAddress(address));
  const correctChain = Boolean(
    ukiNftVaults.chainId && chainId === ukiNftVaults.chainId,
  );
  const selectedCollection = useMemo(() => configuredCollections.find((collection) => (
    sameAddress(collection, collectionInput)
  )) ?? null, [collectionInput, configuredCollectionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tokenIdValid = /^\d+$/.test(tokenIdInput);
  const canInspect = Boolean(
    publicConfigReady
    && connectedWalletReady
    && correctChain
    && selectedCollection
    && tokenIdValid
    && publicClient
    && phase === 'idle',
  );

  useEffect(() => {
    if (configuredCollections.some((collection) => sameAddress(collection, collectionInput))) return;
    setCollectionInput(configuredCollections[0] ?? '');
  }, [collectionInput, configuredCollectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setResult({ kind: 'idle' });
    setNotice(null);
    setLatestTxHash(null);
    setChainTimeVerified(false);
  }, [address, chainId, collectionInput, kind, tokenIdInput, vaultAddress]);

  const withdrawableAt = result.kind === 'position'
    ? result.position.withdrawableAt
    : BigInt(0);
  useEffect(() => {
    if (
      kind !== 'cukie_pool'
      || withdrawableAt === BigInt(0)
      || BigInt(nowSeconds) >= withdrawableAt
    ) return;
    if (!publicClient || typeof publicClient.getBlock !== 'function') return;
    const secondsUntilCutoff = Number(withdrawableAt - BigInt(nowSeconds));
    const timer = window.setTimeout(() => {
      publicClient.getBlock({ blockTag: 'latest' })
        .then((block) => {
          const blockSeconds = Number(block.timestamp);
          if (!Number.isSafeInteger(blockSeconds)) return;
          setNowSeconds(blockSeconds);
          setChainTimeVerified(true);
        })
        .catch(() => setChainTimeVerified(false));
    }, Math.min(Math.max(secondsUntilCutoff, 1), 15) * 1_000);
    return () => window.clearTimeout(timer);
  }, [kind, nowSeconds, publicClient, withdrawableAt]);

  async function readPosition(identity: { collection: Address; tokenId: bigint }) {
    if (!publicClient || !vaultAddress) throw new Error('CLIENT_NOT_READY');
    const allowed = await publicClient.readContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'collectionAllowed',
      args: [identity.collection],
    });
    if (typeof allowed !== 'boolean') throw new Error('INVALID_ALLOWLIST_RESPONSE');

    const rawPosition = await publicClient.readContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'positionOf',
      args: [identity.collection, identity.tokenId],
    });
    const position = parsePosition(
      kind,
      identity.collection,
      identity.tokenId,
      rawPosition,
      allowed,
    );
    if (!position) throw new Error('INVALID_POSITION_RESPONSE');

    if (typeof publicClient.getBlock === 'function') {
      try {
        const block = await publicClient.getBlock({ blockTag: 'latest' });
        const blockSeconds = Number(block.timestamp);
        if (Number.isSafeInteger(blockSeconds)) {
          setNowSeconds(blockSeconds);
          setChainTimeVerified(true);
        }
      } catch {
        setNowSeconds(Math.floor(Date.now() / 1_000));
        setChainTimeVerified(false);
      }
    } else {
      setNowSeconds(Math.floor(Date.now() / 1_000));
      setChainTimeVerified(false);
    }
    return position;
  }

  function applyPosition(position: OnChainPosition) {
    if (position.beneficialOwner.toLowerCase() === ZERO_ADDRESS) {
      setResult({ kind: 'not_found' });
      return;
    }
    if (!sameAddress(position.beneficialOwner, address)) {
      setResult({ kind: 'wrong_owner', beneficialOwner: position.beneficialOwner });
      return;
    }
    setResult({ kind: 'position', position });
  }

  async function inspectPosition() {
    if (!canInspect || !selectedCollection || !tokenIdValid) return;
    const identity = { collection: selectedCollection, tokenId: BigInt(tokenIdInput) };
    setPhase('checking');
    setNotice(null);
    setLatestTxHash(null);
    try {
      applyPosition(await readPosition(identity));
    } catch (caught) {
      setResult({
        kind: 'error',
        message: 'No se pudo validar la posición directamente en el contrato. No se habilita ninguna firma.',
      });
    } finally {
      setPhase('idle');
    }
  }

  async function execute(operation: 'request_exit' | 'withdraw') {
    if (
      result.kind !== 'position'
      || !publicConfigReady
      || !connectedWalletReady
      || !correctChain
      || !publicClient
      || !vaultAddress
      || !ukiNftVaults.chainId
      || phase !== 'idle'
      || !sameAddress(result.position.beneficialOwner, address)
    ) return;

    const isPool = kind === 'cukie_pool';
    const exitRequested = result.position.withdrawableAt > BigInt(0);
    let withdrawalReady = exitRequested
      && chainTimeVerified
      && BigInt(nowSeconds) >= result.position.withdrawableAt;
    if (
      (operation === 'request_exit' && (!isPool || exitRequested))
      || (operation === 'withdraw' && isPool && !withdrawalReady)
    ) return;

    if (
      operation === 'withdraw'
      && isPool
      && typeof publicClient.getBlock === 'function'
    ) {
      try {
        const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
        const latestBlockSeconds = Number(latestBlock.timestamp);
        if (!Number.isSafeInteger(latestBlockSeconds)) return;
        setNowSeconds(latestBlockSeconds);
        setChainTimeVerified(true);
        withdrawalReady = BigInt(latestBlockSeconds) >= result.position.withdrawableAt;
      } catch {
        setChainTimeVerified(false);
        return;
      }
      if (!withdrawalReady) return;
    }

    setPhase(operation === 'request_exit' ? 'requesting_exit' : 'withdrawing');
    setNotice(null);
    setLatestTxHash(null);
    try {
      const hash = await writeContractAsync({
        chainId: ukiNftVaults.chainId,
        address: vaultAddress,
        abi: vaultAbi,
        functionName: operation === 'request_exit' ? 'requestExit' : 'withdraw',
        args: [result.position.collection, result.position.tokenId],
      });
      setLatestTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');

      setNotice(operation === 'request_exit'
        ? 'Salida confirmada en BSC. La fecha retirable se ha vuelto a leer directamente del contrato.'
        : 'Retirada confirmada en BSC. El NFT ha vuelto a tu wallet.');
      try {
        applyPosition(await readPosition({
          collection: result.position.collection,
          tokenId: result.position.tokenId,
        }));
      } catch {
        setResult({ kind: 'idle' });
      }
    } catch {
      setResult({
        kind: 'error',
        message: 'La wallet rechazó la operación o el contrato no permitió completarla.',
      });
    } finally {
      setPhase('idle');
    }
  }

  const exitRequested = result.kind === 'position'
    && result.position.withdrawableAt > BigInt(0);
  const withdrawalReady = exitRequested
    && result.kind === 'position'
    && chainTimeVerified
    && BigInt(nowSeconds) >= result.position.withdrawableAt;
  const explorerTxUrl = latestTxHash ? getNftVaultExplorerTxUrl(latestTxHash) : null;

  return (
    <div className="mt-6 rounded-[8px] border border-[var(--uki-cyan-border)] bg-black/25 p-5">
      <p className="uki-label">Recuperación on-chain</p>
      <h3 className="mt-2 font-headline text-xl font-black uppercase text-[var(--uki-cream)]">
        {kind === 'cukie_master' ? 'Salida directa de Cukie Master' : 'Salida directa del Cukie Pool'}
      </h3>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
        Esta vía consulta y opera el vault directamente, sin autenticación, API ni indexador.
        Solo permite recuperar posiciones ya depositadas; aquí no se habilitan depósitos.
      </p>

      {!publicConfigReady ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          La identidad pública del vault, la red o sus colecciones no es válida. La recuperación permanece bloqueada.
        </p>
      ) : !connectedWalletReady ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          Conecta la wallet EVM propietaria de la posición para continuar.
        </p>
      ) : !correctChain ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          Cambia tu wallet a la red BSC configurada antes de consultar o firmar.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_auto] sm:items-end">
        <label className="grid gap-1.5 text-xs font-black uppercase text-[var(--uki-muted)]">
          Colección
          <select
            aria-label="Colección NFT"
            value={collectionInput}
            disabled={!publicConfigReady || phase !== 'idle'}
            onChange={(event) => setCollectionInput(event.target.value)}
            className="h-11 rounded-[7px] border border-white/15 bg-black/40 px-3 text-sm font-semibold normal-case text-[var(--uki-text)] disabled:opacity-50"
          >
            {configuredCollections.map((collection) => (
              <option key={collection.toLowerCase()} value={collection}>
                {shortAddress(collection)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-black uppercase text-[var(--uki-muted)]">
          Token ID
          <input
            aria-label="Token ID"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={tokenIdInput}
            disabled={!publicConfigReady || phase !== 'idle'}
            onChange={(event) => setTokenIdInput(event.target.value.trim())}
            className="h-11 rounded-[7px] border border-white/15 bg-black/40 px-3 text-sm font-semibold normal-case text-[var(--uki-text)] disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={!canInspect}
          onClick={() => void inspectPosition()}
          className="h-11 rounded-[7px] border border-[var(--uki-cyan-border)] px-4 text-xs font-black uppercase text-[var(--uki-cyan)] disabled:opacity-50"
        >
          {phase === 'checking' ? 'Comprobando…' : 'Comprobar posición'}
        </button>
      </div>

      {result.kind === 'not_found' ? (
        <p role="status" className="mt-4 text-sm font-semibold text-[var(--uki-muted)]">
          Ese NFT no tiene una posición abierta en este vault.
        </p>
      ) : null}
      {result.kind === 'wrong_owner' ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">
          La posición pertenece a otra wallet ({shortAddress(result.beneficialOwner)}). No se habilita ninguna firma.
        </p>
      ) : null}
      {result.kind === 'error' ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-300">{result.message}</p>
      ) : null}
      {result.kind === 'position' ? (
        <div className="mt-4 rounded-[7px] border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-[var(--uki-cream)]">Cukie #{result.position.tokenId.toString()}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">
                Propietario verificado · epoch {result.position.depositEpoch.toString()}
              </p>
              {!result.position.collectionCurrentlyAllowed ? (
                <p className="mt-1 text-xs font-semibold text-amber-300">
                  La colección ya no admite depósitos, pero la salida de esta posición sigue disponible.
                </p>
              ) : null}
            </div>
            {kind === 'cukie_master' ? (
              <button
                type="button"
                disabled={phase !== 'idle' || !correctChain || !connectedWalletReady}
                onClick={() => void execute('withdraw')}
                className="rounded-[7px] bg-[var(--uki-cyan)] px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50"
              >
                {phase === 'withdrawing' ? 'Retirando…' : 'Retirar Cukie ahora'}
              </button>
            ) : !exitRequested ? (
              <button
                type="button"
                disabled={phase !== 'idle' || !correctChain || !connectedWalletReady}
                onClick={() => void execute('request_exit')}
                className="rounded-[7px] border border-white/15 px-4 py-2 text-xs font-black uppercase text-[var(--uki-text)] disabled:opacity-50"
              >
                {phase === 'requesting_exit' ? 'Solicitando…' : 'Solicitar salida on-chain'}
              </button>
            ) : withdrawalReady ? (
              <button
                type="button"
                disabled={phase !== 'idle' || !correctChain || !connectedWalletReady}
                onClick={() => void execute('withdraw')}
                className="rounded-[7px] bg-[var(--uki-cyan)] px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50"
              >
                {phase === 'withdrawing' ? 'Retirando…' : 'Retirar NFT on-chain'}
              </button>
            ) : (
              <span className="max-w-xs text-right text-xs font-black uppercase text-amber-300">
                {chainTimeVerified
                  ? `Retirable desde ${utcTimestampLabel(result.position.withdrawableAt)} UTC`
                  : 'No se pudo verificar la hora del último bloque; vuelve a comprobar la posición.'}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="mt-4 text-sm font-semibold text-[var(--uki-cyan)]">
          {notice}
          {explorerTxUrl ? (
            <> {' '}<a href={explorerTxUrl} target="_blank" rel="noreferrer" className="underline">Ver transacción</a></>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
