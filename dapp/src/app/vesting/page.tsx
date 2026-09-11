'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, isAddress } from 'viem';
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getBscScanTxUrl, ukiSaleContracts, vestingVaultAbi } from '@/lib/contracts/uki-sale';
import { FALLBACK_COORDINATOR, useWalletCoordinator } from '@/providers/wallet-coordinator-context';
import {
  isTransactionRefreshAborted,
  retryTransactionRefresh,
  TransactionReplacementError,
  TransactionReplacementPendingError,
  waitForConfirmedEvmTransaction,
} from '@/lib/transaction-refresh';

type Schedule = {
  readonly [index: number]: bigint | undefined;
  readonly totalAmount?: bigint;
  readonly releasedAmount?: bigint;
  readonly start?: bigint;
  readonly cliff?: bigint;
  readonly duration?: bigint;
};

type ScheduleField = 'totalAmount' | 'releasedAmount' | 'start' | 'cliff' | 'duration';

function scheduleField(schedule: Schedule | undefined, key: ScheduleField, index: number) {
  return schedule?.[key] ?? schedule?.[index];
}

function formatToken(value?: bigint) {
  if (value === undefined) return '—';
  const numeric = Number(formatUnits(value, 18));
  if (!Number.isFinite(numeric)) return '—';

  return numeric.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function formatShortAddress(value?: string) {
  if (!value) return '-';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function validUnixTimestamp(value?: bigint | null) {
  if (!value || value <= BigInt(0)) return null;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function formatVestingDate(value?: bigint | null) {
  const date = validUnixTimestamp(value);
  if (!date) return null;

  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type VestingTransactionState =
  | { kind: 'idle' }
  | { kind: 'confirming'; hash?: `0x${string}` }
  | { kind: 'pending'; hash: `0x${string}`; message: string }
  | { kind: 'success'; hash: `0x${string}`; message?: string }
  | { kind: 'error'; message: string };

type PendingVestingTransaction = {
  operationId: number;
  hash: `0x${string}`;
  wallet: string;
  chainId: number;
  receiptConfirmed?: boolean;
  baselineReleased?: bigint;
};

export default function PublicVestingPage() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: switchingChain } = useSwitchChain();
  const { requestWallet, evm: evmWallet } = useWalletCoordinator();
  const { writeContractAsync } = useWriteContract();
  const vaultAddress = ukiSaleContracts.vestingVaultAddress;
  const isConfigured = Boolean(vaultAddress && isAddress(vaultAddress));
  const contractAddress = isConfigured ? vaultAddress as `0x${string}` : undefined;
  const accountAddress = address as `0x${string}` | undefined;
  const publicClient = usePublicClient({ chainId: ukiSaleContracts.chainId });
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | null>(null);
  const [transactionState, setTransactionState] = useState<VestingTransactionState>({ kind: 'idle' });
  const [pendingTransaction, setPendingTransaction] = useState<PendingVestingTransaction | null>(null);
  const mountedRef = useRef(true);
  const contextRef = useRef<{ address: string | null; chainId: number | null }>({
    address: address ?? null,
    chainId: chainId ?? null,
  });
  const pendingTransactionRef = useRef<PendingVestingTransaction | null>(null);
  const operationGenerationRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);
  contextRef.current = { address: address ?? null, chainId: chainId ?? null };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const pending = pendingTransactionRef.current;
    const matches = Boolean(
      pending
      && address
      && pending.wallet.toLowerCase() === address.toLowerCase()
      && pending.chainId === chainId,
    );
    if (matches && pending) {
      setClaimTxHash(pending.hash);
      setPendingTransaction(pending);
      setTransactionState({
        kind: 'pending',
        hash: pending.hash,
        message: pending.receiptConfirmed
          ? 'Cobro confirmado en la cadena. El calendario aún no refleja el cobro; compruébalo de nuevo sin firmar otra vez.'
          : 'Cobro enviado. La confirmación aún no llega; compruébalo sin firmar otra vez.',
      });
      return;
    }
    refreshAbortRef.current?.abort();
    setClaimTxHash(null);
    setPendingTransaction(null);
    setTransactionState((current) => (current.kind === 'idle' ? current : { kind: 'idle' }));
  }, [address, chainId]);

  function assertLiveContext(expectedAddress: string, expectedChainId: number) {
    if (
      !mountedRef.current
      || !contextRef.current.address
      || contextRef.current.address.toLowerCase() !== expectedAddress.toLowerCase()
      || contextRef.current.chainId !== expectedChainId
    ) throw new Error('WALLET_CONTEXT_CHANGED');
  }

  function pendingBelongsToCurrent() {
    const pending = pendingTransactionRef.current;
    return Boolean(
      pending
      && address
      && pending.wallet.toLowerCase() === address.toLowerCase()
      && pending.chainId === chainId,
    );
  }

  function pendingIsCurrent(pending: PendingVestingTransaction) {
    const current = pendingTransactionRef.current;
    return Boolean(
      current
      && current.operationId === pending.operationId
      && operationGenerationRef.current === pending.operationId
      && current.hash.toLowerCase() === pending.hash.toLowerCase()
      && current.wallet.toLowerCase() === pending.wallet.toLowerCase()
      && current.chainId === pending.chainId
      && pendingBelongsToCurrent(),
    );
  }

  function operationIsCurrent(operationId: number) {
    return operationGenerationRef.current === operationId;
  }

  function isLiveContext(expectedAddress: string, expectedChainId: number) {
    const current = contextRef.current;
    return Boolean(
      mountedRef.current
      && current.address
      && current.address.toLowerCase() === expectedAddress.toLowerCase()
      && current.chainId === expectedChainId,
    );
  }

  const { data: totalAllocated, isError: isTotalAllocatedError, refetch: refetchTotalAllocated } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'totalAllocated',
    query: { enabled: isConfigured },
  });
  const { data: totalReleased, isError: isTotalReleasedError, refetch: refetchTotalReleased } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'totalReleased',
    query: { enabled: isConfigured },
  });
  const { data: unallocated, isError: isUnallocatedError, refetch: refetchUnallocated } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'unallocatedBalance',
    query: { enabled: isConfigured },
  });
  const { data: presaleVestingStart, isError: isPresaleVestingStartError, refetch: refetchPresaleVestingStart } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'presaleVestingStart',
    query: { enabled: isConfigured },
  });
  const { data: userSchedule, isError: isScheduleError, refetch: refetchUserSchedule } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'scheduleOf',
    args: accountAddress ? [accountAddress] : undefined,
    query: { enabled: isConfigured && Boolean(accountAddress) },
  });
  const { data: claimable, isError: isClaimableError, refetch: refetchClaimable } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'releasable',
    args: accountAddress ? [accountAddress] : undefined,
    query: { enabled: isConfigured && Boolean(accountAddress) },
  });

  const schedule = userSchedule as Schedule | undefined;
  const totalAmount = scheduleField(schedule, 'totalAmount', 0);
  const releasedAmount = scheduleField(schedule, 'releasedAmount', 1);
  const claimableAmount = claimable as bigint | undefined;
  const vestedAmount = releasedAmount !== undefined && claimableAmount !== undefined
    ? releasedAmount + claimableAmount
    : undefined;
  const lockedAmount = totalAmount !== undefined && vestedAmount !== undefined && totalAmount > vestedAmount
    ? totalAmount - vestedAmount
    : totalAmount !== undefined && vestedAmount !== undefined
      ? BigInt(0)
      : undefined;
  const hasPosition = totalAmount !== undefined && totalAmount > BigInt(0);
  const unlockProgress = totalAmount !== undefined && vestedAmount !== undefined && totalAmount > BigInt(0)
    ? Number((vestedAmount * BigInt(10000)) / totalAmount) / 100
    : undefined;

  const vestingStart = scheduleField(schedule, 'start', 2);
  const vestingDuration = scheduleField(schedule, 'duration', 4);
  const configuredVestingStart = presaleVestingStart as bigint | undefined;
  const effectiveVestingStart = vestingStart && vestingStart > BigInt(0)
    ? vestingStart
    : configuredVestingStart;
  const effectiveStartDate = validUnixTimestamp(effectiveVestingStart);
  const vestingEnd = effectiveStartDate && vestingDuration && vestingDuration > BigInt(0)
    ? (effectiveVestingStart ?? BigInt(0)) + vestingDuration
    : undefined;
  const vestingStartLabel = formatVestingDate(effectiveVestingStart) ?? 'Pendiente de inicio';
  const vestingEndLabel = formatVestingDate(vestingEnd) ?? 'Pendiente de calendario';

  const hasGlobalReadError =
    isTotalAllocatedError || isTotalReleasedError || isUnallocatedError || isPresaleVestingStartError;
  const hasWalletReadError = Boolean(isConnected && (isScheduleError || isClaimableError));
  const hasVestingReadError = isConfigured && (hasGlobalReadError || hasWalletReadError);

  const metrics = useMemo(() => [
    { label: 'Total asignado', value: `${formatToken(totalAmount)} UKI`, icon: ShieldCheck },
    { label: 'Disponible ahora', value: `${formatToken(claimableAmount)} UKI`, icon: Wallet },
    { label: 'Ya reclamado', value: `${formatToken(releasedAmount)} UKI`, icon: CheckCircle2 },
    { label: 'Bloqueado', value: `${formatToken(lockedAmount)} UKI`, icon: LockKeyhole },
  ], [claimableAmount, lockedAmount, releasedAmount, totalAmount]);

  async function refreshVestingReads(pending: PendingVestingTransaction) {
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    try {
      const converged = await retryTransactionRefresh(
        async () => {
          try {
            assertLiveContext(pending.wallet, pending.chainId);
            // Global metadata is useful for the surrounding view, but it must
            // not hold the account's claim lock while its provider catches up.
            void Promise.allSettled([
              refetchTotalAllocated(),
              refetchTotalReleased(),
              refetchUnallocated(),
              refetchPresaleVestingStart(),
            ]);
            const results = await Promise.allSettled([
              refetchUserSchedule(),
              refetchClaimable(),
            ]);
            if (controller.signal.aborted) return false;
            assertLiveContext(pending.wallet, pending.chainId);
            if (results.some((result) => result.status === 'rejected')) return false;
            const reads = results.map((result) => result.status === 'fulfilled' ? result.value : null);
            if (!reads.every((result) => result && result.status === 'success')) return false;
            const nextSchedule = reads[0]?.data as Schedule | undefined;
            const nextReleased = scheduleField(nextSchedule, 'releasedAmount', 1);
            const baselineReleased = pending.baselineReleased;
            return baselineReleased !== undefined
              && nextReleased !== undefined
              && nextReleased > baselineReleased;
          } catch (reason) {
            if (isTransactionRefreshAborted(reason) || (reason instanceof Error && reason.message === 'WALLET_CONTEXT_CHANGED')) {
              throw reason;
            }
            // A provider/indexer read can fail transiently. Keep the receipt
            // authoritative and let the next bounded attempt try again.
            return false;
          }
        },
        { signal: controller.signal },
      );
      if (!mountedRef.current || !pendingIsCurrent(pending)) return;
      if (converged) {
        pendingTransactionRef.current = null;
        setPendingTransaction(null);
        setTransactionState({
          kind: 'success',
          hash: pending.hash,
          message: 'Cobro confirmado y calendario actualizado.',
        });
      } else {
        setPendingTransaction(pending);
        setTransactionState({
          kind: 'pending',
          hash: pending.hash,
          message: pending.receiptConfirmed
            ? 'Cobro confirmado en la cadena. El calendario aún no refleja el cobro; compruébalo de nuevo sin firmar otra vez.'
            : 'Cobro enviado. La confirmación aún no llega; compruébalo sin firmar otra vez.',
        });
      }
    } catch (reason) {
      if (isTransactionRefreshAborted(reason) || (reason instanceof Error && reason.message === 'WALLET_CONTEXT_CHANGED')) return;
      // The chain receipt remains authoritative when a read provider is delayed.
    } finally {
      if (refreshAbortRef.current === controller) refreshAbortRef.current = null;
    }
  }

  async function recheckPendingClaim() {
    const pending = pendingTransactionRef.current;
    if (!pending || !publicClient || transactionState.kind === 'confirming') return;
    const operationId = pending.operationId;
    if (!operationIsCurrent(operationId) || pendingTransactionRef.current !== pending) return;
    try {
      assertLiveContext(pending.wallet, pending.chainId);
    } catch {
      return;
    }

    if (pending.receiptConfirmed) {
      if (!operationIsCurrent(operationId) || pendingTransactionRef.current !== pending) return;
      setPendingTransaction(pending);
      setTransactionState({
        kind: 'pending',
        hash: pending.hash,
        message: 'Cobro confirmado en la cadena. Comprobando el calendario sin firmar otra vez…',
      });
      void refreshVestingReads(pending);
      return;
    }

    setTransactionState({ kind: 'confirming', hash: pending.hash });
    let receiptConfirmed = false;
    let confirmedPending: PendingVestingTransaction | null = null;
    try {
      const confirmed = await waitForConfirmedEvmTransaction(publicClient, pending.hash);
      const receipt = confirmed.receipt;
      if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
      receiptConfirmed = true;
      confirmedPending = {
        ...pending,
        hash: confirmed.hash,
        receiptConfirmed: true,
        baselineReleased: pending.baselineReleased,
      };
      assertLiveContext(pending.wallet, pending.chainId);
      if (!operationIsCurrent(operationId) || pendingTransactionRef.current !== pending) return;
      setClaimTxHash(confirmed.hash);
      pendingTransactionRef.current = confirmedPending;
      setPendingTransaction(confirmedPending);
      setTransactionState({
        kind: 'pending',
        hash: confirmed.hash,
        message: 'Cobro confirmado en la cadena. El calendario aún no refleja el cobro; compruébalo de nuevo sin firmar otra vez.',
      });
      window.dispatchEvent(new CustomEvent('cukies:vesting:refresh', { detail: { hash: confirmed.hash } }));
      void refreshVestingReads(confirmedPending);
    } catch (reason) {
      if (!mountedRef.current) return;
      if (!isLiveContext(pending.wallet, pending.chainId) || !operationIsCurrent(operationId) || pendingTransactionRef.current !== pending) return;
      if (reason instanceof Error && reason.message === 'TRANSACTION_REVERTED') {
        pendingTransactionRef.current = null;
        setPendingTransaction(null);
        setClaimTxHash(null);
        setTransactionState({ kind: 'error', message: 'El cobro fue revertido. Puedes volver a intentarlo.' });
      } else if (reason instanceof TransactionReplacementPendingError) {
        const updated = { ...pending, hash: reason.hash };
        pendingTransactionRef.current = updated;
        setPendingTransaction(updated);
        setTransactionState({ kind: 'pending', hash: reason.hash, message: 'La wallet actualizó la transacción; sigue pendiente. Puedes comprobarla sin firmar otra vez.' });
      } else if (reason instanceof TransactionReplacementError) {
        pendingTransactionRef.current = null;
        setPendingTransaction(null);
        setClaimTxHash(null);
        setTransactionState({
          kind: 'error',
          message: reason.reason === 'cancelled'
            ? 'La transacción fue cancelada en la wallet. No se ha cobrado ningún vesting.'
            : 'La transacción fue reemplazada por otra operación. No se ha cobrado ningún vesting.',
        });
      } else {
        const updated = confirmedPending ?? pending;
        pendingTransactionRef.current = updated;
        setPendingTransaction(updated);
        setTransactionState({
          kind: 'pending',
          hash: updated.hash,
          message: receiptConfirmed
            ? 'Cobro confirmado en la cadena. El calendario aún no refleja el cobro; compruébalo de nuevo sin firmar otra vez.'
            : 'El cobro sigue pendiente. Puedes volver a comprobarlo sin firmar otra vez.',
        });
      }
    }
  }

  async function claimAll() {
    if (!contractAddress || !publicClient || !address || chainId !== ukiSaleContracts.chainId || pendingBelongsToCurrent()) return;
    const operationId = operationGenerationRef.current + 1;
    operationGenerationRef.current = operationId;
    const expectedAddress = address;
    const expectedChainId = ukiSaleContracts.chainId;
    const baselineReleased = releasedAmount;
    let submittedHash: `0x${string}` | null = null;
    let receiptConfirmed = false;
    try {
      assertLiveContext(expectedAddress, expectedChainId);
      setTransactionState({ kind: 'confirming' });
      const hash = await writeContractAsync({
        chainId: expectedChainId,
        address: contractAddress,
        abi: vestingVaultAbi,
        functionName: 'releaseAll',
      });
      submittedHash = hash;
      assertLiveContext(expectedAddress, expectedChainId);
      if (!operationIsCurrent(operationId)) return;
      setClaimTxHash(hash);
      setTransactionState({ kind: 'confirming', hash });
      let confirmedHash = hash;
      let receipt: { status: unknown; transactionHash?: string };
      try {
        const confirmed = await waitForConfirmedEvmTransaction(publicClient, hash);
        receipt = confirmed.receipt;
        confirmedHash = confirmed.hash;
        submittedHash = confirmedHash;
      } catch (reason) {
        if (reason instanceof TransactionReplacementError || reason instanceof TransactionReplacementPendingError) throw reason;
        if (!isLiveContext(expectedAddress, expectedChainId) || !operationIsCurrent(operationId)) throw new Error('WALLET_CONTEXT_CHANGED');
        const pending = { operationId, hash, wallet: expectedAddress, chainId: expectedChainId, baselineReleased } satisfies PendingVestingTransaction;
        pendingTransactionRef.current = pending;
        if (mountedRef.current) {
          setPendingTransaction(pending);
          setTransactionState({ kind: 'pending', hash, message: 'Cobro enviado. La confirmación aún no llega; compruébalo sin firmar otra vez.' });
        }
        return;
      }
      if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
      receiptConfirmed = true;
      assertLiveContext(expectedAddress, expectedChainId);
      if (!operationIsCurrent(operationId)) return;
      setClaimTxHash(confirmedHash);
      const pending = {
        operationId,
        hash: confirmedHash,
        wallet: expectedAddress,
        chainId: expectedChainId,
        receiptConfirmed: true,
        baselineReleased,
      } satisfies PendingVestingTransaction;
      pendingTransactionRef.current = pending;
      setPendingTransaction(pending);
      setTransactionState({
        kind: 'pending',
        hash: confirmedHash,
        message: 'Cobro confirmado en la cadena. El calendario aún no refleja el cobro; compruébalo de nuevo sin firmar otra vez.',
      });
      window.dispatchEvent(new CustomEvent('cukies:vesting:refresh', { detail: { hash: confirmedHash } }));
      void refreshVestingReads(pending);
    } catch (reason) {
      if (!mountedRef.current) return;
      if (reason instanceof Error && reason.message === 'WALLET_CONTEXT_CHANGED') {
        if (submittedHash && operationIsCurrent(operationId)) {
          const pending = {
            operationId,
            hash: submittedHash,
            wallet: expectedAddress,
            chainId: expectedChainId,
            receiptConfirmed,
            baselineReleased,
          } satisfies PendingVestingTransaction;
          pendingTransactionRef.current = pending;
          if (isLiveContext(expectedAddress, expectedChainId)) {
            setPendingTransaction(pending);
            setTransactionState({
              kind: 'pending',
              hash: submittedHash,
              message: receiptConfirmed
                ? 'Cobro confirmado en la cadena. El calendario aún no refleja el cobro; compruébalo de nuevo sin firmar otra vez.'
                : 'Cobro enviado. La confirmación aún no llega; compruébalo sin firmar otra vez.',
            });
          }
        }
      } else if (!operationIsCurrent(operationId) || !isLiveContext(expectedAddress, expectedChainId)) {
        if (reason instanceof TransactionReplacementPendingError && operationIsCurrent(operationId)) {
          pendingTransactionRef.current = {
            operationId,
            hash: reason.hash,
            wallet: expectedAddress,
            chainId: expectedChainId,
            baselineReleased,
          };
        }
        return;
      } else if (reason instanceof Error && reason.message === 'TRANSACTION_REVERTED') {
        pendingTransactionRef.current = null;
        setPendingTransaction(null);
        setClaimTxHash(null);
        setTransactionState({ kind: 'error', message: 'El cobro fue revertido. Puedes volver a intentarlo.' });
      } else if (reason instanceof TransactionReplacementPendingError) {
        const pending = { operationId, hash: reason.hash, wallet: expectedAddress, chainId: expectedChainId, baselineReleased } satisfies PendingVestingTransaction;
        pendingTransactionRef.current = pending;
        setPendingTransaction(pending);
        setTransactionState({ kind: 'pending', hash: reason.hash, message: 'La wallet actualizó la transacción; sigue pendiente. Puedes comprobarla sin firmar otra vez.' });
      } else if (reason instanceof TransactionReplacementError) {
        pendingTransactionRef.current = null;
        setPendingTransaction(null);
        setClaimTxHash(null);
        setTransactionState({
          kind: 'error',
          message: reason.reason === 'cancelled'
            ? 'La transacción fue cancelada en la wallet. No se ha cobrado ningún vesting.'
            : 'La transacción fue reemplazada por otra operación. No se ha cobrado ningún vesting.',
        });
      } else {
        setTransactionState({ kind: 'error', message: 'No se pudo enviar el cobro. Comprueba la wallet y vuelve a intentarlo.' });
      }
    }
  }

  function prepareVestingNetwork() {
    if (requestWallet === FALLBACK_COORDINATOR.requestWallet) {
      switchChain({ chainId: ukiSaleContracts.chainId });
      return;
    }
    void requestWallet({
      kind: 'evm',
      targetChainId: ukiSaleContracts.chainId as 56 | 97,
      reason: 'Cambia la wallet a la red BSC del vesting antes de firmar el cobro.',
    }).catch(() => {
      // El coordinador mantiene el aviso de wallet/red; no abrimos una firma aquí.
    });
  }

  return (
    <div className="uki-theme min-h-full w-full overflow-hidden text-[var(--uki-cream)]">
      <section className="relative z-[2] w-full pb-6">
        <div className="relative overflow-hidden rounded-[16px] border border-[var(--uki-lilac)]/20 bg-[#070817]/90 p-5 shadow-[0_0_52px_rgba(228,92,255,0.12)] sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(228,92,255,0.20),transparent_24rem)]" aria-hidden="true" />
          <div className="relative grid gap-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-end">
            <div>
              <p className="uki-launch-badge inline-flex items-center gap-2">
                <LockKeyhole className="h-3.5 w-3.5" />
                Tus UKI
              </p>
              <h1 className="mt-5 max-w-3xl font-headline text-4xl font-black uppercase leading-[0.95] text-[var(--uki-cream)] sm:text-6xl">
                Tu vesting
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">
                Consulta cuánto tienes asignado, qué parte sigue bloqueada y cuántos UKI puedes enviar ahora a tu wallet.
              </p>
              <p className="mt-6 text-sm font-black text-[var(--uki-lilac)]">
                {isConnected ? `Wallet ${formatShortAddress(address)}` : 'Conecta tu wallet para consultar tu posición'}
              </p>
            </div>

            <div className="rounded-[14px] border border-[var(--uki-lilac)]/25 bg-[#0d0b24]/82 p-5 shadow-[0_0_34px_rgba(228,92,255,0.1)]">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-[var(--uki-lilac)]" />
                <p className="font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">Disponible ahora</p>
              </div>
              <p className="mt-4 font-headline text-4xl font-black leading-none text-[var(--uki-cream)]">{formatToken(claimableAmount)} UKI</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                {hasPosition
                  ? 'Esta es la cantidad que puedes reclamar con la wallet conectada.'
                  : 'Cuando tengas una asignación y se liberen UKI, aparecerán aquí.'}
              </p>
              {hasPosition ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Inicio</p>
                    <p className="mt-1 font-headline text-base font-black text-[var(--uki-cream)]">{vestingStartLabel}</p>
                  </div>
                  <div className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Final</p>
                    <p className="mt-1 font-headline text-base font-black text-[var(--uki-cream)]">{vestingEndLabel}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-5 rounded-[10px] border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
                  Sin asignación personal: no hay un calendario que mostrar para esta wallet.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-[2] w-full pb-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[12px] border border-[var(--uki-lilac)]/18 bg-[#070817]/86 p-4 shadow-[0_0_28px_rgba(228,92,255,0.07)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-muted)]">{metric.label}</span>
                <metric.icon className="h-4 w-4 text-[var(--uki-lilac)]" />
              </div>
              <div className="mt-3 font-headline text-2xl font-black text-[var(--uki-cream)]">{metric.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-[2] w-full pb-14">
        <div className="rounded-[14px] border border-[var(--uki-lilac)]/22 bg-[#070817]/90 p-5 shadow-[0_0_44px_rgba(228,92,255,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">Mi calendario</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
                {isConnected ? formatShortAddress(address) : 'Conecta una wallet para consultar tu calendario.'}
              </p>
            </div>
            <Button
              onClick={chainId !== ukiSaleContracts.chainId ? prepareVestingNetwork : claimAll}
              disabled={!isConfigured || !isConnected || switchingChain || evmWallet.isConnecting || transactionState.kind === 'confirming' || transactionState.kind === 'pending' || Boolean(pendingTransaction && pendingBelongsToCurrent()) || (chainId === ukiSaleContracts.chainId && (claimableAmount === undefined || claimableAmount === BigInt(0)))}
              className="h-11 rounded-[8px] border border-[var(--uki-lilac)]/60 bg-[var(--uki-lilac)] px-5 font-headline text-xs font-black uppercase tracking-[0.1em] text-white shadow-[0_0_18px_rgba(228,92,255,0.22)] hover:bg-[#f19bff]"
            >
              {switchingChain || evmWallet.isConnecting
                ? 'Cambiando red…'
                : chainId !== ukiSaleContracts.chainId
                  ? 'Cambiar de red para cobrar'
                  : transactionState.kind === 'confirming' ? 'Confirmando...' : transactionState.kind === 'pending' ? 'Cobro pendiente' : 'Reclamar UKI disponible'}
            </Button>
          </div>

          {claimTxHash ? (
            <a
              href={getBscScanTxUrl(claimTxHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-[8px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 px-3 py-2 text-sm font-bold text-[var(--uki-lilac)] hover:bg-[var(--uki-lilac)]/15"
            >
              Transacción de reclamación enviada
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}

          {chainId !== ukiSaleContracts.chainId && isConnected ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-amber-100">
              Cambia a la red BSC configurada para reclamar tu vesting.
            </p>
          ) : null}
          {transactionState.kind === 'pending' ? (
            <div className="mt-3 flex flex-col gap-2 rounded-[10px] border border-amber-200/25 bg-amber-200/[0.07] p-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <span>{transactionState.message}</span>
              <Button type="button" variant="outline" onClick={() => void recheckPendingClaim()} className="shrink-0 border-amber-200/30 text-amber-100">
                Comprobar cobro
              </Button>
            </div>
          ) : null}
          {transactionState.kind === 'error' ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-amber-100">{transactionState.message}</p>
          ) : null}
          {transactionState.kind === 'success' ? (
            <p role="status" className="mt-3 text-sm font-semibold text-emerald-100">{transactionState.message ?? 'Cobro confirmado en la cadena. El calendario se actualizará cuando la lectura esté disponible.'}</p>
          ) : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-[220px_1fr]">
            <div className="flex aspect-square items-center justify-center rounded-[14px] border border-[var(--uki-lilac)]/22 bg-[var(--uki-lilac)]/6">
              <div className="text-center">
                <div className="font-headline text-5xl font-black text-[var(--uki-lilac)]">{formatPercent(unlockProgress)}%</div>
                <div className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--uki-muted)]">liberado</div>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-5">
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[var(--uki-lilac)]" style={{ width: `${unlockProgress === undefined ? 0 : Math.min(unlockProgress, 100)}%` }} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Total asignado</div>
                  <div className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">{formatToken(totalAmount)} UKI</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Disponible</div>
                  <div className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">{formatToken(claimableAmount)} UKI</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Reclamado</div>
                  <div className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">{formatToken(releasedAmount)} UKI</div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-[10px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 px-3 py-2 text-sm font-semibold text-[var(--uki-text)]">
                <CalendarClock className="h-4 w-4" />
                Periodo de liberación: {vestingStartLabel} - {vestingEndLabel}
              </div>
            </div>
          </div>

          {hasPosition ? (
            <p className="mt-5 rounded-[10px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 p-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Esta cartera tiene <strong className="text-[var(--uki-cream)]">{formatToken(totalAmount)} UKI</strong> asignados. Los <strong className="text-[var(--uki-cream)]">{formatToken(claimableAmount)} UKI</strong> disponibles ahora son solo la parte reclamable según el calendario lineal.
            </p>
          ) : isConfigured && isConnected && !hasWalletReadError ? (
            <p className="mt-5 rounded-[10px] border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              No hay una asignación de vesting para esta wallet. Cuando exista una asignación, mostraremos aquí su calendario y la parte reclamable.
            </p>
          ) : null}
        </div>

        <aside className="mt-6">
          <details className="group rounded-[14px] border border-[var(--uki-lilac)]/18 bg-[#0d0b24]/82 p-5 shadow-[0_0_36px_rgba(228,92,255,0.07)]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-headline text-xl font-black uppercase text-[var(--uki-cream)] marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)]">
              <span>Cómo funciona tu vesting</span>
              <span className="inline-flex items-center gap-2 text-xs font-semibold normal-case tracking-normal text-[var(--uki-muted)]">
                3 pasos
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>
            <div className="mt-4 space-y-3">
              {[
                ['1', 'Asignación registrada', 'Los UKI sujetos a vesting quedan asociados a tu wallet.'],
                ['2', 'Liberación gradual', 'La parte disponible aumenta según tu calendario.'],
                ['3', 'Cobro en tu wallet', 'Cuando haya UKI disponibles, puedes reclamarlos desde esta pantalla.'],
              ].map(([step, title, body]) => (
                <div key={step} className="grid grid-cols-[2rem_1fr] gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[var(--uki-lilac)] text-sm font-black text-white">{step}</div>
                  <div>
                    <p className="font-bold text-[var(--uki-cream)]">{title}</p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </aside>
      </section>

      {hasVestingReadError ? (
        <section className="relative z-[2] w-full pb-6">
          <div className="rounded-[12px] border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-100">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold text-red-50">Los datos de vesting no están disponibles ahora mismo.</p>
                <p className="mt-1 text-red-100/80">Vuelve a intentarlo en unos instantes. No mostraremos cantidades parciales como si fueran definitivas.</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!isConfigured ? (
        <section className="relative z-[2] w-full pb-6">
          <div className="rounded-[12px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 p-4 text-sm text-[var(--uki-text)]">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold text-[var(--uki-cream)]">El vesting no está disponible ahora mismo.</p>
                <p className="mt-1 text-[var(--uki-muted)]">La consulta y el cobro permanecerán desactivados hasta que el servicio esté disponible.</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
