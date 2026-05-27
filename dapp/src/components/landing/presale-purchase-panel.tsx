'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, ShoppingCart, Users, Wallet, WalletCards } from 'lucide-react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useAccount, useConnect, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { erc20Abi, getBscScanTxUrl, presaleAbi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';

const TOKEN_DECIMALS = 18;
const DEFAULT_AMOUNT = '10';

type PresaleReferralStatus = {
  totalUkiPurchased: number;
  minimumUkiToUnlockLink: number;
  unlockProgress: number;
  referralUnlockedAt: string | null;
  referralMinimumUkiSnapshot: number | null;
  referralCode: string | null;
  referralLink: string | null;
  pendingSponsorCode: string | null;
  pendingSponsorWalletAddress: string | null;
  lockedSponsorWalletAddress: string | null;
  sponsorLockedAt: string | null;
  referralLevel1UkiAmount: number;
  referralLevel2UkiAmount: number;
  referralLevel3UkiAmount: number;
  referralWeightedScore: number;
  levelWeights: {
    level1: number;
    level2: number;
    level3: number;
  };
};

function formatTokenAmount(value?: bigint, maximumFractionDigits = 4) {
  if (value === undefined) return '--';

  const numeric = Number(formatUnits(value, TOKEN_DECIMALS));
  if (!Number.isFinite(numeric)) return '--';

  return numeric.toLocaleString('en-US', { maximumFractionDigits });
}

function parseTokenAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed || Number(trimmed) <= 0) return null;

  try {
    return parseUnits(trimmed, TOKEN_DECIMALS);
  } catch {
    return null;
  }
}

function formatTxLabel(hash?: `0x${string}`) {
  if (!hash) return null;

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatNumber(value?: number | null, maximumFractionDigits = 2) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '--';

  return value.toLocaleString('en-US', { maximumFractionDigits });
}

