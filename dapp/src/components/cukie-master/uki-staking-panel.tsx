'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { formatUnits, parseUnits, type Address } from 'viem';
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { Panel } from '@/components/landing/primitives';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from '@/components/landing/sale-config';
import type { UkiRoutePreview } from '@/components/cukie-master/types';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useToast } from '@/hooks/use-toast';
import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';
import {
  erc20Abi,
  getBscScanTxUrl,
  ukiSaleContracts,
  ukiStakingAbi,
} from '@/lib/contracts/uki-sale';
import { useAuth } from '@/providers/auth-provider';

const TOKEN_DECIMALS = 18;
const DEFAULT_AMOUNT = '2000';
const MAX_UKI_ROUTE_SLOTS = BigInt(5);

type StakingOperation = 'stake' | 'unstake';
type TransactionAction = 'approve' | 'stake' | 'unstake' | null;

function parseTokenAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = parseUnits(trimmed, TOKEN_DECIMALS);
    return parsed > BigInt(0) ? parsed : null;
  } catch {
    return null;
  }
}

function formatTokenAmount(value?: bigint, maximumFractionDigits = 4) {
  if (value === undefined) return '--';
  const numeric = Number(formatUnits(value, TOKEN_DECIMALS));
  if (!Number.isFinite(numeric)) return '--';
  return numeric.toLocaleString('es-ES', { maximumFractionDigits });
}

