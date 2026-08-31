'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowClockwise,
  CheckCircle,
  Coins,
  HourglassMedium,
  LockKey,
  ShieldCheck,
  ShoppingCart,
  Wallet,
  WarningCircle,
} from '@phosphor-icons/react';
import { formatUnits, type Address, type Hash } from 'viem';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

import { LandingWalletConnectButton } from '@/components/landing/wallet-connect-dynamic';
import { Button } from '@/components/ui/button';
import {
  calculateUkiMarketplaceCheckoutBudget,
  UKI_MARKETPLACE_QUOTE_DEADLINE_SECONDS,
  UKI_MARKETPLACE_SLIPPAGE_BPS,
  validateUkiMarketplaceOnchainOrder,
  type UkiMarketplaceCheckoutBudget,
  type UkiMarketplaceOnchainOrder,
  type UkiMarketplacePaymentCurrency,
} from '@/lib/uki-marketplace/checkout';
import {
  ukiMarketplaceErc20Abi,
  ukiMarketplaceNftReadAbi,
  ukiMarketplaceReadAbi,
  ukiMarketplaceRouterReadAbi,
  ukiMarketplaceWriteAbi,
} from '@/lib/uki-marketplace/abi';
import { ukiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';
import type { UkiMarketplaceOrderView } from '@/lib/uki-marketplace/types';

type Quote = {
  currency: UkiMarketplacePaymentCurrency;
  symbol: string;
  decimals: number;
  tokenAddress: Address | null;
  path: Address[];
  budget: UkiMarketplaceCheckoutBudget;
  balanceRaw: bigint | null;
  allowanceRaw: bigint | null;
  blockTimestamp: bigint;
};

type QuoteState =
  | { kind: 'loading' }
  | { kind: 'ready'; quote: Quote }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

type TransactionState =
  | { kind: 'idle' }
  | { kind: 'approving'; message: string }
  | { kind: 'purchasing' }
  | { kind: 'verifying'; hash: Hash }
  | { kind: 'success'; hash: Hash }
  | { kind: 'error'; message: string };

const CURRENCIES: UkiMarketplacePaymentCurrency[] = ['UKI', 'BNB', 'USDT'];

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function transactionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied|rejected the request/i.test(message)) {
    return 'La operación fue rechazada en la wallet.';
  }
  if (/insufficient funds/i.test(message)) {
    return 'No tienes saldo suficiente para el pago y el gas.';
  }
  if (/OrderNotPurchasable|orden ya no está activa/i.test(message)) {
    return 'La orden ya no está disponible. Actualiza el marketplace.';
  }
  if (/InvalidPaymentBudget|EXCESSIVE_INPUT_AMOUNT|insufficient input amount/i.test(message)) {
    return 'La cotización cambió por encima del máximo protegido. Vuelve a cotizar.';
  }
  return message.length > 220
    ? 'La operación no pudo completarse. Vuelve a cotizar y revisa la wallet.'
    : message;
}

function formatAmount(value: bigint, decimals: number, maximumFractionDigits = 6) {
  const [integer, fraction = ''] = formatUnits(value, decimals).split('.');
  const grouped = BigInt(integer || '0').toLocaleString('es-ES');
  const compactFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, '');
  return compactFraction ? `${grouped},${compactFraction}` : grouped;
}

function CheckoutSkeleton() {
  return (
    <div aria-label="Cotizando compra" className="grid animate-pulse gap-4 sm:grid-cols-2">
      <div className="h-20 rounded-[8px] bg-white/[0.045]" />
      <div className="h-20 rounded-[8px] bg-white/[0.045]" />
      <div className="h-11 rounded-[8px] bg-white/[0.055] sm:col-span-2" />
    </div>
  );
}

