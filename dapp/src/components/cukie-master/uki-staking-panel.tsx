'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
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
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useToast } from '@/hooks/use-toast';
import {
  erc20Abi,
  getBscScanTxUrl,
  ukiSaleContracts,
  ukiStakingAbi,
} from '@/lib/contracts/uki-sale';

const TOKEN_DECIMALS = 18;
const DEFAULT_AMOUNT = '20000';

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

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function UkiStakingPanel() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContract, data: txHash, error, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });
  const { toast } = useToast();
  const hasMounted = useHasMounted();
  const handledReceiptHashRef = useRef<string | null>(null);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [operation, setOperation] = useState<StakingOperation>('stake');
  const [lastAction, setLastAction] = useState<TransactionAction>(null);
  const [approvedAmount, setApprovedAmount] = useState<bigint | null>(null);

  const tokenAddress = ukiSaleContracts.ukiTokenAddress as Address | undefined;
  const stakingAddress = ukiSaleContracts.ukiStakingAddress as Address | undefined;
  const parsedAmount = useMemo(() => parseTokenAmount(amount), [amount]);
  const isWrongChain = Boolean(hasMounted && isConnected && chainId !== UKI_PRESALE_CHAIN_ID);
  const hasContractConfig = Boolean(tokenAddress && stakingAddress);
  const publicReadsEnabled = Boolean(hasContractConfig);
  const walletReadsEnabled = Boolean(address && hasContractConfig && !isWrongChain);

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

  useEffect(() => {
    setApprovedAmount(null);
    setLastAction(null);
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
      toast({
        title: 'Permiso UKI confirmado',
        description: 'Ahora puedes confirmar el staking con una segunda firma.',
      });
    } else if (lastAction === 'stake') {
      setAmount(DEFAULT_AMOUNT);
      setApprovedAmount(null);
      toast({
        title: 'Staking confirmado',
        description: 'Tus UKI ya constan en el contrato de Cukie Master.',
      });
    } else if (lastAction === 'unstake') {
      setAmount(DEFAULT_AMOUNT);
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
    reset();
  }

  function useMaximumBalance() {
    if (availableBalance === undefined) return;
    setAmount(formatUnits(availableBalance, TOKEN_DECIMALS));
  }

  function handleSubmit() {
    if (!tokenAddress || !stakingAddress || !parsedAmount || !canTransact) return;
    reset();
    handledReceiptHashRef.current = null;

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
    <section id="uki-staking" className="uki-container relative z-[2] pb-6 pt-2">
      <Panel innerClassName="p-5 sm:p-7">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="uki-label">Contrato activo en testnet</p>
            <h2 className="mt-2 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cream)]">
              Staking de UKI
            </h2>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Deposita UKI en el contrato de Cukie Master o retíralos cuando quieras. La operación
              no genera rentabilidad: se usa para calcular tus cupos y créditos de competición.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <BalanceCard label="UKI en wallet" value={formatTokenAmount(liquidBalance)} />
              <BalanceCard label="UKI en staking" value={formatTokenAmount(stakedBalance)} />
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-[8px] border border-[var(--uki-cyan-border)] bg-black/20 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-cyan)]" />
              <p className="text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
                Red: {UKI_PRESALE_CHAIN_LABEL}. Necesitas tBNB para el gas. El requisito oficial,
                los UKI en vesting y tus cupos aparecen en “Mis cupos Cukie Master”.
              </p>
            </div>
          </div>

          <div className="rounded-[10px] border border-white/10 bg-black/25 p-4 sm:p-5">
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
            <div className="mt-2 flex overflow-hidden rounded-[8px] border border-white/15 bg-[#02090d] focus-within:border-[var(--uki-cyan)]">
              <input
                id="uki-staking-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                disabled={isBusy}
                onChange={(event) => setAmount(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-lg font-black text-[var(--uki-cream)] outline-none disabled:opacity-50"
              />
              <button
                type="button"
                disabled={availableBalance === undefined || isBusy}
                onClick={useMaximumBalance}
                className="border-l border-white/10 px-4 text-xs font-black uppercase text-[var(--uki-cyan)] disabled:opacity-40"
              >
                Máximo
              </button>
            </div>
            <p className="mt-2 text-right text-xs font-semibold text-[var(--uki-muted)]">
              Disponible: {formatTokenAmount(availableBalance)} UKI
            </p>

            {!hasContractConfig ? (
              <InlineWarning text="El contrato de staking no está configurado para este entorno." />
            ) : protocolReadFailed ? (
              <InlineWarning text="No se ha podido verificar que token y contrato coincidan. Las operaciones están bloqueadas." />
            ) : operation === 'stake' && isPaused ? (
              <InlineWarning text="Los nuevos depósitos están pausados en el contrato. Las retiradas siguen disponibles." />
            ) : walletReadFailed ? (
              <InlineWarning text="No se han podido leer los balances con garantías. No se enviará ninguna transacción." />
            ) : parsedAmount && availableBalance !== undefined && !hasEnoughBalance ? (
              <InlineWarning text={`No tienes suficiente UKI ${operation === 'stake' ? 'líquido' : 'en staking'} para esta operación.`} />
            ) : !parsedAmount ? (
              <InlineWarning text="Introduce una cantidad de UKI mayor que cero." />
            ) : null}

            <div className="mt-5">
              {!hasMounted || !isConnected ? (
                <LandingWalletConnectButton
                  className="w-full justify-center"
                  label="Conectar wallet para gestionar staking"
                  compactLabel="Conectar wallet"
                  showCompactText={false}
                />
              ) : isWrongChain ? (
                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={() => switchChain({ chainId: UKI_PRESALE_CHAIN_ID })}
                  className="uki-button uki-button-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>{isSwitching ? 'Cambiando red' : `Cambiar a ${UKI_PRESALE_CHAIN_LABEL}`}</span>
                </button>
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

            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase text-[var(--uki-cyan)] hover:underline"
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
      className={`inline-flex items-center justify-center gap-2 rounded-[7px] border px-4 py-3 text-xs font-black uppercase transition-colors ${
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

function InlineWarning({ text }: { text: string }) {
  return (
    <div role="alert" className="mt-4 flex gap-3 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <p className="text-xs font-semibold leading-relaxed text-[var(--uki-text)]">{text}</p>
    </div>
  );
}