function formatRawTokenAmount(value?: string) {
  if (value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) return '--';
  try {
    return formatTokenAmount(BigInt(value));
  } catch {
    return '--';
  }
}

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function UkiStakingPanel({
  testnetOnly = false,
  routePreview = null,
}: {
  testnetOnly?: boolean;
  routePreview?: UkiRoutePreview | null;
}) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContract, data: txHash, error, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });
  const { toast } = useToast();
  const {
    user,
    isLoading: authLoading,
    isWaitingForApproval,
    walletType,
  } = useAuth();
  const {
    status: competitionStatus,
    isLoading: isCompetitionLoading,
    error: competitionError,
    reload: reloadCompetition,
  } = useTreasureHuntCompetitionOverview({ includeLeaderboard: false });
  const hasMounted = useHasMounted();
  const handledReceiptHashRef = useRef<string | null>(null);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [operation, setOperation] = useState<StakingOperation>('stake');
  const [lastAction, setLastAction] = useState<TransactionAction>(null);
  const [lastCompletedAction, setLastCompletedAction] = useState<TransactionAction>(null);
  const [approvedAmount, setApprovedAmount] = useState<bigint | null>(null);
  const [isRetryingReads, setIsRetryingReads] = useState(false);

  const tokenAddress = ukiSaleContracts.ukiTokenAddress as Address | undefined;
  const stakingAddress = ukiSaleContracts.ukiStakingAddress as Address | undefined;
  const parsedAmount = useMemo(() => parseTokenAmount(amount), [amount]);
  const isWrongChain = Boolean(hasMounted && isConnected && chainId !== UKI_PRESALE_CHAIN_ID);
  const isUnsafeStagingChain = testnetOnly && UKI_PRESALE_CHAIN_ID !== 97;
  const isAuthenticatedEvm = Boolean(
    walletType === 'evm' && sameAddress(user?.walletAddress, address),
  );
  const hasContractConfig = Boolean(tokenAddress && stakingAddress);
  const publicReadsEnabled = Boolean(hasContractConfig && !isUnsafeStagingChain);
  const walletReadsEnabled = Boolean(address && hasContractConfig && !isUnsafeStagingChain);

  const {
    data: stakingToken,
    isError: isStakingTokenError,
    refetch: refetchStakingToken,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: stakingAddress,
    abi: ukiStakingAbi,
    functionName: 'ukiToken',
    query: { enabled: publicReadsEnabled, staleTime: 0 },
  });
  const {
    data: isPaused,
    isError: isPausedError,
    refetch: refetchPaused,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: stakingAddress,
    abi: ukiStakingAbi,
    functionName: 'paused',
    query: { enabled: publicReadsEnabled, staleTime: 0 },
  });
  const {
    data: liquidBalance,
    isError: isLiquidBalanceError,
    refetch: refetchLiquidBalance,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: walletReadsEnabled, staleTime: 0 },
  });
  const {
    data: allowance,
    isError: isAllowanceError,
    refetch: refetchAllowance,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && stakingAddress ? [address, stakingAddress] : undefined,
    query: { enabled: walletReadsEnabled, staleTime: 0 },
  });
  const {
    data: stakedBalance,
    isError: isStakedBalanceError,
    refetch: refetchStakedBalance,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: stakingAddress,
    abi: ukiStakingAbi,
    functionName: 'stakedBalance',
    args: address ? [address] : undefined,
    query: { enabled: walletReadsEnabled, staleTime: 0 },
  });
  const protocolReadsReady = stakingToken !== undefined && (
    operation === 'unstake' || isPaused !== undefined
  );
  const tokenMatches = sameAddress(stakingToken, tokenAddress);
  const protocolReadFailed = isStakingTokenError ||
    (operation === 'stake' && isPausedError) ||
    (stakingToken !== undefined && !tokenMatches);
  const walletReadFailed = operation === 'stake'
    ? isLiquidBalanceError || isAllowanceError
    : isStakedBalanceError;
  const readRequestFailed = isStakingTokenError || isPausedError ||
    isLiquidBalanceError || isAllowanceError || isStakedBalanceError;
  const effectiveAllowance = approvedAmount && (!allowance || approvedAmount > allowance)
    ? approvedAmount
    : allowance;
  const availableBalance = operation === 'stake' ? liquidBalance : stakedBalance;
  const hasEnoughBalance = Boolean(
    parsedAmount && availableBalance !== undefined && availableBalance >= parsedAmount,
  );
  const needsApproval = Boolean(
    operation === 'stake' && parsedAmount && effectiveAllowance !== undefined && effectiveAllowance < parsedAmount,
  );
  const isBusy = isPending || isConfirming;
  const canTransact = Boolean(
    hasMounted &&
    isConnected &&
    !isWrongChain &&
    !isUnsafeStagingChain &&
    !authLoading &&
    !isWaitingForApproval &&
    isAuthenticatedEvm &&
    hasContractConfig &&
    protocolReadsReady &&
    tokenMatches &&
    !walletReadFailed &&
    (operation === 'stake'
      ? liquidBalance !== undefined && allowance !== undefined
      : stakedBalance !== undefined) &&
    parsedAmount &&
    hasEnoughBalance &&
    !(operation === 'stake' && isPaused) &&
    !isBusy,
  );
  const txUrl = txHash ? getBscScanTxUrl(txHash) : null;
  const outcomePreview = useMemo(() => buildOutcomePreview({
    operation,
    parsedAmount,
    stakedBalance,
    routePreview,
  }), [operation, parsedAmount, routePreview, stakedBalance]);
  const competitionEligibility = competitionStatus?.eligibility ?? null;
  const isCompetitionEligibilityReady = Boolean(
    isAuthenticatedEvm && competitionEligibility?.ready,
  );
  const availableAttempts = isCompetitionEligibilityReady && competitionEligibility
    ? competitionEligibility.attemptsRemaining.toLocaleString('es-ES')
    : '—';
  const stakePerAttempt = formatRawTokenAmount(
    competitionStatus?.campaign?.stakePerAttemptRaw,
  );

  useEffect(() => {
    setApprovedAmount(null);
    setLastAction(null);
    setLastCompletedAction(null);
    handledReceiptHashRef.current = null;
  }, [address, stakingAddress, tokenAddress]);

  useEffect(() => {
    if (!isSuccess || !txHash || handledReceiptHashRef.current === txHash) return;
    handledReceiptHashRef.current = txHash;

    void refetchAllowance();
    void refetchLiquidBalance();
    void refetchStakedBalance();
    void refetchPaused();
    void refetchStakingToken();

    if (lastAction === 'approve' && parsedAmount) {
      setApprovedAmount(parsedAmount);
      setLastCompletedAction('approve');
      toast({
        title: 'Permiso UKI confirmado',
        description: 'Ahora puedes confirmar el staking con una segunda firma.',
      });
    } else if (lastAction === 'stake') {
      setAmount(DEFAULT_AMOUNT);
      setApprovedAmount(null);
      setLastCompletedAction('stake');
      window.dispatchEvent(new Event('cukies:cukie-master:refresh'));
      window.dispatchEvent(new Event('cukies:treasure-hunt:competition:refresh'));
      toast({
        title: 'Staking confirmado',
        description: 'Tus UKI ya constan en el contrato de staking. Estamos actualizando tus partidas del torneo.',
      });
    } else if (lastAction === 'unstake') {
      setAmount(DEFAULT_AMOUNT);
      setLastCompletedAction('unstake');
      window.dispatchEvent(new Event('cukies:cukie-master:refresh'));
      window.dispatchEvent(new Event('cukies:treasure-hunt:competition:refresh'));
      toast({
        title: 'Retirada confirmada',
        description: 'Los UKI retirados han vuelto a tu wallet.',
      });
    }
    setLastAction(null);
  }, [
    isSuccess,
    lastAction,
    parsedAmount,
    refetchAllowance,
    refetchLiquidBalance,
    refetchPaused,
    refetchStakedBalance,
    refetchStakingToken,
    toast,
    txHash,
  ]);

  useEffect(() => {
    if (!error) return;
    setLastAction(null);
    toast({
      title: 'Transacción no completada',
      description: error.message,
      variant: 'destructive',
    });
  }, [error, toast]);

  function selectOperation(nextOperation: StakingOperation) {
    setOperation(nextOperation);
    setAmount(DEFAULT_AMOUNT);
    setLastAction(null);
    setLastCompletedAction(null);
    reset();
  }

  function useMaximumBalance() {
    if (availableBalance === undefined) return;
    setAmount(formatUnits(availableBalance, TOKEN_DECIMALS));
  }

  function selectQuickAmount(value: string) {
    setAmount(value);
    setLastCompletedAction(null);
  }

  async function retryContractReads() {
    setIsRetryingReads(true);
    try {
      await Promise.allSettled([
        refetchStakingToken(),
        refetchPaused(),
        ...(address ? [
          refetchLiquidBalance(),
          refetchAllowance(),
          refetchStakedBalance(),
        ] : []),
      ]);
    } finally {
      setIsRetryingReads(false);
    }
  }

  function switchToStagingNetwork() {
    switchChain(
      { chainId: UKI_PRESALE_CHAIN_ID },
      {
        onError: () => {
          toast({
            title: 'No se pudo cambiar la red',
            description: `Abre tu wallet y acepta el cambio a ${UKI_PRESALE_CHAIN_LABEL}.`,
            variant: 'destructive',
          });
        },
      },
    );
  }

  function handleSubmit() {
    if (!tokenAddress || !stakingAddress || !parsedAmount || !canTransact) return;
    reset();
    handledReceiptHashRef.current = null;
    setLastCompletedAction(null);

    if (needsApproval) {
      setLastAction('approve');
      writeContract({
        chainId: UKI_PRESALE_CHAIN_ID,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [stakingAddress, parsedAmount],
      });
      return;
    }

    setLastAction(operation);
    writeContract({
      chainId: UKI_PRESALE_CHAIN_ID,
      address: stakingAddress,
      abi: ukiStakingAbi,
      functionName: operation,
      args: [parsedAmount],
    });
  }

  const actionLabel = lastAction === 'approve' && isBusy
    ? 'Confirmando permiso'
    : lastAction === 'stake' && isBusy
      ? 'Confirmando staking'
      : lastAction === 'unstake' && isBusy
        ? 'Confirmando retirada'
        : needsApproval
          ? 'Aprobar UKI exactos'
          : operation === 'stake'
            ? 'Hacer staking'
            : 'Retirar UKI';

  return (
    <section id="uki-staking" className="uki-container relative z-[2] min-w-0 scroll-mt-28 pb-8">
      <Panel className="min-w-0" innerClassName="min-w-0 p-5 sm:p-7">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Gestiona tus UKI · {UKI_PRESALE_CHAIN_LABEL}</p>
            <h2 className="mt-2 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cream)]">
              Staking de UKI
            </h2>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Deposita o retira UKI desde el contrato de staking.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <BalanceCard label="UKI en wallet" value={formatTokenAmount(liquidBalance)} />
              <BalanceCard label="UKI en staking" value={formatTokenAmount(stakedBalance)} />
              <BalanceCard
                label="Requisito Cukie Master"
                value={formatRawTokenAmount(routePreview?.currentRequirementRaw)}
              />
            </div>

            <div className="mt-4 rounded-[8px] border border-[var(--uki-cyan-border)] bg-black/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
                    Torneo Lanzamiento UKI
                  </p>
                  <p className="mt-1 text-sm font-black leading-relaxed text-[var(--uki-cream)]">
                    Partidas disponibles
                  </p>
                </div>
                <span
                  aria-label="Partidas disponibles"
                  className="font-headline text-3xl font-black leading-none text-[var(--uki-cyan)]"
                >
                  {isCompetitionLoading && !competitionStatus ? '···' : availableAttempts}
                </span>
              </div>

              {isCompetitionEligibilityReady && competitionEligibility ? (
                <p className="mt-3 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                  Concedidas por el backend: {competitionEligibility.attemptsGranted.toLocaleString('es-ES')}
                  {' · '}Usadas: {competitionEligibility.attemptsUsed.toLocaleString('es-ES')}
                </p>
              ) : null}

              {isCompetitionEligibilityReady && competitionEligibility?.disqualified ? (
                <p className="mt-3 text-xs font-bold leading-relaxed text-amber-300">
                  Esta wallet está descalificada del torneo y no puede iniciar nuevas partidas.
                </p>
              ) : isAuthenticatedEvm && !competitionEligibility?.ready && competitionEligibility ? (
                <p className="mt-3 text-xs font-semibold leading-relaxed text-amber-200">
                  El indexador todavía no ha confirmado el estado de esta wallet.
                </p>
              ) : !isCompetitionLoading && (!isAuthenticatedEvm || !competitionEligibility) && !competitionError ? (
                <p className="mt-3 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                  Conecta y firma esta wallet para consultar sus partidas.
                </p>
              ) : null}

              {competitionError ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p className="text-xs font-semibold leading-relaxed text-amber-200">
                    No se ha podido actualizar el cupo del torneo.
                  </p>
                  <button
                    type="button"
                    onClick={reloadCompetition}
                    className="inline-flex min-h-8 items-center gap-2 rounded-[8px] border border-white/15 px-3 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-cream)] transition hover:border-[var(--uki-cyan-border)]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reintentar cupo
                  </button>
                </div>
              ) : null}

              <p className="mt-3 border-t border-white/10 pt-3 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                {stakePerAttempt === '--'
                  ? 'El backend calcula el cupo con los UKI completos en staking y descuenta las partidas utilizadas.'
                  : `El backend concede 1 partida por cada ${stakePerAttempt} UKI completos en staking y descuenta las ya utilizadas.`}
              </p>
            </div>

            <p className="mt-3 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
              Cukie Master se calcula por separado: también puede incluir UKI de preventa pendientes.
            </p>
          </div>

          <div className="min-w-0 rounded-[10px] border border-white/10 bg-black/25 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Operación de staking">
              <OperationButton
                active={operation === 'stake'}
                label="Depositar"
                icon={<ArrowDownToLine className="h-4 w-4" />}
                onClick={() => selectOperation('stake')}
              />
              <OperationButton
                active={operation === 'unstake'}
                label="Retirar"
                icon={<ArrowUpFromLine className="h-4 w-4" />}
                onClick={() => selectOperation('unstake')}
              />
            </div>

            <label htmlFor="uki-staking-amount" className="mt-5 block text-xs font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
              Cantidad de UKI
            </label>
            <div className="mt-2 flex min-w-0 overflow-hidden rounded-[8px] border border-white/15 bg-[#02090d] focus-within:border-[var(--uki-cyan)]">
              <input
                id="uki-staking-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                disabled={isBusy}
                aria-describedby="uki-staking-available"
                aria-invalid={Boolean(!parsedAmount || (availableBalance !== undefined && !hasEnoughBalance))}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setLastCompletedAction(null);
                }}
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-lg font-black text-[var(--uki-cream)] outline-none disabled:opacity-50"
              />
              <span className="flex shrink-0 items-center border-l border-white/10 px-4 text-xs font-black uppercase text-[var(--uki-muted)]">UKI</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Cantidades rápidas">
              <QuickAmountButton label="2.000" onClick={() => selectQuickAmount('2000')} disabled={isBusy} />
              <QuickAmountButton label="20.000" onClick={() => selectQuickAmount('20000')} disabled={isBusy} />
              <QuickAmountButton label="Máximo" onClick={useMaximumBalance} disabled={availableBalance === undefined || isBusy} />
            </div>
            <p id="uki-staking-available" className="mt-2 text-right text-xs font-semibold text-[var(--uki-muted)]">
              Disponible: {formatTokenAmount(availableBalance)} UKI
            </p>

            {outcomePreview ? (
              <div className="mt-4 rounded-[8px] border border-[var(--uki-cyan-border)] bg-[var(--uki-cyan-soft)] p-4">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Resultado estimado</p>
                <p className="mt-2 text-sm font-black leading-relaxed text-[var(--uki-cream)]">{outcomePreview.summary}</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">{outcomePreview.detail}</p>
              </div>
            ) : null}

            {operation === 'unstake' ? (
              <InlineWarning text="Una retirada confirmada durante la campaña descalifica esta wallet, aunque vuelvas a depositar después." />
            ) : null}

            {isUnsafeStagingChain ? (
              <InlineWarning text="Configuración bloqueada: el entorno staging exige BNB Smart Chain Testnet (chain 97)." />
            ) : !hasContractConfig ? (
              <InlineWarning text="El contrato de staking no está configurado para este entorno." />
            ) : protocolReadFailed ? (
              <InlineWarning text="No se ha podido verificar que token y contrato coincidan. Las operaciones están bloqueadas." />
            ) : operation === 'stake' && isPaused ? (
              <InlineWarning text="Los nuevos depósitos están pausados en el contrato. Las retiradas siguen disponibles." />
            ) : walletReadFailed ? (
              <InlineWarning text="No se han podido leer los balances con garantías. No se enviará ninguna transacción." />
            ) : hasMounted && isConnected && !isWrongChain && !authLoading && !isAuthenticatedEvm ? (
              <InlineWarning text={isWaitingForApproval
                ? 'Aprueba el mensaje de acceso en tu wallet.'
                : 'Firma el acceso con esta wallet antes de autorizar o depositar UKI.'} />
            ) : parsedAmount && availableBalance !== undefined && !hasEnoughBalance ? (
              <InlineWarning text={`No tienes suficiente UKI ${operation === 'stake' ? 'líquido' : 'en staking'} para esta operación.`} />
            ) : !parsedAmount ? (
              <InlineWarning text="Introduce una cantidad de UKI mayor que cero." />
            ) : null}

            {readRequestFailed ? (
              <button
                type="button"
                disabled={isRetryingReads}
                onClick={() => void retryContractReads()}
                className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-white/15 px-3 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-cream)] transition hover:border-[var(--uki-cyan-border)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRetryingReads ? 'animate-spin' : ''}`} />
                <span>{isRetryingReads ? 'Reintentando lecturas' : 'Reintentar lecturas'}</span>
              </button>
            ) : null}

            <div className="mt-5">
              {isUnsafeStagingChain ? (
                <button
                  type="button"
                  disabled
                  className="uki-button uki-button-primary w-full justify-center cursor-not-allowed opacity-40"
                >
                  Staging bloqueado por configuración
                </button>
              ) : !hasMounted || !isConnected ? (
                <LandingWalletConnectButton
                  className="w-full justify-center"
                  evmOnly
                  label="Conectar wallet para gestionar staking"
                  compactLabel="Conectar wallet"
                  showCompactText={false}
                />
              ) : isWrongChain ? (
                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={switchToStagingNetwork}
                  className="uki-button uki-button-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>{isSwitching ? 'Cambiando red' : `Cambiar a ${UKI_PRESALE_CHAIN_LABEL}`}</span>
                </button>
              ) : !isAuthenticatedEvm ? (
                <LandingWalletConnectButton
                  className="w-full justify-center"
                  evmOnly
                  label="Firmar wallet"
                  compactLabel="Firmar"
                  showCompactText={false}
                />
              ) : (
                <button
                  type="button"
                  disabled={!canTransact}
                  onClick={handleSubmit}
                  className="uki-button uki-button-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>{actionLabel}</span>
                </button>
              )}
            </div>

            {needsApproval && canTransact ? (
              <p className="mt-3 text-center text-xs font-semibold text-[var(--uki-muted)]">
                Primero autorizas exactamente esta cantidad; después confirmas el staking.
              </p>
            ) : null}

            {isBusy || lastCompletedAction ? (
              <p role="status" aria-live="polite" className="mt-3 text-center text-xs font-semibold text-[var(--uki-muted)]">
                {isConfirming
                  ? `Esperando confirmación en ${UKI_PRESALE_CHAIN_LABEL}…`
                  : lastCompletedAction === 'approve'
                    ? 'Autorización confirmada. Ya puedes depositar.'
                    : lastCompletedAction === 'stake'
                      ? 'Depósito confirmado. Actualizando tu saldo.'
                      : lastCompletedAction === 'unstake'
                        ? 'Retirada confirmada. Actualizando tu saldo.'
                        : 'Abre tu wallet y confirma la operación.'}
              </p>
            ) : null}

            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase text-[var(--uki-cyan)] hover:underline"
              >
                Ver última transacción <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      </Panel>
    </section>
  );
}

function BalanceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/20 p-4">
      <p className="uki-label">{label}</p>
      <p className="mt-2 font-headline text-2xl font-black text-[var(--uki-gold)]">{value}</p>
    </div>
  );
}

function OperationButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border px-4 py-3 text-xs font-black uppercase transition-colors ${
        active
          ? 'border-[var(--uki-cyan)] bg-[var(--uki-cyan)]/10 text-[var(--uki-cyan)]'
          : 'border-white/10 text-[var(--uki-muted)] hover:border-white/25 hover:text-[var(--uki-text)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function QuickAmountButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-[7px] border border-white/10 px-2 text-center text-xs font-black uppercase text-[var(--uki-text)] hover:border-[var(--uki-cyan-border)] hover:text-[var(--uki-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function buildOutcomePreview({
  operation,
  parsedAmount,
  stakedBalance,
  routePreview,
}: {
  operation: StakingOperation;
  parsedAmount: bigint | null;
  stakedBalance?: bigint;
  routePreview: UkiRoutePreview | null;
}) {
  if (!parsedAmount || stakedBalance === undefined || !routePreview) return null;
  if (operation === 'unstake' && parsedAmount > stakedBalance) return null;
  try {
    const requirement = BigInt(routePreview.currentRequirementRaw);
    const presaleLocked = BigInt(routePreview.presaleLockedRaw);
    if (requirement <= BigInt(0)) return null;
    const projectedStaked = operation === 'stake'
      ? stakedBalance + parsedAmount
      : stakedBalance - parsedAmount;
    const totalComputable = presaleLocked + projectedStaked;
    const rawSlots = totalComputable / requirement;
    const slots = rawSlots > MAX_UKI_ROUTE_SLOTS ? MAX_UKI_ROUTE_SLOTS : rawSlots;
    const missingForNextSlot = slots >= MAX_UKI_ROUTE_SLOTS
      ? BigInt(0)
      : ((slots + BigInt(1)) * requirement) - totalComputable;
    return {
      summary: `Tendrías ${formatTokenAmount(projectedStaked)} UKI en staking y ${slots.toString()}/5 Cukie Masters.`,
      detail: operation === 'unstake'
        ? 'Si el torneo ya ha empezado, esta retirada descalificará la wallet.'
        : missingForNextSlot === BigInt(0)
          ? 'Has alcanzado el máximo de 5 Cukie Masters mediante UKI.'
          : `Te faltarían ${formatTokenAmount(missingForNextSlot)} UKI para el siguiente Cukie Master.`,
    };
  } catch {
    return null;
  }
}

function InlineWarning({ text }: { text: string }) {
  return (
    <div role="alert" className="mt-4 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <p className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">{text}</p>
    </div>
  );
}
