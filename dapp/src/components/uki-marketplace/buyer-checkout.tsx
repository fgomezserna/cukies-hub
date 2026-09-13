'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise,
  CheckCircle,
  Coins,
  HourglassMedium,
  LockKey,
  ShieldCheck,
  ShoppingCart,
  WarningCircle,
} from '@phosphor-icons/react';
import { formatUnits, type Address, type Hash } from 'viem';
import {
  useAccount,
  usePublicClient,
  useWriteContract,
} from 'wagmi';

import { Button } from '@/components/ui/button';
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';
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
import {
  isTransactionRefreshAborted,
  retryTransactionRefresh,
  TransactionReplacementError,
  TransactionReplacementPendingError,
  waitForConfirmedEvmTransaction,
} from '@/lib/transaction-refresh';

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

export type UkiMarketplaceCheckoutAction = {
  disabled: boolean;
  label: string;
  onClick: () => void;
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
  | { kind: 'pending'; hash: Hash; message: string }
  | { kind: 'approved'; hash: Hash; message: string }
  | { kind: 'success'; hash: Hash; message?: string }
  | { kind: 'error'; message: string };

type PendingCheckout = {
  hash: Hash;
  wallet: string;
  chainId: 56 | 97;
  orderId: string;
  kind: 'approval' | 'purchase';
};

class BroadcastPendingError extends Error {
  readonly hash: Hash;
  readonly operation: PendingCheckout['kind'];

  constructor(hash: Hash, operation: PendingCheckout['kind'], cause?: unknown) {
    super('TRANSACTION_PENDING');
    this.name = 'BroadcastPendingError';
    this.hash = hash;
    this.operation = operation;
    if (cause !== undefined) this.cause = cause;
  }
}

class ReceiptContextChangedError extends Error {
  readonly hash: Hash;
  readonly operation: PendingCheckout['kind'];

  constructor(hash: Hash, operation: PendingCheckout['kind'], cause?: unknown) {
    super('WALLET_CONTEXT_CHANGED');
    this.name = 'ReceiptContextChangedError';
    this.hash = hash;
    this.operation = operation;
    if (cause !== undefined) this.cause = cause;
  }
}

const CURRENCIES: UkiMarketplacePaymentCurrency[] = ['UKI', 'ASM', 'BNB', 'USDT', 'USDC'];

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
    return 'El anuncio ya no está disponible. Actualiza el marketplace.';
  }
  if (/InvalidPaymentBudget|EXCESSIVE_INPUT_AMOUNT|insufficient input amount/i.test(message)) {
    return 'La cotización cambió por encima del máximo protegido. Vuelve a cotizar.';
  }
  if (/TRANSACTION_CANCELLED/i.test(message)) {
    return 'La transacción fue cancelada en la wallet. No se ha completado la operación.';
  }
  if (/TRANSACTION_REPLACED/i.test(message)) {
    return 'La transacción fue reemplazada por otra operación. No se ha completado esta acción.';
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
  onBusyChange,
  onActionChange,
}: {
  order: UkiMarketplaceOrderView;
  onPurchased: () => void;
  onBusyChange?: (busy: boolean) => void;
  onActionChange?: (action: UkiMarketplaceCheckoutAction | null) => void;
}) {
  const { address, chainId, isConnected } = useAccount();
  const expectedChainId = ukiMarketplacePublicConfig.chainId;
  const publicClient = usePublicClient({ chainId: expectedChainId ?? undefined });
  const { writeContractAsync } = useWriteContract();
  const { requestWallet } = useWalletCoordinator();
  const [currency, setCurrency] = useState<UkiMarketplacePaymentCurrency>('UKI');
  const [quoteState, setQuoteState] = useState<QuoteState>({ kind: 'loading' });
  const [transactionState, setTransactionState] = useState<TransactionState>({ kind: 'idle' });
  const [reloadKey, setReloadKey] = useState(0);
  const [buyConfirmation, setBuyConfirmation] = useState(false);
  const [isPreparingBuy, setIsPreparingBuy] = useState(false);
  const mountedRef = useRef(true);
  const contextRef = useRef<{
    address: string | null;
    chainId: number | null;
    orderId: string;
    currency: UkiMarketplacePaymentCurrency;
  }>({
    address: address ?? null,
    chainId: chainId ?? null,
    orderId: order.orderId,
    currency,
  });
  const pendingCheckoutRef = useRef<PendingCheckout | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  contextRef.current = {
    address: address ?? null,
    chainId: chainId ?? null,
    orderId: order.orderId,
    currency,
  };
  const targetChainId = expectedChainId === 56 || expectedChainId === 97
    ? expectedChainId
    : null;
  const walletReady = Boolean(
    isConnected
    && address
    && targetChainId !== null
    && chainId === targetChainId,
  );
  const availableCurrencies = CURRENCIES.filter((item) => {
    if (item === 'UKI') return ukiMarketplacePublicConfig.ukiPaymentReady;
    if (item === 'ASM') return ukiMarketplacePublicConfig.asmPaymentReady;
    if (item === 'BNB') return ukiMarketplacePublicConfig.bnbPaymentReady;
    if (item === 'USDT') return ukiMarketplacePublicConfig.usdtPaymentReady;
    return ukiMarketplacePublicConfig.usdcPaymentReady;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const pending = pendingCheckoutRef.current;
    const matches = Boolean(
      pending
      && address
      && sameAddress(pending.wallet, address)
      && pending.chainId === chainId
      && pending.orderId === order.orderId
      && contextRef.current.orderId === pending.orderId,
    );
    if (matches && pending) {
      setPendingCheckout(pending);
      setTransactionState((current) => {
        if (current.kind !== 'idle' && current.kind !== 'error') return current;
        return {
          kind: 'pending',
          hash: pending.hash,
          message: pending.kind === 'purchase'
            ? 'La compra fue enviada. Comprueba su confirmación sin firmar otra vez.'
            : 'La autorización fue enviada. Comprueba su confirmación sin firmar otra vez.',
        };
      });
      return;
    }
    refreshAbortRef.current?.abort();
    setPendingCheckout(null);
    setTransactionState((current) => (
      current.kind === 'pending' || current.kind === 'success' || current.kind === 'approved'
        ? { kind: 'idle' }
        : current
    ));
  }, [address, chainId, order.orderId]);

  function assertLiveContext(expectedAddress: string, expectedChainId: 56 | 97) {
    if (
      !mountedRef.current
      || contextRef.current.orderId !== order.orderId
      || contextRef.current.currency !== currency
      || contextRef.current.chainId !== expectedChainId
      || !contextRef.current.address
      || !sameAddress(contextRef.current.address, expectedAddress)
    ) {
      throw new Error('WALLET_CONTEXT_CHANGED');
    }
  }

  function rememberPendingCheckout(pending: PendingCheckout) {
    pendingCheckoutRef.current = pending;
    if (mountedRef.current) {
      setPendingCheckout(pending);
      setTransactionState({
        kind: 'pending',
        hash: pending.hash,
        message: pending.kind === 'purchase'
          ? 'La compra fue enviada. Comprueba su confirmación sin firmar otra vez.'
          : 'La autorización fue enviada. Comprueba su confirmación sin firmar otra vez.',
      });
    }
  }

  function clearPendingCheckout() {
    pendingCheckoutRef.current = null;
    if (mountedRef.current) setPendingCheckout(null);
  }

  function pendingBelongsToCurrent() {
    const pending = pendingCheckoutRef.current;
    return Boolean(
      pending
      && address
      && sameAddress(pending.wallet, address)
      && pending.chainId === chainId
      && pending.orderId === order.orderId,
    );
  }

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
    const configuredAsm = ukiMarketplacePublicConfig.asmTokenAddress;
    const configuredRouter = ukiMarketplacePublicConfig.routerAddress;
    const configuredWrappedNative = ukiMarketplacePublicConfig.wrappedNativeAddress;
    const configuredUsdt = ukiMarketplacePublicConfig.usdtTokenAddress;
    const configuredUsdc = ukiMarketplacePublicConfig.usdcTokenAddress;
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
    } else if (currency !== 'UKI') {
      const tokenConfig = currency === 'ASM'
        ? {
            address: configuredAsm,
            path: ukiMarketplacePublicConfig.asmPaymentPath,
            ready: ukiMarketplacePublicConfig.asmPaymentReady,
            label: 'ASM',
          }
        : currency === 'USDT'
          ? {
              address: configuredUsdt,
              path: ukiMarketplacePublicConfig.usdtPaymentPath,
              ready: ukiMarketplacePublicConfig.usdtPaymentReady,
              label: 'USDT',
            }
          : {
              address: configuredUsdc,
              path: ukiMarketplacePublicConfig.usdcPaymentPath,
              ready: ukiMarketplacePublicConfig.usdcPaymentReady,
              label: 'USDC',
            };
      if (!tokenConfig.ready || !tokenConfig.address) {
        throw new Error(`El pago con ${tokenConfig.label} no está disponible ahora.`);
      }
      tokenAddress = tokenConfig.address;
      path = tokenConfig.path;
      if (
        !path[0]
        || !path.at(-1)
        || !sameAddress(path[0], tokenConfig.address)
        || !sameAddress(path.at(-1) as Address, configuredUki)
      ) {
        throw new Error(`No podemos preparar el cambio de ${tokenConfig.label} a UKI.`);
      }
      const [allowed, amounts, tokenDecimals, tokenSymbol] = await Promise.all([
        publicClient.readContract({
          address: marketplaceAddress,
          abi: ukiMarketplaceReadAbi,
          functionName: 'paymentTokenAllowed',
          args: [tokenConfig.address],
        }),
        publicClient.readContract({
          address: configuredRouter,
          abi: ukiMarketplaceRouterReadAbi,
          functionName: 'getAmountsIn',
          args: [ukiPrice, path],
        }),
        publicClient.readContract({
          address: tokenConfig.address,
          abi: ukiMarketplaceErc20Abi,
          functionName: 'decimals',
        }),
        publicClient.readContract({
          address: tokenConfig.address,
          abi: ukiMarketplaceErc20Abi,
          functionName: 'symbol',
        }),
      ]);
      if (!allowed) throw new Error(`${tokenConfig.label} no está habilitado como moneda de pago.`);
      if (
        amounts.length !== path.length
        || amounts.at(-1) !== ukiPrice
        || amounts[0] <= BigInt(0)
      ) {
        throw new Error(`El router devolvió una cotización ${tokenConfig.label} inválida.`);
      }
      if (tokenDecimals > 36) throw new Error(`Los decimales de ${tokenConfig.label} no son válidos.`);
      decimals = tokenDecimals;
      symbol = tokenSymbol || tokenConfig.label;
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
    setTransactionState((current) => (
      current.kind === 'idle' || current.kind === 'error'
        ? { kind: 'idle' }
        : current
    ));
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

  useEffect(() => {
    setBuyConfirmation(false);
  }, [address, chainId, currency, order.orderId, reloadKey]);

  async function writeAndConfirm(
    input: Parameters<typeof writeContractAsync>[0],
    expectedAddress: string,
    operation: PendingCheckout['kind'],
  ) {
    if (!publicClient) throw new Error('No podemos comprobar la red ahora.');
    assertLiveContext(expectedAddress, targetChainId!);
    const hash = await writeContractAsync(input);
    let confirmedHash = hash;
    let receipt;
    try {
      const confirmed = await waitForConfirmedEvmTransaction(publicClient, hash);
      receipt = confirmed.receipt;
      confirmedHash = confirmed.hash;
    } catch (reason) {
      if (reason instanceof TransactionReplacementError) throw reason;
      if (reason instanceof TransactionReplacementPendingError) {
        throw new BroadcastPendingError(reason.hash, operation, reason);
      }
      throw new BroadcastPendingError(hash, operation, reason);
    }
    if (receipt.status !== 'success') throw new Error('La operación no se ha completado.');
    try {
      assertLiveContext(expectedAddress, targetChainId!);
    } catch (reason) {
      throw new ReceiptContextChangedError(confirmedHash, operation, reason);
    }
    return confirmedHash;
  }

  async function ensureAllowance(quote: Quote, expectedAddress: string) {
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
      }, expectedAddress, 'approval');
    }
    setTransactionState({ kind: 'approving', message: `Autorizando el máximo exacto en ${quote.symbol}…` });
    await writeAndConfirm({
      chainId: expectedChainId!,
      address: quote.tokenAddress,
      abi: ukiMarketplaceErc20Abi,
      functionName: 'approve',
      args: [marketplaceAddress, quote.budget.maxTotalRaw],
    }, expectedAddress, 'approval');
  }

  async function buy() {
    const marketplaceAddress = ukiMarketplacePublicConfig.marketplaceAddress;
    if (!isConnected || !address || targetChainId === null || chainId !== targetChainId) {
      setBuyConfirmation(false);
      setTransactionState({ kind: 'error', message: 'Prepara la wallet y confirma de nuevo antes de comprar.' });
      return;
    }
    if (!marketplaceAddress || !publicClient) return;
    if (sameAddress(address, order.seller)) {
      setTransactionState({ kind: 'error', message: 'Este anuncio pertenece a tu wallet; otra wallet puede comprarlo.' });
      return;
    }

    const expectedAddress = address;
    const expectedChainId = targetChainId;
    if (pendingBelongsToCurrent()) return;
    try {
      setTransactionState({ kind: 'purchasing' });
      let freshQuote = await readQuote();
      if (freshQuote.balanceRaw !== null && freshQuote.balanceRaw < freshQuote.budget.maxTotalRaw) {
        throw new Error(`Saldo ${freshQuote.symbol} insuficiente para el máximo protegido.`);
      }
      await ensureAllowance(freshQuote, expectedAddress);

      assertLiveContext(expectedAddress, expectedChainId);
      freshQuote = await readQuote();
      if (freshQuote.balanceRaw !== null && freshQuote.balanceRaw < freshQuote.budget.maxTotalRaw) {
        throw new Error(`Saldo ${freshQuote.symbol} insuficiente para la cotización actualizada.`);
      }
      if (
        freshQuote.tokenAddress
        && (freshQuote.allowanceRaw ?? BigInt(0)) < freshQuote.budget.maxTotalRaw
      ) {
        await ensureAllowance(freshQuote, expectedAddress);
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
          chainId: targetChainId,
          address: marketplaceAddress,
          abi: ukiMarketplaceWriteAbi,
          functionName: 'buyWithUki',
          args: [order.orderId],
        }, expectedAddress, 'purchase');
      } else if (freshQuote.currency !== 'BNB' && freshQuote.tokenAddress) {
        hash = await writeAndConfirm({
          chainId: targetChainId,
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
        }, expectedAddress, 'purchase');
      } else {
        hash = await writeAndConfirm({
          chainId: targetChainId,
          address: marketplaceAddress,
          abi: ukiMarketplaceWriteAbi,
          functionName: 'buyWithNative',
          args: [order.orderId, freshQuote.path, deadline],
          value: freshQuote.budget.maxTotalRaw,
        } as unknown as Parameters<typeof writeContractAsync>[0], expectedAddress, 'purchase');
      }

      clearPendingCheckout();
      setTransactionState({ kind: 'success', hash });
      setBuyConfirmation(false);
      try {
        assertLiveContext(expectedAddress, expectedChainId);
      } catch {
        setTransactionState({
          kind: 'success',
          hash,
          message: 'Compra confirmada en la cadena. La wallet o la red cambió antes de actualizar esta vista.',
        });
        return;
      }
      window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', { detail: { hash } }));
      try {
        onPurchased();
      } catch {
        // A parent refresh callback must not turn a confirmed purchase into an error.
      }
      void refreshPurchasedState(expectedAddress, expectedChainId);
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      if (error instanceof BroadcastPendingError) {
        rememberPendingCheckout({
          hash: error.hash,
          wallet: expectedAddress,
          chainId: expectedChainId,
          orderId: order.orderId,
          kind: error.operation,
        });
        return;
      }
      if (error instanceof ReceiptContextChangedError) {
        clearPendingCheckout();
        setBuyConfirmation(false);
        setTransactionState({
          kind: error.operation === 'purchase' ? 'success' : 'approved',
          hash: error.hash,
          message: error.operation === 'purchase'
            ? 'Compra confirmada en la cadena. La wallet o la red cambió antes de actualizar esta vista.'
            : 'Autorización confirmada en la cadena. Vuelve a conectar la wallet original para continuar.',
        });
        return;
      }
      if (error instanceof Error && error.message === 'WALLET_CONTEXT_CHANGED') {
        setTransactionState({
          kind: 'error',
          message: 'La wallet o la red cambió antes de completar la compra. Comprueba la cuenta original antes de volver a intentarlo.',
        });
        return;
      }
      clearPendingCheckout();
      setTransactionState({ kind: 'error', message: transactionErrorMessage(error) });
    }
  }

  async function refreshPurchasedState(
    expectedAddress: string,
    expectedChainId: 56 | 97,
  ) {
    const marketplaceAddress = ukiMarketplacePublicConfig.marketplaceAddress;
    if (!marketplaceAddress || !publicClient) return;
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    try {
      const converged = await retryTransactionRefresh(
        async () => {
          assertLiveContext(expectedAddress, expectedChainId);
          try {
            const [finalState, finalOwner] = await Promise.all([
              publicClient!.readContract({
                address: marketplaceAddress,
                abi: ukiMarketplaceReadAbi,
                functionName: 'orderState',
                args: [order.orderId],
              }),
              publicClient!.readContract({
                address: order.collectionAddress,
                abi: ukiMarketplaceNftReadAbi,
                functionName: 'ownerOf',
                args: [BigInt(order.tokenId)],
              }),
            ]);
            assertLiveContext(expectedAddress, expectedChainId);
            return Number(finalState) === 2 && sameAddress(finalOwner, expectedAddress);
          } catch {
            return false;
          }
        },
        { signal: controller.signal },
      );
      if (converged && mountedRef.current) setReloadKey((value) => value + 1);
    } catch (reason) {
      if (!isTransactionRefreshAborted(reason) && !(reason instanceof Error && reason.message === 'WALLET_CONTEXT_CHANGED')) {
        // The chain receipt remains decisive; a delayed read must not turn it into a failure.
      }
    } finally {
      if (refreshAbortRef.current === controller) refreshAbortRef.current = null;
    }
  }

  async function recheckPendingCheckout() {
    const pending = pendingCheckoutRef.current;
    if (!pending || !publicClient || transactionState.kind === 'verifying') return;
    try {
      assertLiveContext(pending.wallet, pending.chainId);
    } catch {
      setTransactionState({
        kind: 'pending',
        hash: pending.hash,
        message: 'La wallet o la red cambió. Vuelve a conectar la cuenta original para comprobar esta transacción.',
      });
      return;
    }
    setTransactionState({ kind: 'verifying', hash: pending.hash });
    try {
      const confirmed = await waitForConfirmedEvmTransaction(publicClient, pending.hash);
      const receipt = confirmed.receipt;
      if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
      const confirmedHash = confirmed.hash;
      pending.hash = confirmedHash;
      try {
        assertLiveContext(pending.wallet, pending.chainId);
      } catch {
        clearPendingCheckout();
        setBuyConfirmation(pending.kind === 'approval');
        setTransactionState({
          kind: pending.kind === 'purchase' ? 'success' : 'approved',
          hash: confirmedHash,
          message: pending.kind === 'purchase'
            ? 'Compra confirmada en la cadena. La wallet o la red cambió antes de actualizar esta vista.'
            : 'Autorización confirmada en la cadena. La wallet o la red cambió; vuelve a conectar la cuenta original para continuar.',
        });
        return;
      }
      clearPendingCheckout();
      if (pending.kind === 'purchase') {
        setTransactionState({ kind: 'success', hash: confirmedHash });
        setBuyConfirmation(false);
        window.dispatchEvent(new CustomEvent('cukies:uki-marketplace:refresh', { detail: { hash: confirmedHash } }));
        try {
          onPurchased();
        } catch {
          // The receipt remains authoritative if the parent refresh callback fails.
        }
        void refreshPurchasedState(pending.wallet, pending.chainId);
      } else {
        setBuyConfirmation(true);
        setTransactionState({
          kind: 'approved',
          hash: confirmedHash,
          message: 'Autorización confirmada. Revisa y confirma la compra cuando estés listo.',
        });
        setReloadKey((value) => value + 1);
      }
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      if (error instanceof Error && error.message === 'TRANSACTION_REVERTED') {
        clearPendingCheckout();
        setTransactionState({ kind: 'error', message: 'La transacción fue revertida. No se ha completado ninguna compra.' });
      } else if (error instanceof TransactionReplacementPendingError) {
        const updated = { ...pending, hash: error.hash };
        pendingCheckoutRef.current = updated;
        setPendingCheckout(updated);
        setTransactionState({
          kind: 'pending',
          hash: error.hash,
          message: 'La transacción fue repriciada y sigue pendiente. Conservamos el hash nuevo; compruébala sin firmar otra vez.',
        });
      } else if (error instanceof TransactionReplacementError) {
        clearPendingCheckout();
        setTransactionState({ kind: 'error', message: transactionErrorMessage(error) });
      } else {
        setTransactionState({
          kind: 'pending',
          hash: pending.hash,
          message: 'La transacción sigue pendiente. Puedes volver a comprobarla sin firmar otra vez.',
        });
      }
    }
  }

  async function prepareBuy() {
    if (buyConfirmation) {
      await buy();
      return;
    }
    if (ownOrder) {
      setTransactionState({ kind: 'error', message: 'Este anuncio pertenece a tu wallet; otra wallet puede comprarlo.' });
      return;
    }
    if (targetChainId === null) {
      setTransactionState({ kind: 'error', message: 'La red de compra aún no está configurada.' });
      return;
    }

    setIsPreparingBuy(true);
    setTransactionState({ kind: 'idle' });
    try {
      if (!walletReady) {
        await requestWallet({
          kind: 'evm',
          targetChainId,
          reason: `Compra protegida del Cukie #${order.tokenId}. No se firmará nada hasta confirmar.`,
        });
      }
      setBuyConfirmation(true);
    } catch (error) {
      setTransactionState({ kind: 'error', message: transactionErrorMessage(error) });
    } finally {
      setIsPreparingBuy(false);
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
    || transactionState.kind === 'verifying'
    || transactionState.kind === 'pending';
  const actionLabel = isPreparingBuy
    ? 'Preparando wallet…'
    : transactionState.kind === 'approving'
      ? 'Autorizando…'
      : transactionState.kind === 'purchasing'
        ? 'Esperando firma…'
        : transactionState.kind === 'verifying'
          ? 'Verificando entrega…'
          : transactionState.kind === 'pending'
            ? 'Transacción pendiente'
            : buyConfirmation
              ? needsApproval && quote
                ? `Autorizar ${quote.symbol} y comprar`
                : `Confirmar compra con ${currency}`
              : walletReady
                ? 'Revisar y confirmar compra'
                : 'Conectar y revisar compra';
  const actionDisabled = !quote
    || busy
    || ownOrder
    || insufficientBalance
    || isPreparingBuy
    || (buyConfirmation && !walletReady);
  const prepareBuyRef = useRef<() => void>(() => undefined);
  prepareBuyRef.current = () => void prepareBuy();

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => {
    if (!onActionChange) return;
    onActionChange({
      disabled: actionDisabled,
      label: actionLabel,
      onClick: () => prepareBuyRef.current(),
    });
  }, [actionDisabled, actionLabel, onActionChange]);

  useEffect(() => () => onActionChange?.(null), [onActionChange]);

  return (
    <div className="grid gap-5">
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
              Actualizar precio
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
                  Cada moneda se habilita por separado cuando su contrato, allowlist y ruta
                  de liquidez están verificadas.
                </p>
              </div>
            )}
            {quoteState.kind === 'error' && (
              <div role="alert" className="rounded-[8px] border border-red-300/20 bg-red-300/[0.06] p-4">
                <p className="flex items-center gap-2 font-semibold text-red-100">
                  <WarningCircle aria-hidden className="h-5 w-5" weight="duotone" />
                  El anuncio no puede comprarse ahora
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

        <aside className="min-w-0 border-t border-white/10 pt-5">
          <div className="grid gap-3 text-sm text-slate-400">
            <p className="flex items-start gap-2">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lilac-100" weight="duotone" />
              Se vuelven a comprobar anuncio, propietario, permisos, precio y caducidad antes de pagar.
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
            {buyConfirmation && (
              <div role="status" className="mb-3 rounded-[8px] border border-lilac-200/25 bg-lilac-200/[0.08] p-3 text-sm text-lilac-50">
                <p className="font-bold">Revisa y confirma la compra</p>
                <p className="mt-1 text-xs leading-5 text-lilac-100/80">
                  Comprador: {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'wallet pendiente'} · Red: {targetChainId === 97 ? 'BSC Testnet' : targetChainId === 56 ? 'BSC' : 'pendiente'} · Cukie #{order.tokenId}
                </p>
                <p className="mt-1 text-xs leading-5 text-lilac-100/70">
                  El anuncio, la cotización, el saldo y la autorización se volverán a validar antes de pedir cualquier firma.
                </p>
              </div>
            )}
            {!onActionChange && (
              <Button
                type="button"
                onClick={() => void prepareBuy()}
                disabled={actionDisabled}
                className="w-full bg-lilac-200 text-[#0d0914] hover:bg-lilac-100 active:scale-[0.98]"
              >
                <ShoppingCart aria-hidden className="mr-2 h-4 w-4" weight="fill" />
                {actionLabel}
              </Button>
            )}
          </div>

          {ownOrder && (
            <p role="alert" className="mt-3 text-sm leading-5 text-amber-100">
              Este anuncio pertenece a tu wallet; solo otra wallet puede comprarlo.
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
          {transactionState.kind === 'approved' && (
            <div aria-live="polite" className="mt-4 rounded-[8px] border border-lilac-200/20 bg-lilac-200/[0.06] p-3 text-sm text-lilac-50">
              <p className="font-semibold">{transactionState.message}</p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                Autorización {transactionState.hash.slice(0, 10)}…
              </p>
            </div>
          )}
          {transactionState.kind === 'pending' && (
            <div aria-live="polite" className="mt-4 rounded-[8px] border border-amber-200/25 bg-amber-200/[0.07] p-3">
              <p className="text-sm font-semibold text-amber-100">{transactionState.message}</p>
              <button
                type="button"
                onClick={() => void recheckPendingCheckout()}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-amber-200/30 px-3 text-xs font-black uppercase tracking-[0.06em] text-amber-100"
              >
                <ArrowClockwise aria-hidden className="h-4 w-4" /> Comprobar transacción
              </button>
            </div>
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
                {transactionState.message ?? 'El anuncio quedó vendido y el Cukie ya pertenece a tu wallet.'}
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
  );
}
