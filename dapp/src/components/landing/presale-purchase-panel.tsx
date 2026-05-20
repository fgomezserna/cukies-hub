'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, ShoppingCart, Wallet, WalletCards } from 'lucide-react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useAccount, useConnect, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { erc20Abi, getBscScanTxUrl, presaleAbi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';

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
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { toast } = useToast();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [lastAction, setLastAction] = useState<'approve' | 'buy' | null>(null);
  const [approvalAmount, setApprovalAmount] = useState<bigint | null>(null);
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

  useEffect(() => {
    if (!isSuccess) return;

    void refetchBalance();
    void refetchAllowance();
    void refetchQuote();
    void refetchIsOpen();
    void refetchPurchasedAsm();
    void refetchPurchasedUki();

    if (lastAction === 'approve' && approvalAmount && presaleAddress) {
      toast({
        title: 'Approval confirmed',
        description: 'Opening the purchase transaction now.',
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
        title: 'Purchase confirmed',
        description: 'Your UKI vesting schedule has been created.',
      });
    }
  }, [approvalAmount, isSuccess, lastAction, presaleAddress, refetchAllowance, refetchBalance, refetchIsOpen, refetchPurchasedAsm, refetchPurchasedUki, refetchQuote, toast, writeContract]);

  useEffect(() => {
    if (!error) return;

    setApprovalAmount(null);
    toast({
      title: 'Transaction failed',
      description: error.message,
      variant: 'destructive',
    });
  }, [error, toast]);

  function handleSubmit() {
    if (!isConnected) {
      if (!connector) {
        toast({
          title: 'Wallet not found',
          description: 'Install an EVM wallet such as MetaMask to connect.',
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
              title: 'Network switch failed',
              description: `Please switch your wallet to ${UKI_PRESALE_CHAIN_LABEL}.`,
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
      ? 'Connecting wallet'
      : 'Connect wallet'
      : isWrongChain
        ? isSwitching
          ? 'Switching network'
          : 'Switch network'
      : lastAction === 'approve' && (isPending || isConfirming)
        ? 'Confirm token access'
        : lastAction === 'buy' && (isPending || isConfirming)
          ? 'Buying UKI'
          : 'Buy UKI';
  const CtaIcon = !isConnected || isWrongChain ? Wallet : ShoppingCart;

  return (
    <div className="mt-2 rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#02090d]/72 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
          <ShoppingCart className="h-4 w-4" strokeWidth={1.8} />
          Buy UKI
        </span>
        <span className="text-right text-[0.62rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
          1 tASM = {formatRate(quotedUki, parsedAmount ?? undefined)} UKI
        </span>
      </div>

      <div className="mt-2 grid gap-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)] sm:grid-cols-2">
        <span>tASM balance: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(asmBalance)}</strong></span>
        {isConnected ? (
          <span className="sm:text-right">
            Bought: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(purchasedAsm)} tASM / {formatTokenAmount(purchasedUki)} UKI</strong>
          </span>
        ) : null}
      </div>

      <label className="mt-2 block">
        <span className="sr-only">tASM amount</span>
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
        <span>Cost: <strong className="text-[var(--uki-cream)]">{parsedAmount ? amount : '--'} tASM</strong></span>
        <span className="text-right">Receives: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(quotedUki)} UKI</strong></span>
      </div>

      {isReady && !hasEnoughBalance && parsedAmount ? (
        <div className="uki-state-callout uki-state-callout-warning mt-2">
          <WalletCards className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>Insufficient tASM</p>
            <span>Lower the amount or mint more test tASM for this wallet.</span>
          </div>
        </div>
      ) : null}

      <button type="button" onClick={handleSubmit} disabled={ctaDisabled || (!canConnect && !isConnected && !isConnecting)} className={`uki-wallet-button mt-2 w-full justify-center ${ctaDisabled ? 'opacity-45' : ''}`}>
        {isPending || isConfirming || isConnecting || isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <CtaIcon className="h-4 w-4" />}
        {ctaLabel}
      </button>

      {isConfirming ? (
        <p className="mt-2 text-center text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
          {lastAction === 'approve' ? 'Confirming approval before purchase...' : 'Confirming purchase...'}
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
