'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ShoppingCart, Wallet, WalletCards } from 'lucide-react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useAccount, useConnect, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { erc20Abi, getBscScanTxUrl, presaleAbi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';
import { usePresaleLock } from './presale-countdown';

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
  if (!quote || !cost || cost === BigInt(0)) return null;

  const quoteNumber = Number(formatUnits(quote, TOKEN_DECIMALS));
  const costNumber = Number(formatUnits(cost, TOKEN_DECIMALS));
  if (!Number.isFinite(quoteNumber) || !Number.isFinite(costNumber) || costNumber <= 0) return null;

  return (quoteNumber / costNumber).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function PresalePurchasePanel() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { toast } = useToast();
  const { isLocked: isPublicPresaleLocked, startShortLabel } = usePresaleLock();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [lastAction, setLastAction] = useState<'approve' | 'buy' | null>(null);
  const [approvalAmount, setApprovalAmount] = useState<bigint | null>(null);
  const handledReceiptHashRef = useRef<string | null>(null);
  const asmTokenAddress = ukiSaleContracts.asmTokenAddress as Address | undefined;
  const presaleAddress = ukiSaleContracts.presaleAddress as Address | undefined;
  const isReady = Boolean(isConnected && address && chainId === UKI_PRESALE_CHAIN_ID && asmTokenAddress && presaleAddress);
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;
  const parsedAmount = useMemo(() => parseTokenAmount(amount), [amount]);
  const connector = connectors.find((item) => item.id === 'injected') ?? connectors[0];
  const readsEnabled = Boolean((!isConnected || !isWrongChain) && asmTokenAddress && presaleAddress);
  const isPublicPresaleOpen = !isPublicPresaleLocked;

  const {
    data: asmBalance,
    refetch: refetchBalance,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: asmTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && readsEnabled) },
  });

  const {
    data: allowance,
    refetch: refetchAllowance,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: asmTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && presaleAddress ? [address, presaleAddress] : undefined,
    query: { enabled: Boolean(address && readsEnabled) },
  });

  const {
    data: quotedUki,
    refetch: refetchQuote,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'quoteUki',
    args: parsedAmount ? [parsedAmount] : undefined,
    query: { enabled: Boolean(readsEnabled && parsedAmount) },
  });

  const {
    data: purchasedAsm,
    refetch: refetchPurchasedAsm,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'asmPurchased',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && readsEnabled) },
  });

  const {
    data: purchasedUki,
    refetch: refetchPurchasedUki,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'ukiPurchased',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && readsEnabled) },
  });

  const {
    data: isOpen,
    refetch: refetchIsOpen,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'isOpen',
    query: { enabled: Boolean(readsEnabled && isPublicPresaleOpen) },
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
  const hasAllowanceData = !isReady || allowance !== undefined;
  const canSubmit = Boolean(
    isReady &&
    parsedAmount &&
    hasEnoughBalance &&
    hasAllowanceData &&
    isPublicPresaleOpen &&
    isOpen &&
    !isPending &&
    !isConfirming,
  );
  const canConnect = Boolean(!isConnected && connector && !isConnecting);
  const canSwitch = Boolean(isWrongChain && !isSwitching);
  const txUrl = txHash ? getBscScanTxUrl(txHash) : null;

  useEffect(() => {
    if (!isSuccess || !txHash) return;
    if (handledReceiptHashRef.current === txHash) return;

    handledReceiptHashRef.current = txHash;

    void refetchBalance();
    void refetchAllowance();
    void refetchQuote();
    void refetchIsOpen();
    void refetchPurchasedAsm();
    void refetchPurchasedUki();

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
  }, [approvalAmount, isSuccess, lastAction, presaleAddress, refetchAllowance, refetchBalance, refetchIsOpen, refetchPurchasedAsm, refetchPurchasedUki, refetchQuote, toast, txHash, writeContract]);

  useEffect(() => {
    if (!error) return;

    setApprovalAmount(null);
    toast({
      title: 'Transacción fallida',
      description: error.message,
      variant: 'destructive',
    });
  }, [error, toast]);

  async function ensureReferralAttribution() {
    if (!address) return true;

    const params = new URLSearchParams({
      walletAddress: address,
      origin: window.location.origin,
    });
    const response = await fetch(`/api/presale/referral/status?${params.toString()}`, {
      cache: 'no-store',
    });

    return response.ok;
  }

  async function handleSubmit() {
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

    if (!isPublicPresaleOpen) {
      toast({
        title: 'Preventa aún no abierta',
        description: 'La compra se activará cuando llegue la fecha de inicio.',
      });
      return;
    }

    if (!asmTokenAddress || !presaleAddress || !parsedAmount) return;

    if (!isOpen) {
      toast({
        title: 'Compra no disponible',
        description: 'El contrato de preventa todavía no está abierto.',
        variant: 'destructive',
      });
      return;
    }

    if (allowance === undefined) {
      toast({
        title: 'Revisando permisos',
        description: 'Espera a que cargue la aprobación de ASM antes de comprar.',
      });
      return;
    }

    if (!hasEnoughBalance) {
      toast({
        title: 'ASM insuficiente',
        description: 'Baja el importe o añade más ASM a esta wallet.',
        variant: 'destructive',
      });
      return;
    }

    const referralReady = await ensureReferralAttribution();
    if (!referralReady) {
      toast({
        title: 'No se pudo preparar la compra',
        description: 'No hemos podido validar el estado de referidos de esta wallet. Inténtalo de nuevo.',
        variant: 'destructive',
      });
      return;
    }

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
      : isPublicPresaleLocked
        ? `Abre ${startShortLabel}`
      : lastAction === 'approve' && (isPending || isConfirming)
        ? 'Confirmando acceso'
        : lastAction === 'buy' && (isPending || isConfirming)
          ? 'Comprando UKI'
          : 'Comprar UKI';
  const CtaIcon = !isConnected || isWrongChain ? Wallet : ShoppingCart;
  const quoteRate = formatRate(quotedUki, parsedAmount ?? undefined);
  const visibleQuotedUki = quotedUki;

  return (
    <div className="mt-2 rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#02090d]/72 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">
          <ShoppingCart className="h-4 w-4" strokeWidth={1.8} />
          Comprar UKI
        </span>
        <span className="text-right text-[0.62rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">
          {quoteRate ? `1 ASM = ${quoteRate} UKI` : 'RATIO ASM - UKI SE FIJARÁ AL INICIO'}
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
        <span className="text-right">Recibes: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(visibleQuotedUki)} UKI</strong></span>
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

    </div>
  );
}