function shortAddress(value?: string | null) {
  if (!value) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatRate(quote?: bigint, cost?: bigint) {
  if (!quote || !cost || cost === BigInt(0)) return '100';

  const quoteNumber = Number(formatUnits(quote, TOKEN_DECIMALS));
  const costNumber = Number(formatUnits(cost, TOKEN_DECIMALS));
  if (!Number.isFinite(quoteNumber) || !Number.isFinite(costNumber) || costNumber <= 0) return '100';

  return (quoteNumber / costNumber).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function PresalePurchasePanel() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { toast } = useToast();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [lastAction, setLastAction] = useState<'approve' | 'buy' | null>(null);
  const [approvalAmount, setApprovalAmount] = useState<bigint | null>(null);
  const [referralStatus, setReferralStatus] = useState<PresaleReferralStatus | null>(null);
  const [isLoadingReferralStatus, setIsLoadingReferralStatus] = useState(false);
  const asmTokenAddress = ukiSaleContracts.asmTokenAddress as Address | undefined;
  const presaleAddress = ukiSaleContracts.presaleAddress as Address | undefined;
  const isReady = Boolean(isConnected && address && chainId === UKI_PRESALE_CHAIN_ID && asmTokenAddress && presaleAddress);
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;
  const parsedAmount = useMemo(() => parseTokenAmount(amount), [amount]);
  const connector = connectors.find((item) => item.id === 'injected') ?? connectors[0];

  const {
    data: asmBalance,
    refetch: refetchBalance,
  } = useReadContract({
    address: asmTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && asmTokenAddress) },
  });

  const {
    data: allowance,
    refetch: refetchAllowance,
  } = useReadContract({
    address: asmTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && presaleAddress ? [address, presaleAddress] : undefined,
    query: { enabled: Boolean(address && asmTokenAddress && presaleAddress) },
  });

  const {
    data: quotedUki,
    refetch: refetchQuote,
  } = useReadContract({
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'quoteUki',
    args: parsedAmount ? [parsedAmount] : undefined,
    query: { enabled: Boolean(presaleAddress && parsedAmount) },
  });

  const {
    data: purchasedAsm,
    refetch: refetchPurchasedAsm,
  } = useReadContract({
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'asmPurchased',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && presaleAddress) },
  });

  const {
    data: purchasedUki,
    refetch: refetchPurchasedUki,
  } = useReadContract({
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'ukiPurchased',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && presaleAddress) },
  });

  const {
    data: isOpen,
    refetch: refetchIsOpen,
  } = useReadContract({
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'isOpen',
    query: { enabled: Boolean(presaleAddress) },
  });

  const { writeContract, data: txHash, error, isPending, reset } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  const needsApproval = Boolean(parsedAmount && allowance !== undefined && allowance < parsedAmount);
  const hasEnoughBalance = Boolean(parsedAmount && asmBalance !== undefined && asmBalance >= parsedAmount);
  const canSubmit = Boolean(isReady && parsedAmount && hasEnoughBalance && isOpen && !isPending && !isConfirming);
  const canConnect = Boolean(!isConnected && connector && !isConnecting);
  const canSwitch = Boolean(isWrongChain && !isSwitching);
  const txUrl = txHash ? getBscScanTxUrl(txHash) : null;

  const fetchReferralStatus = useCallback(async () => {
    if (!address) {
      setReferralStatus(null);
      return;
    }

    setIsLoadingReferralStatus(true);
    try {
      const response = await fetch(`/api/presale/referral/status?walletAddress=${address}`, {
        cache: 'no-store',
      });

      if (response.ok) {
        setReferralStatus(await response.json());
      }
    } finally {
      setIsLoadingReferralStatus(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchReferralStatus();
  }, [fetchReferralStatus]);

  useEffect(() => {
    if (!isSuccess) return;

    void refetchBalance();
    void refetchAllowance();
    void refetchQuote();
    void refetchIsOpen();
    void refetchPurchasedAsm();
    void refetchPurchasedUki();
    void fetchReferralStatus();

    if (lastAction === 'approve' && approvalAmount && presaleAddress) {
      toast({
        title: 'Aprobación confirmada',
        description: 'Abriendo ahora la transacción de compra.',
      });
      setLastAction('buy');
      setApprovalAmount(null);
      writeContract({
        address: presaleAddress,
        abi: presaleAbi,
        functionName: 'buy',
        args: [approvalAmount],
      });
      return;
    }

    if (lastAction === 'buy') {
      toast({
        title: 'Compra confirmada',
        description: 'Se ha creado la asignación de vesting UKI para tu wallet.',
      });
    }
  }, [approvalAmount, fetchReferralStatus, isSuccess, lastAction, presaleAddress, refetchAllowance, refetchBalance, refetchIsOpen, refetchPurchasedAsm, refetchPurchasedUki, refetchQuote, toast, writeContract]);

  async function copyReferralLink() {
    if (!referralStatus?.referralLink) return;

    await navigator.clipboard.writeText(referralStatus.referralLink);
    toast({
      title: 'Link copiado',
      description: 'Ya puedes compartir tu enlace de preventa.',
    });
  }

  useEffect(() => {
    if (!error) return;

    setApprovalAmount(null);
    toast({
      title: 'Transacción fallida',
      description: error.message,
      variant: 'destructive',
    });
  }, [error, toast]);

  function handleSubmit() {
    if (!isConnected) {
      if (!connector) {
        toast({
          title: 'Wallet no encontrada',
          description: 'Instala una wallet EVM compatible para conectar.',
          variant: 'destructive',
        });
        return;
      }
      connect({ connector });
      return;
    }

    if (isWrongChain) {
      switchChain(
        { chainId: UKI_PRESALE_CHAIN_ID },
        {
          onError: () => {
            toast({
              title: 'Cambio de red fallido',
              description: `Cambia tu wallet a ${UKI_PRESALE_CHAIN_LABEL}.`,
              variant: 'destructive',
            });
          },
        },
      );
      return;
    }

    if (!asmTokenAddress || !presaleAddress || !parsedAmount) return;
    reset();

    if (needsApproval) {
      setLastAction('approve');
      setApprovalAmount(parsedAmount);
      writeContract({
        address: asmTokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [presaleAddress, parsedAmount],
      });
      return;
    }

    setLastAction('buy');
    writeContract({
      address: presaleAddress,
      abi: presaleAbi,
      functionName: 'buy',
      args: [parsedAmount],
    });
  }

  const ctaDisabled = isConnected && !canSwitch && !canSubmit;
  const ctaLabel = !isConnected
    ? isConnecting
      ? 'Conectando wallet'
      : 'Conectar wallet'
      : isWrongChain
        ? isSwitching
          ? 'Cambiando red'
          : 'Cambiar red'
      : lastAction === 'approve' && (isPending || isConfirming)
        ? 'Confirmando acceso'
        : lastAction === 'buy' && (isPending || isConfirming)
          ? 'Comprando UKI'
          : 'Comprar UKI';
  const CtaIcon = !isConnected || isWrongChain ? Wallet : ShoppingCart;
  const referralMinimum = referralStatus?.minimumUkiToUnlockLink ?? 0;
  const referralProgress = referralStatus?.unlockProgress ?? 0;
  const referralProgressPercent = Math.round(referralProgress * 100);
  const remainingUkiToUnlock = Math.max(
    referralMinimum - (referralStatus?.totalUkiPurchased ?? 0),
    0,
  );

  return (
    <div className="mt-2 rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#02090d]/72 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
          <ShoppingCart className="h-4 w-4" strokeWidth={1.8} />
          Comprar UKI
        </span>
        <span className="text-right text-[0.62rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
          1 ASM = {formatRate(quotedUki, parsedAmount ?? undefined)} UKI
        </span>
      </div>

      <div className="mt-2 grid gap-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)] sm:grid-cols-2">
        <span>Balance ASM: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(asmBalance)}</strong></span>
        {isConnected ? (
          <span className="sm:text-right">
            Comprado: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(purchasedAsm)} ASM / {formatTokenAmount(purchasedUki)} UKI</strong>
          </span>
        ) : null}
      </div>

      <label className="mt-2 block">
        <span className="sr-only">Importe ASM</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
          inputMode="decimal"
          placeholder="10"
          className="h-12 w-full rounded-[8px] border border-[var(--uki-cyan-border)] bg-[#041014]/92 px-3 font-headline text-lg font-black text-[var(--uki-cream)] caret-[var(--uki-cyan)] outline-none transition placeholder:text-[var(--uki-muted)] focus:border-[var(--uki-cyan)]"
          style={{
            backgroundColor: '#041014',
            color: 'var(--uki-cream)',
            WebkitTextFillColor: 'var(--uki-cream)',
          }}
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
        <span>Coste: <strong className="text-[var(--uki-cream)]">{parsedAmount ? amount : '--'} ASM</strong></span>
        <span className="text-right">Recibes: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(quotedUki)} UKI</strong></span>
      </div>

      {isReady && !hasEnoughBalance && parsedAmount ? (
        <div className="uki-state-callout uki-state-callout-warning mt-2">
          <WalletCards className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>ASM insuficiente</p>
            <span>Baja el importe o añade más ASM a esta wallet.</span>
          </div>
        </div>
      ) : null}

      <button type="button" onClick={handleSubmit} disabled={ctaDisabled || (!canConnect && !isConnected && !isConnecting)} className={`uki-wallet-button mt-2 w-full justify-center ${ctaDisabled ? 'opacity-45' : ''}`}>
        {isPending || isConfirming || isConnecting || isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <CtaIcon className="h-4 w-4" />}
        {ctaLabel}
      </button>

      {isConfirming ? (
        <p className="mt-2 text-center text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
          {lastAction === 'approve' ? 'Confirmando aprobación antes de comprar...' : 'Confirmando compra...'}
        </p>
      ) : null}

      {txHash && txUrl ? (
        <a href={txUrl} target="_blank" rel="noreferrer" className="mt-2 block text-center text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-cyan)] hover:text-[var(--uki-cream)]">
          Ver tx {formatTxLabel(txHash)}
        </a>
      ) : null}

      {isConnected ? (
        <div className="mt-3 rounded-[8px] border border-[var(--uki-cyan-border)] bg-[#041014]/70 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.1em] text-[var(--uki-cyan)]">
              <Users className="h-3.5 w-3.5" />
              Referidos preventa
            </span>
            <span className="inline-flex items-center gap-1 text-[0.62rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
              {isLoadingReferralStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Score {formatNumber(referralStatus?.referralWeightedScore)}
            </span>
          </div>

          {referralStatus?.referralLink ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={referralStatus.referralLink}
                  readOnly
                  className="h-9 min-w-0 flex-1 rounded-[7px] border border-[var(--uki-cyan-border)] bg-[#02090d] px-2 text-xs font-bold text-[var(--uki-cream)] outline-none"
                />
                <button type="button" onClick={copyReferralLink} className="uki-wallet-button h-9 px-3">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[var(--uki-muted)]">
                Link activo. El volumen de tus referidos se contabiliza al cierre para premios Cukies.
              </p>
            </>
          ) : (
            <div className="mt-2">
              <div className="flex items-end justify-between gap-2 text-[0.62rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
                <span>Desbloqueo</span>
                <span>
                  {formatNumber(referralStatus?.totalUkiPurchased)} / {formatNumber(referralMinimum)} UKI
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/35">
                <div
                  className="h-full rounded-full bg-[var(--uki-cyan)] transition-all"
                  style={{ width: `${referralProgressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
                {remainingUkiToUnlock > 0
                  ? `Compra ${formatNumber(remainingUkiToUnlock)} UKI más para desbloquear tu link.`
                  : 'Tu link se activará cuando el indexer confirme la compra.'}
              </p>
            </div>
          )}

          <div className="mt-2 grid gap-1 text-[0.62rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
            {referralStatus?.lockedSponsorWalletAddress ? (
              <span>Sponsor fijado: <strong className="text-[var(--uki-cream)]">{shortAddress(referralStatus.lockedSponsorWalletAddress)}</strong></span>
            ) : referralStatus?.pendingSponsorCode ? (
              <span>Sponsor provisional: <strong className="text-[var(--uki-cream)]">{referralStatus.pendingSponsorCode}</strong></span>
            ) : (
              <span>Sin sponsor provisional</span>
            )}
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[0.62rem] font-black uppercase tracking-[0.08em] text-[var(--uki-muted)]">
            <span>
              N1
              <strong className="block text-[var(--uki-cream)]">{formatNumber(referralStatus?.referralLevel1UkiAmount)}</strong>
              <em className="not-italic text-[var(--uki-muted)]">x{formatNumber(referralStatus?.levelWeights.level1, 2)}</em>
            </span>
            <span>
              N2
              <strong className="block text-[var(--uki-cream)]">{formatNumber(referralStatus?.referralLevel2UkiAmount)}</strong>
              <em className="not-italic text-[var(--uki-muted)]">x{formatNumber(referralStatus?.levelWeights.level2, 2)}</em>
            </span>
            <span>
              N3
              <strong className="block text-[var(--uki-cream)]">{formatNumber(referralStatus?.referralLevel3UkiAmount)}</strong>
              <em className="not-italic text-[var(--uki-muted)]">x{formatNumber(referralStatus?.levelWeights.level3, 2)}</em>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
