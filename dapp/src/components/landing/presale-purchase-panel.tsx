'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShoppingCart, WalletCards } from 'lucide-react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { erc20Abi, getBscScanTxUrl, presaleAbi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import { UKI_PRESALE_CHAIN_ID } from './sale-config';

const TOKEN_DECIMALS = 18;
const DEFAULT_AMOUNT = '10';

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

function formatRate(quote?: bigint, cost?: bigint) {
  if (!quote || !cost || cost === BigInt(0)) return '100';

  const quoteNumber = Number(formatUnits(quote, TOKEN_DECIMALS));
  const costNumber = Number(formatUnits(cost, TOKEN_DECIMALS));
  if (!Number.isFinite(quoteNumber) || !Number.isFinite(costNumber) || costNumber <= 0) return '100';

  return (quoteNumber / costNumber).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function PresalePurchasePanel() {
  const { address, chainId, isConnected } = useAccount();
  const { toast } = useToast();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [lastAction, setLastAction] = useState<'approve' | 'buy' | null>(null);
  const asmTokenAddress = ukiSaleContracts.asmTokenAddress as Address | undefined;
  const presaleAddress = ukiSaleContracts.presaleAddress as Address | undefined;
  const isReady = Boolean(isConnected && address && chainId === UKI_PRESALE_CHAIN_ID && asmTokenAddress && presaleAddress);
  const parsedAmount = useMemo(() => parseTokenAmount(amount), [amount]);

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
  const canApprove = Boolean(isReady && parsedAmount && hasEnoughBalance && needsApproval && !isPending && !isConfirming);
  const canBuy = Boolean(isReady && parsedAmount && hasEnoughBalance && !needsApproval && isOpen && !isPending && !isConfirming);
  const txUrl = txHash ? getBscScanTxUrl(txHash) : null;

  useEffect(() => {
    if (!isSuccess) return;

    void refetchBalance();
    void refetchAllowance();
    void refetchQuote();
    void refetchIsOpen();

    toast({
      title: lastAction === 'approve' ? 'Approval confirmed' : 'Purchase confirmed',
      description: lastAction === 'approve' ? 'tASM allowance is ready for the presale.' : 'Your UKI vesting schedule has been created.',
    });
  }, [isSuccess, lastAction, refetchAllowance, refetchBalance, refetchIsOpen, refetchQuote, toast]);

  useEffect(() => {
    if (!error) return;

    toast({
      title: 'Transaction failed',
      description: error.message,
      variant: 'destructive',
    });
  }, [error, toast]);

  function handleApprove() {
    if (!asmTokenAddress || !presaleAddress || !parsedAmount) return;
    setLastAction('approve');
    reset();
    writeContract({
      address: asmTokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [presaleAddress, parsedAmount],
    });
  }

  function handleBuy() {
    if (!presaleAddress || !parsedAmount) return;
    setLastAction('buy');
    reset();
    writeContract({
      address: presaleAddress,
      abi: presaleAbi,
      functionName: 'buy',
      args: [parsedAmount],
    });
  }

  return (
    <div className="mt-2.5 rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#02090d]/72 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
          <ShoppingCart className="h-4 w-4" strokeWidth={1.8} />
          Buy UKI
        </span>
        <span className="text-right text-[0.62rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
          1 tASM = {formatRate(quotedUki, parsedAmount ?? undefined)} UKI
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
        <span>tASM balance: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(asmBalance)}</strong></span>
        <span className="text-right">Allowance: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(allowance)}</strong></span>
      </div>

      <label className="mt-2 block">
        <span className="sr-only">tASM amount</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
          inputMode="decimal"
          placeholder="10"
          className="h-12 w-full rounded-[8px] border border-[var(--uki-cyan-border)] bg-[#041014]/92 px-3 font-headline text-lg font-black text-[var(--uki-cream)] outline-none transition focus:border-[var(--uki-cyan)]"
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
        <span>Cost: <strong className="text-[var(--uki-cream)]">{parsedAmount ? amount : '--'} tASM</strong></span>
        <span className="text-right">Receives: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(quotedUki)} UKI</strong></span>
      </div>

      {!isReady ? (
        <div className="uki-state-callout uki-state-callout-warning mt-2">
          <AlertTriangle className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>Wallet required</p>
            <span>Connect a tester wallet on BNB Smart Chain Testnet.</span>
          </div>
        </div>
      ) : !hasEnoughBalance && parsedAmount ? (
        <div className="uki-state-callout uki-state-callout-warning mt-2">
          <WalletCards className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>Insufficient tASM</p>
            <span>Lower the amount or mint more test tASM for this wallet.</span>
          </div>
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={handleApprove} disabled={!canApprove} className={`uki-wallet-button justify-center ${!canApprove ? 'opacity-45' : ''}`}>
          {isPending && lastAction === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Approve
        </button>
        <button type="button" onClick={handleBuy} disabled={!canBuy} className={`uki-wallet-button justify-center ${!canBuy ? 'opacity-45' : ''}`}>
          {isPending && lastAction === 'buy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          Buy
        </button>
      </div>

      {isConfirming ? (
        <p className="mt-2 text-center text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
          Confirming transaction...
        </p>
      ) : null}

      {txHash && txUrl ? (
        <a href={txUrl} target="_blank" rel="noreferrer" className="mt-2 block text-center text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-cyan)] hover:text-[var(--uki-cream)]">
          View tx {formatTxLabel(txHash)}
        </a>
      ) : null}
    </div>
  );
}
