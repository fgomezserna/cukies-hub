'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, ShoppingCart, Wallet, WalletCards } from 'lucide-react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract, type Connector } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { useHasMounted } from '@/hooks/use-has-mounted';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { erc20Abi, getBscScanTxUrl, presaleAbi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import { isBelowContractMinimumPurchase } from '@/lib/presale-purchase-validation';
import { getConnectorDisplayName, getVisibleWalletConnectors } from '@/lib/wallet-connectors';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';
import { usePresaleLock } from './presale-countdown';
import { WalletConnectorDialog } from './wallet-connector-dialog';

const TOKEN_DECIMALS = 18;
const DEFAULT_AMOUNT = '1';

type PurchaseHistoryItem = {
  eventId: string;
  chain?: string;
  asmAmount: number;
  ukiAmount: number;
  totalBuyerAsm: number;
  totalBuyerUki: number;
  txHash?: string;
  txUrl?: string | null;
  blockNumber?: number | null;
  confirmedAt?: string | null;
  timestampMs?: number | null;
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

function formatPurchaseDate(purchase: PurchaseHistoryItem) {
  const timestamp = purchase.confirmedAt ?? (purchase.timestampMs ? new Date(purchase.timestampMs).toISOString() : null);
  if (!timestamp) return 'Fecha pendiente';

  return new Date(timestamp).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { toast } = useToast();
  const { isLocked: isPublicPresaleLocked, startShortLabel } = usePresaleLock();
  const hasMounted = useHasMounted();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [lastAction, setLastAction] = useState<'approve' | 'approved' | 'buy' | null>(null);
  const [approvalAmount, setApprovalAmount] = useState<bigint | null>(null);
  const [locallyApprovedAmount, setLocallyApprovedAmount] = useState<bigint | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isConnectorDialogOpen, setIsConnectorDialogOpen] = useState(false);
  const handledReceiptHashRef = useRef<string | null>(null);
  const asmTokenAddress = ukiSaleContracts.asmTokenAddress as Address | undefined;
  const presaleAddress = ukiSaleContracts.presaleAddress as Address | undefined;
  const isReady = Boolean(isConnected && address && chainId === UKI_PRESALE_CHAIN_ID && asmTokenAddress && presaleAddress);
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;
  const parsedAmount = useMemo(() => parseTokenAmount(amount), [amount]);
  const evmConnectors = useMemo(
    () => (hasMounted ? getVisibleWalletConnectors(connectors) : []),
    [connectors, hasMounted],
  );
  const readsEnabled = Boolean((!isConnected || !isWrongChain) && asmTokenAddress && presaleAddress);
  const isPublicPresaleOpen = !isPublicPresaleLocked;

  const {
    data: asmBalance,
    isError: isAsmBalanceError,
    isLoading: isAsmBalanceLoading,
    refetch: refetchBalance,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: asmTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && readsEnabled),
      staleTime: 0,
    },
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
    data: minAsmPerPurchase,
    refetch: refetchMinAsmPerPurchase,
  } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'minAsmPerPurchase',
    query: { enabled: readsEnabled },
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

  const effectiveAllowance = locallyApprovedAmount && (!allowance || locallyApprovedAmount > allowance)
    ? locallyApprovedAmount
    : allowance;
  const needsApproval = Boolean(parsedAmount && effectiveAllowance !== undefined && effectiveAllowance < parsedAmount);
  const hasEnoughBalance = Boolean(parsedAmount && asmBalance !== undefined && asmBalance >= parsedAmount);
  const hasAllowanceData = !isReady || effectiveAllowance !== undefined;
  const hasMinPurchaseData = !isReady || minAsmPerPurchase !== undefined;
  const hasBalanceData = !isReady || asmBalance !== undefined;
  const asmBalanceLabel = isAsmBalanceError
    ? 'Error de lectura'
    : isAsmBalanceLoading && asmBalance === undefined
      ? 'Cargando...'
      : formatTokenAmount(asmBalance);
  const isBelowMinPurchase = isBelowContractMinimumPurchase(parsedAmount, minAsmPerPurchase);
  const canSubmit = Boolean(
    isReady &&
    parsedAmount &&
    hasEnoughBalance &&
    hasBalanceData &&
    hasAllowanceData &&
    hasMinPurchaseData &&
    !isBelowMinPurchase &&
    isPublicPresaleOpen &&
    isOpen &&
    !isPending &&
    !isConfirming,
  );
  const canConnect = Boolean(hasMounted && !isConnected && evmConnectors.length > 0 && !isConnecting);
  const canSwitch = Boolean(isWrongChain && !isSwitching);
  const txUrl = txHash ? getBscScanTxUrl(txHash) : null;

  useEffect(() => {
    setLastAction(null);
    setApprovalAmount(null);
    setLocallyApprovedAmount(null);
    handledReceiptHashRef.current = null;
  }, [address, asmTokenAddress, presaleAddress]);

  useEffect(() => {
    if (!isHistoryOpen || !address) return;

    let isCancelled = false;
    const params = new URLSearchParams({
      walletAddress: address,
      limit: '50',
    });

    setIsHistoryLoading(true);
    setHistoryError(null);

    fetch(`/api/presale/purchases?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el historial de compras.');
        return response.json();
      })
      .then((data) => {
        if (isCancelled) return;
        setPurchaseHistory(Array.isArray(data.purchases) ? data.purchases : []);
      })
      .catch((fetchError) => {
        if (isCancelled) return;
        setPurchaseHistory([]);
        setHistoryError(fetchError instanceof Error ? fetchError.message : 'No se pudo cargar el historial de compras.');
      })
      .finally(() => {
        if (!isCancelled) setIsHistoryLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [address, isHistoryOpen]);

  useEffect(() => {
    if (!isSuccess || !txHash) return;
    if (handledReceiptHashRef.current === txHash) return;

    handledReceiptHashRef.current = txHash;

    void refetchBalance();
    void refetchAllowance();
    void refetchQuote();
    void refetchMinAsmPerPurchase();
    void refetchIsOpen();
    void refetchPurchasedAsm();
    void refetchPurchasedUki();

    if (lastAction === 'approve' && approvalAmount) {
      setLocallyApprovedAmount(approvalAmount);
      setLastAction('approved');
      setApprovalAmount(null);
      toast({
        title: 'ASM aprobado',
        description: 'Permiso confirmado. Pulsa Comprar UKI para abrir la compra final.',
      });
      return;
    }

    if (lastAction === 'buy') {
      setLastAction(null);
      setApprovalAmount(null);
      setLocallyApprovedAmount(null);
      toast({
        title: 'Compra confirmada',
        description: 'Se ha creado la asignación de vesting UKI para tu wallet.',
      });
    }
  }, [approvalAmount, isSuccess, lastAction, refetchAllowance, refetchBalance, refetchIsOpen, refetchMinAsmPerPurchase, refetchPurchasedAsm, refetchPurchasedUki, refetchQuote, toast, txHash]);

  useEffect(() => {
    if (!error) return;

    setLastAction(null);
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
      applyReferral: '1',
    });
    const response = await fetch(`/api/presale/referral/status?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!response.ok) return false;

    const data = await response.json().catch(() => null) as {
      referralAttribution?: {
        applied: boolean;
        reason?: 'invalid_or_locked_code' | 'self_referral' | 'sponsor_already_locked';
      } | null;
    } | null;
    const attribution = data?.referralAttribution;

    if (!attribution || attribution.applied) return true;

    return attribution.reason === 'self_referral' || attribution.reason === 'sponsor_already_locked';
  }

  async function connectEvmForPurchase(connector: Connector) {
    try {
      if (isConnected) {
        disconnect();
      }

      await connectAsync({ connector, chainId: UKI_PRESALE_CHAIN_ID });
      setIsConnectorDialogOpen(false);
      toast({
        title: 'Wallet conectada',
        description: `${getConnectorDisplayName(connector)} lista para comprar en ${UKI_PRESALE_CHAIN_LABEL}.`,
      });
    } catch {
      toast({
        title: 'Conexión fallida',
        description: 'Aprueba la conexión en tu wallet y vuelve a intentarlo.',
        variant: 'destructive',
      });
    }
  }

  function switchToPresaleChain() {
    switchChain(
      { chainId: UKI_PRESALE_CHAIN_ID },
      {
        onError: () => {
          toast({
            title: 'Cambio de red fallido',
            description: `Desconecta esta wallet o cambia manualmente a ${UKI_PRESALE_CHAIN_LABEL}.`,
            variant: 'destructive',
          });
        },
      },
    );
  }

  function disconnectCurrentWallet() {
    disconnect();
    toast({
      title: 'Wallet desconectada',
      description: 'Elige otra wallet para comprar UKI.',
    });
  }

  async function handleSubmit() {
    if (!hasMounted) return;

    if (!isConnected) {
      if (evmConnectors.length === 0) {
        toast({
          title: 'Wallet no encontrada',
          description: 'Instala una wallet EVM compatible para conectar.',
          variant: 'destructive',
        });
        return;
      }

      if (evmConnectors.length === 1) {
        await connectEvmForPurchase(evmConnectors[0]);
        return;
      }

      setIsConnectorDialogOpen(true);
      return;
    }

    if (isWrongChain) {
      setIsConnectorDialogOpen(true);
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

    if (effectiveAllowance === undefined) {
      toast({
        title: 'Revisando permisos',
        description: 'Espera a que cargue la aprobación de ASM antes de comprar.',
      });
      return;
    }

    if (minAsmPerPurchase === undefined) {
      toast({
        title: 'Revisando compra mínima',
        description: 'Espera a que cargue el mínimo de ASM desde el contrato.',
      });
      return;
    }

    if (isBelowMinPurchase) {
      toast({
        title: 'Importe inferior al mínimo',
        description: `El contrato exige una compra mínima de ${formatTokenAmount(minAsmPerPurchase)} ASM.`,
        variant: 'destructive',
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

    toast({
      title: 'Confirma la compra',
      description: 'Revisa y firma la compra final en tu wallet.',
    });
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
  const minPurchaseLabel = minAsmPerPurchase !== undefined && minAsmPerPurchase > BigInt(0)
    ? formatTokenAmount(minAsmPerPurchase)
    : null;

  return (
    <div className="mt-2 rounded-[10px] border border-[var(--uki-cyan-border)] bg-[#04030a]/72 p-2.5">
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
        <span>Balance ASM: <strong className="text-[var(--uki-cream)]">{asmBalanceLabel}</strong></span>
        {isConnected ? (
          <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="text-left underline-offset-4 transition hover:text-[var(--uki-cyan)] hover:underline sm:text-right"
              >
                Comprado: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(purchasedAsm)} ASM / {formatTokenAmount(purchasedUki)} UKI</strong>
              </button>
            </SheetTrigger>
            <SheetContent className="w-full border-[var(--uki-cyan)]/25 bg-[#070817] text-[var(--uki-cream)] shadow-[0_0_54px_rgba(228,92,255,0.16)] sm:max-w-xl">
              <SheetHeader>
                <SheetTitle className="font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">Compras de UKI</SheetTitle>
                <SheetDescription className="font-semibold text-[var(--uki-muted)]">
                  Historial de compras registradas con esta cartera. Los enlaces abren el explorer configurado para la red activa.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 rounded-[10px] border border-[var(--uki-cyan)]/20 bg-[#0d0b24]/70 p-4">
                <div className="grid grid-cols-2 gap-3 text-[0.68rem] font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">
                  <div>
                    <span>Total ASM</span>
                    <p className="mt-1 font-headline text-lg text-[var(--uki-cream)]">{formatTokenAmount(purchasedAsm)}</p>
                  </div>
                  <div className="text-right">
                    <span>Total UKI</span>
                    <p className="mt-1 font-headline text-lg text-[var(--uki-cream)]">{formatTokenAmount(purchasedUki)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {isHistoryLoading ? (
                  <div className="flex items-center gap-3 rounded-[10px] border border-white/10 bg-white/[0.03] p-4 text-sm font-semibold text-[var(--uki-text)]">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--uki-cyan)]" />
                    Cargando compras...
                  </div>
                ) : historyError ? (
                  <div className="rounded-[10px] border border-[#f2c34b]/30 bg-[#2b1d08]/42 p-4 text-sm font-semibold text-[#ffe2a0]">
                    {historyError}
                  </div>
                ) : purchaseHistory.length === 0 ? (
                  <div className="rounded-[10px] border border-white/10 bg-white/[0.03] p-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                    Todavía no hay compras registradas para esta cartera. Si acabas de comprar, puede tardar unos minutos en aparecer.
                  </div>
                ) : (
                  purchaseHistory.map((purchase) => (
                    <article key={purchase.eventId} className="rounded-[10px] border border-white/10 bg-white/[0.035] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-headline text-base font-black uppercase text-[var(--uki-cream)]">
                            {formatNumber(purchase.ukiAmount)} UKI
                          </p>
                          <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--uki-muted)]">
                            {formatNumber(purchase.asmAmount)} ASM · {formatPurchaseDate(purchase)}
                          </p>
                        </div>
                        {purchase.txUrl ? (
                          <a
                            href={purchase.txUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-[var(--uki-cyan)]/30 bg-[var(--uki-cyan)]/10 px-2.5 py-1.5 text-[0.66rem] font-black uppercase tracking-[0.08em] text-[var(--uki-cyan)] transition hover:bg-[var(--uki-cyan)]/15"
                          >
                            Ver tx
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-[8px] bg-black/20 p-3 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[var(--uki-muted)]">
                        <span>Acumulado ASM <strong className="block text-[var(--uki-cream)]">{formatNumber(purchase.totalBuyerAsm)}</strong></span>
                        <span className="text-right">Acumulado UKI <strong className="block text-[var(--uki-cream)]">{formatNumber(purchase.totalBuyerUki)}</strong></span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>

      <label className="mt-2 block">
        <span className="sr-only">Importe ASM</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
          inputMode="decimal"
          placeholder="1"
          className="h-12 w-full rounded-[8px] border border-[var(--uki-cyan-border)] bg-[#0b0719]/92 px-3 font-headline text-lg font-black text-[var(--uki-cream)] caret-[var(--uki-cyan)] outline-none transition placeholder:text-[var(--uki-muted)] focus:border-[var(--uki-cyan)]"
          style={{
            backgroundColor: '#0b0719',
            color: 'var(--uki-cream)',
            WebkitTextFillColor: 'var(--uki-cream)',
          }}
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
        <span>Coste: <strong className="text-[var(--uki-cream)]">{parsedAmount ? amount : '--'} ASM</strong></span>
        <span className="text-right">Recibes: <strong className="text-[var(--uki-cream)]">{formatTokenAmount(visibleQuotedUki)} UKI</strong></span>
      </div>

      {minPurchaseLabel ? (
        <p className={`mt-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] ${isBelowMinPurchase ? 'text-[#ffe2a0]' : 'text-[var(--uki-muted)]'}`}>
          Compra mínima: <strong className="text-[var(--uki-cream)]">{minPurchaseLabel} ASM</strong>
        </p>
      ) : null}

      {isBelowMinPurchase && minPurchaseLabel ? (
        <div className="uki-state-callout uki-state-callout-warning mt-2">
          <WalletCards className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>Importe inferior al mínimo</p>
            <span>El contrato exige al menos {minPurchaseLabel} ASM por compra.</span>
          </div>
        </div>
      ) : null}

      {isReady && !hasBalanceData && parsedAmount ? (
        <div className="uki-state-callout uki-state-callout-warning mt-2">
          <WalletCards className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>Balance ASM pendiente</p>
            <span>Espera a que la dapp lea el saldo de ASM en BNB Smart Chain.</span>
          </div>
        </div>
      ) : null}

      {isReady && isAsmBalanceError ? (
        <div className="uki-state-callout uki-state-callout-warning mt-2">
          <WalletCards className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>No se pudo leer ASM</p>
            <span>Revisa la conexión RPC de BNB Smart Chain o vuelve a conectar la wallet.</span>
          </div>
        </div>
      ) : null}

      {isReady && hasBalanceData && !hasEnoughBalance && parsedAmount ? (
        <div className="uki-state-callout uki-state-callout-warning mt-2">
          <WalletCards className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>ASM insuficiente</p>
            <span>Baja el importe o añade más ASM a esta wallet.</span>
          </div>
        </div>
      ) : null}

      {lastAction === 'approved' && !isPending && !isConfirming ? (
        <div className="uki-state-callout mt-2 border-[var(--uki-cyan)]/35 bg-[var(--uki-cyan)]/10">
          <WalletCards className="h-4 w-4" strokeWidth={1.8} />
          <div>
            <p>ASM aprobado</p>
            <span>Permiso confirmado. Pulsa Comprar UKI para firmar la compra final.</span>
          </div>
        </div>
      ) : null}

      <button type="button" onClick={handleSubmit} disabled={ctaDisabled || (!canConnect && !isConnected && !isConnecting)} className={`uki-wallet-button mt-2 w-full justify-center ${ctaDisabled ? 'opacity-45' : ''}`}>
        {isPending || isConfirming || isConnecting || isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <CtaIcon className="h-4 w-4" />}
        {ctaLabel}
      </button>

      <WalletConnectorDialog
        open={isConnectorDialogOpen}
        onOpenChange={setIsConnectorDialogOpen}
        connectors={evmConnectors}
        onSelectConnector={connectEvmForPurchase}
        currentWalletAction={
          isWrongChain
            ? {
                description: `Intenta mover la wallet actual a ${UKI_PRESALE_CHAIN_LABEL}.`,
                isLoading: isSwitching,
                label: 'Cambiar a BSC',
                onSelect: switchToPresaleChain,
              }
            : undefined
        }
        disconnectAction={
          isConnected && address
            ? {
                description: `${formatTxLabel(address as `0x${string}`) ?? address} no se usara para esta compra.`,
                label: 'Desconectar wallet actual',
                onSelect: disconnectCurrentWallet,
              }
            : undefined
        }
        isConnecting={isConnecting}
        title="Conectar para comprar"
        description={`Elige una wallet EVM compatible con ${UKI_PRESALE_CHAIN_LABEL}.`}
      />

      {isConfirming ? (
        <p className="mt-2 text-center text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--uki-muted)]">
          {lastAction === 'approve'
            ? 'Confirmando permiso ASM. Luego pulsa Comprar UKI para la compra final.'
            : 'Confirmando compra UKI. Espera la confirmación on-chain.'}
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
