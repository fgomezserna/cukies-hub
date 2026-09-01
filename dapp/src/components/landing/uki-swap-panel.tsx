'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Route,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  getAddress,
  isAddress,
  parseUnits,
  type Address,
  type Hash,
} from 'viem';
import {
  useAccount,
  useConnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
  type Connector,
} from 'wagmi';

import { Panel } from './primitives';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';
import { WalletConnectorDialog } from './wallet-connector-dialog';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useToast } from '@/hooks/use-toast';
import { erc20Abi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import { landingNetworkConfig } from '@/lib/landing-network';
import {
  applyMaximumSlippageBps,
  applySlippageBps,
  BSC_MAINNET_SWAP_TOKENS,
  buildUkiSwapConfig,
  createSwapDeadline,
  formatEditableSwapAmount,
  formatSwapAmount,
  pancakeV2RouterAbi,
  type UkiSwapSourceSymbol,
} from '@/lib/uki-swap';
import { getVisibleWalletConnectors } from '@/lib/wallet-connectors';
import { usePublicLocale } from '@/providers/public-locale-provider';

const SWAP_COPY = {
  es: {
    eyebrow: 'Compra directa · PancakeSwap V2',
    title: 'Comprar UKI',
    payWith: 'Pagar con',
    amount: 'Importe a pagar',
    receive: 'UKI que quieres recibir',
    editEither: 'Puedes editar cualquiera de los dos importes.',
    minimum: 'Mínimo recibido',
    maximum: 'Máximo a pagar',
    slippage: 'Tolerancia',
    connect: 'Conectar wallet',
    switchNetwork: 'Cambiar a BNB Smart Chain',
    approve: 'Autorizar importe exacto',
    approving: 'Confirmando autorización',
    buy: 'Comprar UKI',
    buying: 'Confirmando compra',
    enterAmount: 'Introduce una cantidad',
    quoting: 'Calculando ruta',
    unavailable: 'Ruta no disponible',
    helper: 'La operación se firma en tu wallet y se ejecuta directamente en PancakeSwap V2.',
    gas: 'Necesitas BNB para pagar el gas de red.',
    staging: 'En testnet solo está habilitada la ruta de prueba ASM → UKI.',
    approved: 'Importe autorizado. Ya puedes firmar la compra.',
    success: 'Compra confirmada en BNB Smart Chain.',
    tx: 'Ver transacción',
    fallback: 'Abrir el pool ASM/UKI en PancakeSwap',
    quoteError: 'No se ha podido cotizar esta ruta. Revisa el importe o inténtalo de nuevo.',
    configError: 'El swap no está configurado para esta red.',
    connectError: 'No se pudo conectar la wallet. Aprueba la conexión e inténtalo de nuevo.',
    transactionError: 'La operación no se completó. Revisa el mensaje de tu wallet e inténtalo de nuevo.',
  },
  en: {
    eyebrow: 'Direct purchase · PancakeSwap V2',
    title: 'Buy UKI',
    payWith: 'Pay with',
    amount: 'Amount to pay',
    receive: 'UKI you want to receive',
    editEither: 'You can edit either amount.',
    minimum: 'Minimum received',
    maximum: 'Maximum to pay',
    slippage: 'Tolerance',
    connect: 'Connect wallet',
    switchNetwork: 'Switch to BNB Smart Chain',
    approve: 'Approve exact amount',
    approving: 'Confirming approval',
    buy: 'Buy UKI',
    buying: 'Confirming purchase',
    enterAmount: 'Enter an amount',
    quoting: 'Calculating route',
    unavailable: 'Route unavailable',
    helper: 'You sign in your wallet and the swap executes directly through PancakeSwap V2.',
    gas: 'You need BNB to pay network gas.',
    staging: 'Only the ASM → UKI test route is enabled on testnet.',
    approved: 'Amount approved. You can now sign the purchase.',
    success: 'Purchase confirmed on BNB Smart Chain.',
    tx: 'View transaction',
    fallback: 'Open the ASM/UKI pool on PancakeSwap',
    quoteError: 'This route could not be quoted. Check the amount or try again.',
    configError: 'The swap is not configured for this network.',
    connectError: 'The wallet could not connect. Approve the connection and try again.',
    transactionError: 'The transaction did not complete. Check your wallet message and try again.',
  },
} as const;

type OperationState = 'idle' | 'approving' | 'approved' | 'swapping' | 'success' | 'error';
type QuoteDirection = 'exactInput' | 'exactOutput';

function parsePositiveAmount(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;

  try {
    const amount = parseUnits(normalized, 18);
    return amount > BigInt(0) ? amount : null;
  } catch {
    return null;
  }
}

function configuredAddress(value: string | undefined, fallback?: Address) {
  if (value && isAddress(value)) return getAddress(value);
  return fallback;
}

function transactionUrl(hash: Hash) {
  return `${ukiSaleContracts.blockExplorerBaseUrl.replace(/\/$/, '')}/tx/${hash}`;
}

export function UkiSwapPanel() {
  const { locale } = usePublicLocale();
  const copy = SWAP_COPY[locale];
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();
  const hasMounted = useHasMounted();
  const [sourceSymbol, setSourceSymbol] = useState<UkiSwapSourceSymbol>('BNB');
  const [sourceAmountInput, setSourceAmountInput] = useState('');
  const [ukiAmountInput, setUkiAmountInput] = useState('');
  const [quoteDirection, setQuoteDirection] = useState<QuoteDirection>('exactInput');
  const [slippageBps, setSlippageBps] = useState(50);
  const [operationState, setOperationState] = useState<OperationState>('idle');
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);
  const [locallyApproved, setLocallyApproved] = useState<{ token: Address; amount: bigint } | null>(null);
  const [isConnectorDialogOpen, setIsConnectorDialogOpen] = useState(false);

  const asmAddress = configuredAddress(
    ukiSaleContracts.asmTokenAddress,
    UKI_PRESALE_CHAIN_ID === 56 ? BSC_MAINNET_SWAP_TOKENS.asm : undefined,
  );
  const ukiAddress = configuredAddress(
    ukiSaleContracts.ukiTokenAddress,
    UKI_PRESALE_CHAIN_ID === 56 ? BSC_MAINNET_SWAP_TOKENS.uki : undefined,
  );
  const swapConfig = useMemo(() => (
    asmAddress && ukiAddress
      ? buildUkiSwapConfig({
          chainId: UKI_PRESALE_CHAIN_ID,
          asmAddress,
          ukiAddress,
        })
      : null
  ), [asmAddress, ukiAddress]);
  const source = swapConfig?.sources.find((item) => item.symbol === sourceSymbol)
    ?? swapConfig?.sources[0];
  const parsedSourceInput = useMemo(() => parsePositiveAmount(sourceAmountInput), [sourceAmountInput]);
  const parsedUkiInput = useMemo(() => parsePositiveAmount(ukiAmountInput), [ukiAmountInput]);
  const routePath = useMemo(() => source ? [...source.path] : [], [source]);
  const visibleConnectors = useMemo(
    () => (hasMounted ? getVisibleWalletConnectors(connectors) : []),
    [connectors, hasMounted],
  );
  const targetChainId = swapConfig?.chainId ?? UKI_PRESALE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: targetChainId });
  const isWrongChain = Boolean(hasMounted && isConnected && chainId !== targetChainId);

  const {
    data: exactInputQuote,
    error: exactInputQuoteError,
    isFetching: isExactInputQuoteLoading,
    refetch: refetchExactInputQuote,
  } = useReadContract({
    chainId: targetChainId,
    address: swapConfig?.routerAddress,
    abi: pancakeV2RouterAbi,
    functionName: 'getAmountsOut',
    args: quoteDirection === 'exactInput' && parsedSourceInput && routePath.length > 1
      ? [parsedSourceInput, routePath]
      : undefined,
    query: {
      enabled: Boolean(swapConfig && quoteDirection === 'exactInput' && parsedSourceInput && routePath.length > 1),
      staleTime: 5_000,
      retry: 1,
    },
  });

  const {
    data: exactOutputQuote,
    error: exactOutputQuoteError,
    isFetching: isExactOutputQuoteLoading,
    refetch: refetchExactOutputQuote,
  } = useReadContract({
    chainId: targetChainId,
    address: swapConfig?.routerAddress,
    abi: pancakeV2RouterAbi,
    functionName: 'getAmountsIn',
    args: quoteDirection === 'exactOutput' && parsedUkiInput && routePath.length > 1
      ? [parsedUkiInput, routePath]
      : undefined,
    query: {
      enabled: Boolean(swapConfig && quoteDirection === 'exactOutput' && parsedUkiInput && routePath.length > 1),
      staleTime: 5_000,
      retry: 1,
    },
  });

  const {
    data: allowance,
    refetch: refetchAllowance,
  } = useReadContract({
    chainId: targetChainId,
    address: source?.tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && swapConfig ? [address, swapConfig.routerAddress] : undefined,
    query: {
      enabled: Boolean(address && swapConfig && source?.tokenAddress && !isWrongChain),
      staleTime: 0,
    },
  });

  const quotedSource = quoteDirection === 'exactOutput' ? exactOutputQuote?.[0] : parsedSourceInput ?? undefined;
  const quotedUki = quoteDirection === 'exactInput'
    ? exactInputQuote?.[exactInputQuote.length - 1]
    : parsedUkiInput ?? undefined;
  const minimumUki = quoteDirection === 'exactInput' && quotedUki !== undefined
    ? applySlippageBps(quotedUki, slippageBps)
    : undefined;
  const maximumSource = quoteDirection === 'exactOutput' && quotedSource !== undefined
    ? applyMaximumSlippageBps(quotedSource, slippageBps)
    : undefined;
  const sourceAmount = quoteDirection === 'exactInput' ? parsedSourceInput ?? undefined : maximumSource;
  const activeInputAmount = quoteDirection === 'exactInput' ? parsedSourceInput : parsedUkiInput;
  const quoteError = quoteDirection === 'exactInput' ? exactInputQuoteError : exactOutputQuoteError;
  const isQuoteLoading = quoteDirection === 'exactInput'
    ? isExactInputQuoteLoading
    : isExactOutputQuoteLoading;
  const effectiveAllowance = source?.tokenAddress && locallyApproved?.token === source.tokenAddress
    ? locallyApproved.amount > (allowance ?? BigInt(0))
      ? locallyApproved.amount
      : allowance
    : allowance;
  const needsApproval = Boolean(
    source?.tokenAddress &&
    sourceAmount &&
    (effectiveAllowance === undefined || effectiveAllowance < sourceAmount),
  );
  const isBusy = operationState === 'approving' || operationState === 'swapping';
  const canSwap = Boolean(sourceAmount && quotedUki && !quoteError && swapConfig && source);

  async function connectWallet(connector: Connector) {
    try {
      await connectAsync({ connector, chainId: targetChainId });
      setIsConnectorDialogOpen(false);
      setOperationMessage(null);
    } catch {
      setOperationState('error');
      setOperationMessage(copy.connectError);
    }
  }

  async function handlePrimaryAction() {
    if (!hasMounted || isBusy) return;

    if (!isConnected) {
      if (visibleConnectors.length === 1) {
        await connectWallet(visibleConnectors[0]);
      } else if (visibleConnectors.length > 1) {
        setIsConnectorDialogOpen(true);
      } else {
        setOperationState('error');
        setOperationMessage(copy.connectError);
      }
      return;
    }

    if (isWrongChain) {
      try {
        await switchChainAsync({ chainId: targetChainId });
        setOperationMessage(null);
      } catch {
        setOperationState('error');
        setOperationMessage(copy.connectError);
      }
      return;
    }

    if (!address || !source || !swapConfig || !sourceAmount || !quotedUki || !publicClient) return;

    setOperationMessage(null);
    setLastTxHash(null);

    try {
      if (source.tokenAddress && needsApproval) {
        setOperationState('approving');
        const approvalHash = await writeContractAsync({
          chainId: targetChainId,
          address: source.tokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [swapConfig.routerAddress, sourceAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        setLocallyApproved({ token: source.tokenAddress, amount: sourceAmount });
        await refetchAllowance();
        setOperationState('approved');
        setOperationMessage(copy.approved);
        return;
      }

      setOperationState('swapping');
      const deadline = createSwapDeadline();
      let receivedUki: bigint;
      let swapHash: Hash;

      if (quoteDirection === 'exactInput') {
        if (!parsedSourceInput) return;
        const latestQuote = await publicClient.readContract({
          address: swapConfig.routerAddress,
          abi: pancakeV2RouterAbi,
          functionName: 'getAmountsOut',
          args: [parsedSourceInput, [...source.path]],
        });
        receivedUki = latestQuote[latestQuote.length - 1];
        const minimumOutput = applySlippageBps(receivedUki, slippageBps);

        swapHash = source.isNative
          ? await writeContractAsync({
              chainId: targetChainId,
              address: swapConfig.routerAddress,
              abi: pancakeV2RouterAbi,
              functionName: 'swapExactETHForTokens',
              args: [minimumOutput, [...source.path], address, deadline],
              value: parsedSourceInput,
            })
          : await writeContractAsync({
              chainId: targetChainId,
              address: swapConfig.routerAddress,
              abi: pancakeV2RouterAbi,
              functionName: 'swapExactTokensForTokens',
              args: [parsedSourceInput, minimumOutput, [...source.path], address, deadline],
            });
      } else {
        if (!parsedUkiInput) return;
        const latestQuote = await publicClient.readContract({
          address: swapConfig.routerAddress,
          abi: pancakeV2RouterAbi,
          functionName: 'getAmountsIn',
          args: [parsedUkiInput, [...source.path]],
        });
        const latestMaximumSource = applyMaximumSlippageBps(latestQuote[0], slippageBps);

        if (
          source.tokenAddress &&
          (effectiveAllowance === undefined || effectiveAllowance < latestMaximumSource)
        ) {
          setOperationState('approving');
          const approvalHash = await writeContractAsync({
            chainId: targetChainId,
            address: source.tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [swapConfig.routerAddress, latestMaximumSource],
          });
          await publicClient.waitForTransactionReceipt({ hash: approvalHash });
          setLocallyApproved({ token: source.tokenAddress, amount: latestMaximumSource });
          await refetchAllowance();
          setOperationState('approved');
          setOperationMessage(copy.approved);
          return;
        }

        receivedUki = parsedUkiInput;
        swapHash = source.isNative
          ? await writeContractAsync({
              chainId: targetChainId,
              address: swapConfig.routerAddress,
              abi: pancakeV2RouterAbi,
              functionName: 'swapETHForExactTokens',
              args: [parsedUkiInput, [...source.path], address, deadline],
              value: latestMaximumSource,
            })
          : await writeContractAsync({
              chainId: targetChainId,
              address: swapConfig.routerAddress,
              abi: pancakeV2RouterAbi,
              functionName: 'swapTokensForExactTokens',
              args: [parsedUkiInput, latestMaximumSource, [...source.path], address, deadline],
            });
      }

      await publicClient.waitForTransactionReceipt({ hash: swapHash });
      setLastTxHash(swapHash);
      setOperationState('success');
      setOperationMessage(copy.success);
      setLocallyApproved(null);
      await Promise.all([refetchExactInputQuote(), refetchExactOutputQuote(), refetchAllowance()]);
      toast({ title: copy.success, description: `${formatSwapAmount(receivedUki)} UKI` });
    } catch {
      setOperationState('error');
      setOperationMessage(copy.transactionError);
    }
  }

  function selectSource(symbol: UkiSwapSourceSymbol) {
    setSourceSymbol(symbol);
    setLocallyApproved(null);
    setOperationState('idle');
    setOperationMessage(null);
    setLastTxHash(null);
  }

  function resetOperationFeedback() {
    setOperationState('idle');
    setOperationMessage(null);
    setLastTxHash(null);
  }

  function changeSourceAmount(value: string) {
    setSourceAmountInput(value.replace(',', '.'));
    setQuoteDirection('exactInput');
    resetOperationFeedback();
  }

  function changeUkiAmount(value: string) {
    setUkiAmountInput(value.replace(',', '.'));
    setQuoteDirection('exactOutput');
    resetOperationFeedback();
  }

  const displayedSourceAmount = quoteDirection === 'exactInput'
    ? sourceAmountInput
    : formatEditableSwapAmount(quotedSource);
  const displayedUkiAmount = quoteDirection === 'exactOutput'
    ? ukiAmountInput
    : formatEditableSwapAmount(quotedUki);

  const ctaLabel = !isConnected
    ? copy.connect
    : isWrongChain
      ? copy.switchNetwork
      : !activeInputAmount
        ? copy.enterAmount
        : isQuoteLoading
          ? copy.quoting
          : quoteError
            ? copy.unavailable
            : operationState === 'approving'
              ? copy.approving
              : operationState === 'swapping'
                ? copy.buying
                : needsApproval
                  ? copy.approve
                  : copy.buy;
  const ctaDisabled = Boolean(
    isConnected &&
    !isWrongChain &&
    (!canSwap || isBusy || isQuoteLoading),
  );

  return (
    <Panel
      id="comprar-uki"
      className="uki-swap-panel scroll-mt-24"
      innerClassName="relative overflow-hidden p-4 sm:p-5"
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[var(--uki-lilac)]/8 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="uki-label">{copy.eyebrow}</p>
            <h2 className="mt-1 font-headline text-2xl font-black text-[var(--uki-cream)]">{copy.title}</h2>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac)]/10 text-[var(--uki-lilac)]">
            <Route className="h-5 w-5" strokeWidth={1.8} />
          </span>
        </div>

        {!swapConfig || !source ? (
          <div className="mt-4 rounded-[9px] border border-[#ff8e7a]/35 bg-[#40101f]/35 p-4 text-sm font-semibold text-[#ffd0df]">
            {copy.configError}
          </div>
        ) : (
          <>
            <fieldset className="mt-4">
              <legend className="uki-label">{copy.payWith}</legend>
              <div className={`mt-2 grid gap-2 ${swapConfig.sources.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
                {swapConfig.sources.map((option) => {
                  const selected = option.symbol === source.symbol;
                  return (
                    <button
                      key={option.symbol}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectSource(option.symbol)}
                      className={`min-h-10 rounded-[8px] border px-3 font-mono text-xs font-black transition active:translate-y-px ${selected
                        ? 'border-[var(--uki-lilac)] bg-[var(--uki-lilac)]/14 text-[var(--uki-lilac)]'
                        : 'border-white/10 bg-white/[0.035] text-[var(--uki-muted)] hover:border-white/20 hover:text-[var(--uki-cream)]'
                      }`}
                    >
                      {option.symbol}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-4 block">
              <span className="uki-label">{copy.amount}</span>
              <span className="mt-2 grid grid-cols-[1fr_auto] items-center overflow-hidden rounded-[9px] border border-white/12 bg-[#070817]/92 focus-within:border-[var(--uki-lilac)]">
                <input
                  value={displayedSourceAmount}
                  onChange={(event) => changeSourceAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.0"
                  aria-label={`${copy.amount} ${source.symbol}`}
                  className="h-14 min-w-0 bg-transparent px-4 font-mono text-xl font-black text-[var(--uki-cream)] outline-none placeholder:text-[var(--uki-muted)]/55"
                />
                <strong className="border-l border-white/10 px-4 font-mono text-sm text-[var(--uki-cream)]">
                  {source.symbol}
                </strong>
              </span>
            </label>

            <div className="my-2 flex justify-center" aria-hidden="true">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#070817] text-[var(--uki-lilac)]">
                <ArrowDown className="h-4 w-4" strokeWidth={1.8} />
              </span>
            </div>

            <div className="rounded-[9px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac)]/[0.055] p-3.5">
              <label className="block">
                <span className="text-xs font-semibold text-[var(--uki-muted)]">{copy.receive}</span>
                <span className="mt-2 grid grid-cols-[1fr_auto] items-center overflow-hidden rounded-[8px] border border-white/12 bg-[#070817]/78 focus-within:border-[var(--uki-lilac)]">
                  <input
                    value={displayedUkiAmount}
                    onChange={(event) => changeUkiAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder={isQuoteLoading ? '…' : '0.0'}
                    aria-label={`${copy.amount} UKI`}
                    className="h-12 min-w-0 bg-transparent px-3 font-mono text-lg font-black text-[var(--uki-cream)] outline-none placeholder:text-[var(--uki-muted)]/55"
                  />
                  <strong className="border-l border-white/10 px-3 font-mono text-sm text-[var(--uki-cream)]">UKI</strong>
                </span>
              </label>
              <p className="mt-2 text-[0.68rem] font-semibold text-[var(--uki-muted)]">{copy.editEither}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[0.67rem] font-bold uppercase tracking-[0.08em] text-[var(--uki-muted)]">
                <p>
                  {quoteDirection === 'exactInput' ? copy.minimum : copy.maximum}:{' '}
                  <strong className="font-mono text-[var(--uki-cream)]">
                    {quoteDirection === 'exactInput'
                      ? `${formatSwapAmount(minimumUki)} UKI`
                      : `${formatSwapAmount(maximumSource)} ${source.symbol}`}
                  </strong>
                </p>
                <label className="flex items-center gap-2">
                  <span>{copy.slippage}</span>
                  <select
                    value={slippageBps}
                    onChange={(event) => setSlippageBps(Number(event.target.value))}
                    className="rounded-[6px] border border-white/10 bg-[#070817] px-2 py-1 font-mono text-[var(--uki-cream)] outline-none focus:border-[var(--uki-lilac)]"
                  >
                    <option value={50}>0,5%</option>
                    <option value={100}>1%</option>
                    <option value={200}>2%</option>
                  </select>
                </label>
              </div>
            </div>

            {quoteError && activeInputAmount ? (
              <p className="mt-3 rounded-[8px] border border-[#f2c34b]/30 bg-[#2b1d08]/42 px-3 py-2 text-xs font-semibold text-[#ffe2a0]" role="alert">
                {copy.quoteError}
              </p>
            ) : null}

            {UKI_PRESALE_CHAIN_ID === 97 ? (
              <p className="mt-3 text-xs font-semibold text-[#ffe2a0]">{copy.staging}</p>
            ) : null}

            {operationMessage ? (
              <div
                className={`mt-3 flex items-start gap-2 rounded-[8px] border px-3 py-2 text-xs font-semibold ${operationState === 'error'
                  ? 'border-[#ff8e7a]/35 bg-[#40101f]/35 text-[#ffd0df]'
                  : 'border-[#65e2a2]/30 bg-[#123526]/45 text-[#b8f7d4]'
                }`}
                role={operationState === 'error' ? 'alert' : 'status'}
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span>{operationMessage}</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handlePrimaryAction()}
              disabled={ctaDisabled || isConnecting || isSwitching}
              className="uki-wallet-button mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isBusy || isConnecting || isSwitching || isQuoteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
              ) : !isConnected ? (
                <Wallet className="h-4 w-4" strokeWidth={1.8} />
              ) : (
                <ShieldCheck className="h-4 w-4" strokeWidth={1.8} />
              )}
              {ctaLabel}
            </button>

            <div className="mt-3 flex flex-col gap-2 text-[0.68rem] font-semibold leading-relaxed text-[var(--uki-muted)]">
              <span>{copy.helper} {copy.gas}</span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {UKI_PRESALE_CHAIN_ID === 56 && landingNetworkConfig.swapUrl ? (
                  <a
                    href={landingNetworkConfig.swapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-black text-[var(--uki-gold)] transition hover:text-[var(--uki-cream)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)]"
                  >
                    {copy.fallback}
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </a>
                ) : <span />}
                {lastTxHash ? (
                  <a
                    href={transactionUrl(lastTxHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-black text-[#65e2a2] transition hover:text-[var(--uki-cream)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)]"
                  >
                    {copy.tx}
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </a>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      <WalletConnectorDialog
        open={isConnectorDialogOpen}
        onOpenChange={setIsConnectorDialogOpen}
        connectors={visibleConnectors}
        onSelectConnector={connectWallet}
        isConnecting={isConnecting}
        title={copy.connect}
        description={`${UKI_PRESALE_CHAIN_LABEL}. ${copy.helper}`}
      />
    </Panel>
  );
}