export function UkiMarketplaceBuyerCheckout({
  order,
  onPurchased,
}: {
  order: UkiMarketplaceOrderView;
  onPurchased: () => void;
}) {
  const { address, chainId, isConnected } = useAccount();
  const expectedChainId = ukiMarketplacePublicConfig.chainId;
  const publicClient = usePublicClient({ chainId: expectedChainId ?? undefined });
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [currency, setCurrency] = useState<UkiMarketplacePaymentCurrency>('UKI');
  const [quoteState, setQuoteState] = useState<QuoteState>({ kind: 'loading' });
  const [transactionState, setTransactionState] = useState<TransactionState>({ kind: 'idle' });
  const [reloadKey, setReloadKey] = useState(0);
  const availableCurrencies = CURRENCIES.filter((item) => {
    if (item === 'UKI') return ukiMarketplacePublicConfig.ukiPaymentReady;
    if (item === 'BNB') return ukiMarketplacePublicConfig.bnbPaymentReady;
    return ukiMarketplacePublicConfig.usdtPaymentReady;
  });

  const configReady = ukiMarketplacePublicConfig.ready
    && ukiMarketplacePublicConfig.checkoutReady
    && ukiMarketplacePublicConfig.ukiPaymentReady
    && expectedChainId !== null
    && Boolean(ukiMarketplacePublicConfig.marketplaceAddress)
    && Boolean(ukiMarketplacePublicConfig.ukiTokenAddress)
    && Boolean(ukiMarketplacePublicConfig.routerAddress)
    && Boolean(ukiMarketplacePublicConfig.wrappedNativeAddress);

  const readQuote = useCallback(async (): Promise<Quote> => {
    const marketplaceAddress = ukiMarketplacePublicConfig.marketplaceAddress;
    const configuredUki = ukiMarketplacePublicConfig.ukiTokenAddress;
    const configuredRouter = ukiMarketplacePublicConfig.routerAddress;
    const configuredWrappedNative = ukiMarketplacePublicConfig.wrappedNativeAddress;
    const configuredUsdt = ukiMarketplacePublicConfig.usdtTokenAddress;
    if (
      !configReady
      || !publicClient
      || !marketplaceAddress
      || !configuredUki
      || !configuredRouter
      || !configuredWrappedNative
    ) {
      throw new Error('CHECKOUT_UNAVAILABLE');
    }

    const tokenId = BigInt(order.tokenId);
    const [
      onchainOrder,
      contractState,
      activeOrderId,
      collectionAllowed,
      paused,
      onchainUki,
      onchainRouter,
      onchainWrappedNative,
      owner,
      approved,
      approvedForAll,
      block,
    ] = await Promise.all([
      publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'orders',
        args: [order.orderId],
      }),
      publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'orderState',
        args: [order.orderId],
      }),
      publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'activeOrderIds',
        args: [order.collectionAddress, tokenId],
      }),
      publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'collectionAllowed',
        args: [order.collectionAddress],
      }),
      publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'paused',
      }),
      publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'ukiToken',
      }),
      publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'router',
      }),
      publicClient.readContract({
        address: marketplaceAddress,
        abi: ukiMarketplaceReadAbi,
        functionName: 'wrappedNative',
      }),
      publicClient.readContract({
        address: order.collectionAddress,
        abi: ukiMarketplaceNftReadAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      publicClient.readContract({
        address: order.collectionAddress,
        abi: ukiMarketplaceNftReadAbi,
        functionName: 'getApproved',
        args: [tokenId],
      }),
      publicClient.readContract({
        address: order.collectionAddress,
        abi: ukiMarketplaceNftReadAbi,
        functionName: 'isApprovedForAll',
        args: [order.seller, marketplaceAddress],
      }),
      publicClient.getBlock(),
    ]);

    if (
      !sameAddress(onchainUki, configuredUki)
      || !sameAddress(onchainRouter, configuredRouter)
      || !sameAddress(onchainWrappedNative, configuredWrappedNative)
    ) {
      throw new Error('No podemos comprobar la configuración del marketplace.');
    }
    if (paused) throw new Error('El marketplace está pausado temporalmente.');
    if (!collectionAllowed) throw new Error('La colección ya no está habilitada.');
    if (!sameAddress(owner, order.seller)) {
      throw new Error('El vendedor ya no es propietario del Cukie.');
    }
    if (!sameAddress(approved, marketplaceAddress) && approvedForAll !== true) {
      throw new Error('El vendedor retiró la autorización del marketplace.');
    }

    validateUkiMarketplaceOnchainOrder({
      indexed: order,
      onchain: onchainOrder as UkiMarketplaceOnchainOrder,
      activeOrderId,
      expectedOrderId: order.orderId,
      contractState: Number(contractState),
      nowSeconds: block.timestamp,
    });

    const feeBps = Number((onchainOrder as UkiMarketplaceOnchainOrder)[6]);
    const ukiPrice = (onchainOrder as UkiMarketplaceOnchainOrder)[3];
    let tokenAddress: Address | null = configuredUki;
    let path: Address[] = [];
    let symbol = 'UKI';
    let decimals = 18;
    let quotedPaymentRaw = ukiPrice;

    if (currency === 'BNB') {
      if (!ukiMarketplacePublicConfig.bnbPaymentReady) {
        throw new Error('El pago con BNB no está disponible ahora.');
      }
      tokenAddress = null;
      path = ukiMarketplacePublicConfig.bnbPaymentPath;
      symbol = 'BNB';
      if (
        !path[0]
        || !path.at(-1)
        || !sameAddress(path[0], configuredWrappedNative)
        || !sameAddress(path.at(-1) as Address, configuredUki)
      ) {
        throw new Error('No podemos preparar el cambio de BNB a UKI.');
      }
      const [nativePaymentAllowed, amounts] = await Promise.all([
        publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'nativePaymentAllowed',
        }),
        publicClient.readContract({
          address: configuredRouter,
          abi: ukiMarketplaceRouterReadAbi,
          functionName: 'getAmountsIn',
          args: [ukiPrice, path],
        }),
      ]);
      if (!nativePaymentAllowed) {
        throw new Error('El pago con BNB no está disponible ahora.');
      }
      if (
        amounts.length !== path.length
        || amounts.at(-1) !== ukiPrice
        || amounts[0] <= BigInt(0)
      ) {
        throw new Error('El router devolvió una cotización BNB inválida.');
      }
      quotedPaymentRaw = amounts[0];
    } else if (currency === 'USDT') {
      if (!ukiMarketplacePublicConfig.usdtPaymentReady || !configuredUsdt) {
        throw new Error('El pago con USDT no está disponible ahora.');
      }
      tokenAddress = configuredUsdt;
      path = ukiMarketplacePublicConfig.usdtPaymentPath;
      if (
        !path[0]
        || !path.at(-1)
        || !sameAddress(path[0], configuredUsdt)
        || !sameAddress(path.at(-1) as Address, configuredUki)
      ) {
        throw new Error('No podemos preparar el cambio de USDT a UKI.');
      }
      const [allowed, amounts, tokenDecimals, tokenSymbol] = await Promise.all([
        publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'paymentTokenAllowed',
          args: [configuredUsdt],
        }),
        publicClient.readContract({
          address: configuredRouter,
          abi: ukiMarketplaceRouterReadAbi,
          functionName: 'getAmountsIn',
          args: [ukiPrice, path],
        }),
        publicClient.readContract({
          address: configuredUsdt,
          abi: ukiMarketplaceErc20Abi,
          functionName: 'decimals',
        }),
        publicClient.readContract({
          address: configuredUsdt,
          abi: ukiMarketplaceErc20Abi,
          functionName: 'symbol',
        }),
      ]);
      if (!allowed) throw new Error('USDT no está habilitado como moneda de pago.');
      if (
        amounts.length !== path.length
        || amounts.at(-1) !== ukiPrice
        || amounts[0] <= BigInt(0)
      ) {
        throw new Error('El router devolvió una cotización USDT inválida.');
      }
      if (tokenDecimals > 36) throw new Error('Los decimales de USDT no son válidos.');
      decimals = tokenDecimals;
      symbol = tokenSymbol || 'USDT';
      quotedPaymentRaw = amounts[0];
    } else {
      const [tokenDecimals, tokenSymbol] = await Promise.all([
        publicClient.readContract({
          address: configuredUki,
          abi: ukiMarketplaceErc20Abi,
          functionName: 'decimals',
        }),
        publicClient.readContract({
          address: configuredUki,
          abi: ukiMarketplaceErc20Abi,
          functionName: 'symbol',
        }),
      ]);
      if (tokenDecimals !== 18) throw new Error('UKI no usa los 18 decimales esperados.');
      decimals = tokenDecimals;
      symbol = tokenSymbol || 'UKI';
    }

    const budget = calculateUkiMarketplaceCheckoutBudget({
      quotedPaymentRaw,
      feeBps,
      slippageBps: currency === 'UKI' ? 0 : UKI_MARKETPLACE_SLIPPAGE_BPS,
    });
    let balanceRaw: bigint | null = null;
    let allowanceRaw: bigint | null = null;
    if (address) {
      if (tokenAddress) {
        [balanceRaw, allowanceRaw] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress,
            abi: ukiMarketplaceErc20Abi,
            functionName: 'balanceOf',
            args: [address],
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: ukiMarketplaceErc20Abi,
            functionName: 'allowance',
            args: [address, marketplaceAddress],
          }),
        ]);
      } else {
        balanceRaw = await publicClient.getBalance({ address });
      }
    }

    return {
      currency,
      symbol,
      decimals,
      tokenAddress,
      path,
      budget,
      balanceRaw,
      allowanceRaw,
      blockTimestamp: block.timestamp,
    };
  }, [address, configReady, currency, order, publicClient]);

  useEffect(() => {
    let active = true;
    if (!configReady) {
      setQuoteState({ kind: 'unavailable' });
      return () => { active = false; };
    }
    setQuoteState({ kind: 'loading' });
    setTransactionState({ kind: 'idle' });
    readQuote()
      .then((quote) => {
        if (active) setQuoteState({ kind: 'ready', quote });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof Error && error.message === 'CHECKOUT_UNAVAILABLE') {
          setQuoteState({ kind: 'unavailable' });
          return;
        }
        setQuoteState({ kind: 'error', message: transactionErrorMessage(error) });
      });
    return () => { active = false; };
  }, [configReady, readQuote, reloadKey]);

  async function writeAndConfirm(input: Parameters<typeof writeContractAsync>[0]) {
    if (!publicClient) throw new Error('No podemos comprobar la red ahora.');
    const hash = await writeContractAsync(input);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('La operación no se ha completado.');
    return hash;
  }

  async function ensureAllowance(quote: Quote) {
    const marketplaceAddress = ukiMarketplacePublicConfig.marketplaceAddress;
    if (!quote.tokenAddress || !marketplaceAddress || quote.allowanceRaw === null) return;
    if (quote.allowanceRaw >= quote.budget.maxTotalRaw) return;

    if (quote.allowanceRaw > BigInt(0)) {
      setTransactionState({ kind: 'approving', message: `Restableciendo autorización de ${quote.symbol}…` });
      await writeAndConfirm({
        chainId: expectedChainId!,
        address: quote.tokenAddress,
        abi: ukiMarketplaceErc20Abi,
        functionName: 'approve',
        args: [marketplaceAddress, BigInt(0)],
      });
    }
    setTransactionState({ kind: 'approving', message: `Autorizando el máximo exacto en ${quote.symbol}…` });
    await writeAndConfirm({
      chainId: expectedChainId!,
      address: quote.tokenAddress,
      abi: ukiMarketplaceErc20Abi,
      functionName: 'approve',
      args: [marketplaceAddress, quote.budget.maxTotalRaw],
    });
  }

  async function buy() {
    const marketplaceAddress = ukiMarketplacePublicConfig.marketplaceAddress;
    if (
      !isConnected
      || !address
      || expectedChainId === null
      || chainId !== expectedChainId
      || !marketplaceAddress
      || !publicClient
    ) return;
    if (sameAddress(address, order.seller)) {
      setTransactionState({ kind: 'error', message: 'El vendedor no puede comprar su propia orden.' });
      return;
    }

    try {
      setTransactionState({ kind: 'purchasing' });
      let freshQuote = await readQuote();
      if (freshQuote.balanceRaw !== null && freshQuote.balanceRaw < freshQuote.budget.maxTotalRaw) {
        throw new Error(`Saldo ${freshQuote.symbol} insuficiente para el máximo protegido.`);
      }
      await ensureAllowance(freshQuote);

      freshQuote = await readQuote();
      if (freshQuote.balanceRaw !== null && freshQuote.balanceRaw < freshQuote.budget.maxTotalRaw) {
        throw new Error(`Saldo ${freshQuote.symbol} insuficiente para la cotización actualizada.`);
      }
      if (
        freshQuote.tokenAddress
        && (freshQuote.allowanceRaw ?? BigInt(0)) < freshQuote.budget.maxTotalRaw
      ) {
        await ensureAllowance(freshQuote);
        freshQuote = await readQuote();
        if ((freshQuote.allowanceRaw ?? BigInt(0)) < freshQuote.budget.maxTotalRaw) {
          throw new Error('La autorización del token no cubre el máximo protegido.');
        }
      }

      setQuoteState({ kind: 'ready', quote: freshQuote });
      setTransactionState({ kind: 'purchasing' });
      const deadline = freshQuote.blockTimestamp
        + BigInt(UKI_MARKETPLACE_QUOTE_DEADLINE_SECONDS);
      let hash: Hash;
      if (freshQuote.currency === 'UKI') {
        hash = await writeAndConfirm({
          chainId: expectedChainId,
          address: marketplaceAddress,
          abi: ukiMarketplaceWriteAbi,
          functionName: 'buyWithUki',
          args: [order.orderId],
        });
      } else if (freshQuote.currency === 'USDT' && freshQuote.tokenAddress) {
        hash = await writeAndConfirm({
          chainId: expectedChainId,
          address: marketplaceAddress,
          abi: ukiMarketplaceWriteAbi,
          functionName: 'buyWithToken',
          args: [
            order.orderId,
            freshQuote.tokenAddress,
            freshQuote.budget.maxTotalRaw,
            freshQuote.path,
            deadline,
          ],
        });
      } else {
        hash = await writeAndConfirm({
          chainId: expectedChainId,
          address: marketplaceAddress,
          abi: ukiMarketplaceWriteAbi,
          functionName: 'buyWithNative',
          args: [order.orderId, freshQuote.path, deadline],
          value: freshQuote.budget.maxTotalRaw,
        } as unknown as Parameters<typeof writeContractAsync>[0]);
      }

      setTransactionState({ kind: 'verifying', hash });
      const [finalState, finalOwner] = await Promise.all([
        publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'orderState',
          args: [order.orderId],
        }),
        publicClient.readContract({
          address: order.collectionAddress,
          abi: ukiMarketplaceNftReadAbi,
          functionName: 'ownerOf',
          args: [BigInt(order.tokenId)],
        }),
      ]);
      if (Number(finalState) !== 2 || !sameAddress(finalOwner, address)) {
        throw new Error('El receipt fue correcto, pero no pudo verificarse la entrega atómica.');
      }

      setTransactionState({ kind: 'success', hash });
      window.dispatchEvent(new Event('cukies:uki-marketplace:refresh'));
      onPurchased();
    } catch (error: unknown) {
      setTransactionState({ kind: 'error', message: transactionErrorMessage(error) });
    }
  }

  const quote = quoteState.kind === 'ready' ? quoteState.quote : null;
  const ownOrder = Boolean(address && sameAddress(address, order.seller));
  const insufficientBalance = Boolean(
    quote
    && quote.balanceRaw !== null
    && quote.balanceRaw < quote.budget.maxTotalRaw,
  );
  const needsApproval = Boolean(
    quote?.tokenAddress
    && quote.allowanceRaw !== null
    && quote.allowanceRaw < quote.budget.maxTotalRaw,
  );
  const busy = transactionState.kind === 'approving'
    || transactionState.kind === 'purchasing'
    || transactionState.kind === 'verifying';

  return (
    <div className="border-t border-lilac-200/15 bg-[#0d0914] px-4 py-5 sm:px-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-lilac-100">
                <ShoppingCart aria-hidden className="h-4 w-4" weight="duotone" />
                Compra protegida
              </p>
              <h4 className="mt-1 font-headline text-xl font-bold text-white">
                Elige cómo pagar el Cukie #{order.tokenId}
              </h4>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                El vendedor recibe exactamente el precio en UKI. La comisión se calcula
                en la moneda que elijas y el intercambio solo se confirma si el NFT se entrega.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={quoteState.kind === 'loading' || busy}
              className="text-slate-300 active:scale-[0.98]"
            >
              <ArrowClockwise aria-hidden className="mr-2 h-4 w-4" />
              Recotizar
            </Button>
          </div>

          <div
            aria-label="Moneda de pago"
            className={availableCurrencies.length === 1
              ? 'mt-4 grid grid-cols-1 gap-2'
              : availableCurrencies.length === 2
                ? 'mt-4 grid grid-cols-2 gap-2'
                : 'mt-4 grid grid-cols-3 gap-2'}
          >
            {availableCurrencies.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={currency === item}
                onClick={() => setCurrency(item)}
                disabled={busy}
                className={currency === item
                  ? 'rounded-[8px] border border-lilac-200/45 bg-lilac-200/[0.12] px-3 py-2 text-sm font-bold text-lilac-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-300 ease-out active:scale-[0.98]'
                  : 'rounded-[8px] border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-semibold text-slate-400 transition duration-300 ease-out hover:border-white/20 hover:text-white active:scale-[0.98]'}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {quoteState.kind === 'loading' && <CheckoutSkeleton />}
            {quoteState.kind === 'unavailable' && (
              <div className="rounded-[8px] border border-amber-200/20 bg-amber-200/[0.06] p-4">
                <p className="flex items-center gap-2 font-semibold text-amber-100">
                  <WarningCircle aria-hidden className="h-5 w-5" weight="duotone" />
                  La compra no está disponible ahora
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  El anuncio puede consultarse, pero no se habilitará una firma hasta que
                  todos los datos necesarios estén disponibles.
                  BNB y USDT se habilitan por separado cuando sus rutas están verificadas.
                </p>
              </div>
            )}
            {quoteState.kind === 'error' && (
              <div role="alert" className="rounded-[8px] border border-red-300/20 bg-red-300/[0.06] p-4">
                <p className="flex items-center gap-2 font-semibold text-red-100">
                  <WarningCircle aria-hidden className="h-5 w-5" weight="duotone" />
                  La orden no puede comprarse ahora
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-300">{quoteState.message}</p>
              </div>
            )}
            {quote && (
              <div className="divide-y divide-white/10 rounded-[8px] border border-white/10 bg-white/[0.025] px-4">
                <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="text-sm text-slate-400">Precio que recibe el vendedor</span>
                  <strong className="font-mono text-sm tabular-nums text-white">
                    {formatAmount(BigInt(order.ukiPriceRaw), 18, 4)} UKI
                  </strong>
                </div>
                <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="text-sm text-slate-400">
                    {currency === 'UKI' ? 'Pago' : 'Pago estimado por el swap'}
                  </span>
                  <strong className="font-mono text-sm tabular-nums text-white">
                    {formatAmount(quote.budget.quotedPaymentRaw, quote.decimals)} {quote.symbol}
                  </strong>
                </div>
                <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="text-sm text-slate-400">
                    Comisión del marketplace ({(order.feeBps / 100).toLocaleString('es-ES')} %)
                  </span>
                  <strong className="font-mono text-sm tabular-nums text-white">
                    {formatAmount(quote.budget.quotedFeeRaw, quote.decimals)} {quote.symbol}
                  </strong>
                </div>
                <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-lilac-100">
                    <LockKey aria-hidden className="h-4 w-4" />
                    Máximo autorizado
                  </span>
                  <strong className="font-mono text-base tabular-nums text-lilac-50">
                    {formatAmount(quote.budget.maxTotalRaw, quote.decimals)} {quote.symbol}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="min-w-0 border-t border-white/10 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="grid gap-3 text-sm text-slate-400">
            <p className="flex items-start gap-2">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lilac-100" weight="duotone" />
              Se vuelven a comprobar orden, propietario, permisos, precio, nonce y caducidad antes de pagar.
            </p>
            <p className="flex items-start gap-2">
              <HourglassMedium aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lilac-100" weight="duotone" />
              {currency === 'UKI'
                ? 'El total es exacto y no necesita swap.'
                : 'El máximo incluye 1 % de protección y la cotización caduca en 10 minutos.'}
            </p>
            <p className="flex items-start gap-2">
              <Coins aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lilac-100" weight="duotone" />
              El sobrante del máximo se devuelve; nunca se cambia el precio UKI del vendedor.
            </p>
          </div>

          <div className="mt-5">
            {!isConnected ? (
              <LandingWalletConnectButton className="w-full justify-center" label="Conectar wallet para comprar" />
            ) : expectedChainId !== null && chainId !== expectedChainId ? (
              <Button
                type="button"
                onClick={() => switchChain({ chainId: expectedChainId })}
                disabled={isSwitchingChain}
                className="w-full active:scale-[0.98]"
              >
                <Wallet aria-hidden className="mr-2 h-4 w-4" />
                {isSwitchingChain ? 'Cambiando red…' : 'Cambiar de red'}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={buy}
                disabled={!quote || busy || ownOrder || insufficientBalance}
                className="w-full bg-lilac-200 text-[#0d0914] hover:bg-lilac-100 active:scale-[0.98]"
              >
                <ShoppingCart aria-hidden className="mr-2 h-4 w-4" weight="fill" />
                {transactionState.kind === 'approving'
                  ? 'Autorizando…'
                  : transactionState.kind === 'purchasing'
                    ? 'Esperando firma…'
                    : transactionState.kind === 'verifying'
                      ? 'Verificando entrega…'
                      : needsApproval && quote
                        ? `Autorizar ${quote.symbol} y comprar`
                        : `Confirmar compra con ${currency}`}
              </Button>
            )}
          </div>

          {ownOrder && (
            <p role="alert" className="mt-3 text-sm leading-5 text-amber-100">
              Esta orden pertenece a tu wallet; solo otra wallet puede comprarla.
            </p>
          )}
          {insufficientBalance && quote && (
            <p role="alert" className="mt-3 text-sm leading-5 text-red-100">
              Saldo insuficiente: necesitas hasta {formatAmount(quote.budget.maxTotalRaw, quote.decimals)} {quote.symbol}
              {currency === 'BNB' ? ', además del gas' : ''}.
            </p>
          )}
          {transactionState.kind === 'approving' && (
            <p aria-live="polite" className="mt-3 text-sm leading-5 text-lilac-100">
              {transactionState.message}
            </p>
          )}
          {transactionState.kind === 'error' && (
            <p role="alert" className="mt-3 text-sm leading-5 text-red-100">
              {transactionState.message}
            </p>
          )}
          {transactionState.kind === 'success' && (
            <div aria-live="polite" className="mt-4 rounded-[8px] border border-emerald-200/20 bg-emerald-200/[0.06] p-3">
              <p className="flex items-center gap-2 font-semibold text-emerald-100">
                <CheckCircle aria-hidden className="h-5 w-5" weight="fill" />
                Compra y entrega verificadas
              </p>
              <p className="mt-1 text-sm leading-5 text-slate-300">
                La orden quedó vendida y el Cukie ya pertenece a tu wallet.
              </p>
              {ukiMarketplacePublicConfig.explorerBaseUrl && (
                <a
                  href={`${ukiMarketplacePublicConfig.explorerBaseUrl}/tx/${transactionState.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex font-mono text-xs text-lilac-100 underline decoration-lilac-200/30 underline-offset-4"
                >
                  Ver transacción {transactionState.hash.slice(0, 10)}…
                </a>
              )}
            </div>
          )}

          {quote && address && (
            <p className="mt-4 break-all font-mono text-[11px] leading-5 text-slate-600">
              Wallet {address} · autorización {quote.tokenAddress
                ? formatAmount(quote.allowanceRaw ?? BigInt(0), quote.decimals)
                : 'no aplica'}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
