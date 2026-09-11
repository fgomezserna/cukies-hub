"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Address, type Hash } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import {
  ukiMarketplaceNftReadAbi,
  ukiMarketplaceReadAbi,
  ukiMarketplaceWriteAbi,
} from "@/lib/uki-marketplace/abi";
import { ukiMarketplacePublicConfig } from "@/lib/uki-marketplace/public-config";
import type { UkiMarketplaceOrderView } from "@/lib/uki-marketplace/types";
import {
  isTransactionRefreshAborted,
  TransactionReplacementError,
  TransactionReplacementPendingError,
  waitForConfirmedEvmTransaction,
} from "@/lib/transaction-refresh";
import { useWalletCoordinator } from "@/providers/wallet-coordinator-context";

export class UkiMarketplaceCancelPendingError extends Error {
  readonly hash: Hash;

  constructor(hash: Hash, cause?: unknown) {
    super("TRANSACTION_PENDING");
    this.name = "UkiMarketplaceCancelPendingError";
    this.hash = hash;
    if (cause !== undefined) this.cause = cause;
  }
}

export type UkiMarketplaceCancelResult = {
  hash: Hash;
};

export type UkiMarketplaceCancelPublicClient = {
  readContract: (request: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
  waitForTransactionReceipt: (...args: never[]) => Promise<{
    status: unknown;
    transactionHash?: string;
  }>;
};

export type UkiMarketplaceCancelWriteContract = (request: {
  chainId: 56 | 97;
  address: Address;
  abi: typeof ukiMarketplaceWriteAbi;
  functionName: "cancelOrder";
  args: [Hash];
}) => Promise<Hash>;

type CancelOrderInput = {
  order: UkiMarketplaceOrderView;
  walletAddress: string;
  expectedChainId: 56 | 97;
  marketplaceAddress: Address;
  publicClient: UkiMarketplaceCancelPublicClient;
  writeContractAsync: UkiMarketplaceCancelWriteContract;
  assertLiveContext?: () => void;
};

function sameAddress(
  left: string | null | undefined,
  right: string | null | undefined
) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function parseOnchainOrder(value: unknown) {
  if (!Array.isArray(value) || value.length < 8) {
    throw new Error("MARKETPLACE_CANCEL_INVALID_ORDER");
  }
  return value as [
    Address,
    Address,
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    number
  ];
}

/**
 * Performs the shared cancellation preflight and waits for the actual mined
 * receipt. Callers own presentation, index refresh and pending retry state.
 */
export async function cancelUkiMarketplaceOrder({
  order,
  walletAddress,
  expectedChainId,
  marketplaceAddress,
  publicClient,
  writeContractAsync,
  assertLiveContext,
}: CancelOrderInput): Promise<UkiMarketplaceCancelResult> {
  if (
    order.status !== "active" ||
    order.chainId !== expectedChainId ||
    !sameAddress(order.marketplaceAddress, marketplaceAddress) ||
    !sameAddress(walletAddress, order.seller)
  ) {
    throw new Error("MARKETPLACE_CANCEL_CONTEXT_CHANGED");
  }
  assertLiveContext?.();

  const collectionAddress = order.collectionAddress as Address;
  const tokenId = BigInt(order.tokenId);
  const [
    onchainOrderValue,
    stateValue,
    activeOrderIdValue,
    collectionAllowedValue,
    ownerValue,
  ] = await Promise.all([
    publicClient.readContract({
      address: marketplaceAddress,
      abi: ukiMarketplaceReadAbi,
      functionName: "orders",
      args: [order.orderId as Hash],
    }),
    publicClient.readContract({
      address: marketplaceAddress,
      abi: ukiMarketplaceReadAbi,
      functionName: "orderState",
      args: [order.orderId as Hash],
    }),
    publicClient.readContract({
      address: marketplaceAddress,
      abi: ukiMarketplaceReadAbi,
      functionName: "activeOrderIds",
      args: [collectionAddress, tokenId],
    }),
    publicClient.readContract({
      address: marketplaceAddress,
      abi: ukiMarketplaceReadAbi,
      functionName: "collectionAllowed",
      args: [collectionAddress],
    }),
    publicClient.readContract({
      address: collectionAddress,
      abi: ukiMarketplaceNftReadAbi,
      functionName: "ownerOf",
      args: [tokenId],
    }),
  ]);
  assertLiveContext?.();

  const onchainOrder = parseOnchainOrder(onchainOrderValue);
  const state = Number(stateValue);
  const activeOrderId = String(activeOrderIdValue);
  if (
    state !== 1 ||
    collectionAllowedValue !== true ||
    !sameAddress(ownerValue as string, order.seller) ||
    !sameAddress(onchainOrder[0], order.seller) ||
    !sameAddress(onchainOrder[1], order.collectionAddress) ||
    onchainOrder[2] !== tokenId ||
    onchainOrder[3] !== BigInt(order.ukiPriceRaw) ||
    activeOrderId.toLowerCase() !== order.orderId.toLowerCase()
  ) {
    throw new Error("MARKETPLACE_CANCEL_STALE_ORDER");
  }

  assertLiveContext?.();
  let hash: Hash;
  try {
    hash = await writeContractAsync({
      chainId: expectedChainId,
      address: marketplaceAddress,
      abi: ukiMarketplaceWriteAbi,
      functionName: "cancelOrder",
      args: [order.orderId as Hash],
    });
  } catch (reason) {
    throw reason;
  }
  try {
    const confirmed = await waitForConfirmedEvmTransaction(publicClient, hash);
    if (confirmed.receipt.status !== "success") {
      throw new Error("TRANSACTION_REVERTED");
    }
    return { hash: confirmed.hash };
  } catch (reason) {
    if (reason instanceof TransactionReplacementPendingError) {
      throw new UkiMarketplaceCancelPendingError(reason.hash, reason);
    }
    if (reason instanceof TransactionReplacementError) throw reason;
    if (isTransactionRefreshAborted(reason)) throw reason;
    // The transaction hash is already broadcast at this point. A transient
    // RPC/read timeout must remain recoverable through the Sheet's recheck
    // action instead of inviting a second signature.
    if (reason instanceof Error && reason.message !== "TRANSACTION_REVERTED") {
      throw new UkiMarketplaceCancelPendingError(hash, reason);
    }
    throw reason;
  }
}

type CancelControllerState = {
  busy: boolean;
  pending: {
    hash: Hash;
    wallet: string;
    chainId: 56 | 97;
    orderId: string;
  } | null;
  notice: string | null;
  error: string | null;
};

type UseUkiMarketplaceCancelControllerInput = {
  order: UkiMarketplaceOrderView | null;
  enabled?: boolean;
  onConfirmed?: (
    result: UkiMarketplaceCancelResult,
    order: UkiMarketplaceOrderView
  ) => void | Promise<void>;
};

export type UkiMarketplaceCancelController = CancelControllerState & {
  canCancel: boolean;
  cancelOrder: () => Promise<boolean>;
  recheckPending: () => Promise<boolean>;
  clearFeedback: () => void;
};

function cancelErrorMessage(reason: unknown) {
  if (reason instanceof Error) {
    const message = reason.message.toLowerCase();
    if (
      message.includes("user rejected") ||
      message.includes("user denied") ||
      message.includes("rejected")
    ) {
      return "La wallet canceló la firma. No se ha cambiado ningún anuncio.";
    }
    if (message === "marketplace_cancel_stale_order") {
      return "El anuncio cambió o ya no está activo. Actualiza tu colección antes de intentarlo de nuevo.";
    }
    if (message === "marketplace_cancel_context_changed") {
      return "La wallet o la red cambió. Vuelve a conectar la cuenta propietaria para cancelar este anuncio.";
    }
    if (message === "transaction_cancelled") {
      return "La transacción fue cancelada en la wallet. No se ha cambiado ningún anuncio.";
    }
    if (message === "transaction_replaced") {
      return "La transacción fue reemplazada por otra operación. Comprueba el estado antes de volver a intentarlo.";
    }
    if (message === "transaction_reverted") {
      return "La transacción fue revertida. El anuncio sigue sin cambios.";
    }
    if (message === "transaction_pending") {
      return "La transacción fue enviada. Conservamos el hash para comprobarla sin firmar otra vez.";
    }
    if (message === "wallet_coordinator_unavailable") {
      return "No se pudo abrir el selector de wallet. Conecta una wallet EVM para cancelar este anuncio.";
    }
    if (message === "wallet_request_cancelled") {
      return "No se ha conectado la wallet necesaria. Vuelve a intentarlo para cancelar este anuncio.";
    }
    if (message === "wallet_account_changed") {
      return "La wallet cambió durante la conexión. Vuelve a conectar la cuenta propietaria para cancelar este anuncio.";
    }
  }
  return "No se pudo cancelar el anuncio. Revisa la wallet y vuelve a intentarlo.";
}

/**
 * Shared controller for seller surfaces. It keeps transaction context local to
 * the exact order and never authorizes or submits on sheet open.
 */
export function useUkiMarketplaceCancelController({
  order,
  enabled = true,
  onConfirmed,
}: UseUkiMarketplaceCancelControllerInput): UkiMarketplaceCancelController {
  const { address, chainId } = useAccount();
  const expectedChainId = ukiMarketplacePublicConfig.chainId;
  const publicClient = usePublicClient({
    chainId: expectedChainId ?? undefined,
  });
  const { writeContractAsync } = useWriteContract();
  const { requestWallet } = useWalletCoordinator();
  const [state, setState] = useState<CancelControllerState>({
    busy: false,
    pending: null,
    notice: null,
    error: null,
  });
  const mountedRef = useRef(true);
  const contextRef = useRef<{
    address: string | null;
    chainId: number | null;
    orderId: string | null;
  }>({
    address: address ?? null,
    chainId: chainId ?? null,
    orderId: order?.orderId ?? null,
  });
  const pendingRef = useRef<CancelControllerState["pending"]>(null);
  contextRef.current = {
    address: address ?? null,
    chainId: chainId ?? null,
    orderId: order?.orderId ?? null,
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (
      address &&
      sameAddress(address, pending.wallet) &&
      chainId === pending.chainId &&
      order?.orderId &&
      pending.orderId === order.orderId
    ) {
      if (mountedRef.current) setState((current) => ({ ...current, pending }));
      return;
    }
    if (mountedRef.current)
      setState((current) => ({ ...current, pending: null }));
  }, [address, chainId, order?.orderId]);

  const assertLiveContext = useCallback(() => {
    if (
      !mountedRef.current ||
      !address ||
      !order ||
      contextRef.current.orderId !== order.orderId ||
      contextRef.current.chainId !== expectedChainId ||
      chainId !== expectedChainId ||
      !sameAddress(contextRef.current.address, address) ||
      !sameAddress(address, order.seller)
    ) {
      throw new Error("MARKETPLACE_CANCEL_CONTEXT_CHANGED");
    }
  }, [address, chainId, expectedChainId, order]);

  const cancelOrder = useCallback(async () => {
    if (!enabled || !order) return false;
    if (state.busy) return false;
    if (pendingRef.current) {
      setState((current) => ({
        ...current,
        notice: "La cancelación anterior sigue pendiente. Comprueba la transacción antes de volver a intentarlo.",
        error: null,
      }));
      return false;
    }
    if (order.status !== "active") {
      setState((current) => ({
        ...current,
        notice: null,
        error: "Este anuncio ya no está activo. Actualiza tu colección para ver el estado actual.",
      }));
      return false;
    }
    if (expectedChainId === null || (expectedChainId !== 56 && expectedChainId !== 97)) {
      setState((current) => ({
        ...current,
        notice: null,
        error: "La red del marketplace aún no está configurada.",
      }));
      return false;
    }
    if (order.chainId !== expectedChainId) {
      setState((current) => ({
        ...current,
        notice: null,
        error: "Este anuncio pertenece a otra red. Abre el marketplace en la red del anuncio para gestionarlo.",
      }));
      return false;
    }
    if (!ukiMarketplacePublicConfig.marketplaceAddress || !publicClient) {
      setState((current) => ({
        ...current,
        notice: null,
        error: "La cancelación no está disponible ahora. Actualiza la página e inténtalo de nuevo.",
      }));
      return false;
    }
    if (!address) {
      setState((current) => ({
        ...current,
        busy: true,
        notice: null,
        error: null,
      }));
      try {
        await requestWallet({
          kind: "evm",
          targetChainId: expectedChainId,
          reason: `Cancelación protegida del anuncio del Cukie #${order.tokenId}. No se firmará nada hasta confirmar.`,
        });
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            busy: false,
            notice: "Wallet preparada. Revisa la cancelación y pulsa confirmar cuando estés listo.",
            error: null,
          }));
        }
      } catch (reason) {
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            busy: false,
            notice: null,
            error: cancelErrorMessage(reason),
          }));
        }
      }
      return false;
    }
    if (chainId !== expectedChainId) {
      setState((current) => ({
        ...current,
        busy: true,
        notice: null,
        error: null,
      }));
      try {
        await requestWallet({
          kind: "evm",
          targetChainId: expectedChainId,
          reason: `Cambia a BSC para cancelar el anuncio del Cukie #${order.tokenId}. No se firmará nada hasta confirmar.`,
        });
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            busy: false,
            notice: "Red preparada. Revisa la cancelación y pulsa confirmar cuando estés listo.",
            error: null,
          }));
        }
      } catch (reason) {
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            busy: false,
            notice: null,
            error: cancelErrorMessage(reason),
          }));
        }
      }
      return false;
    }
    if (!sameAddress(address, order.seller)) {
      setState((current) => ({
        ...current,
        notice: null,
        error: "Conecta la wallet propietaria de este anuncio para cancelarlo.",
      }));
      return false;
    }
    const expectedOrder = order;
    const expectedAddress = address;
    const expectedChain = expectedChainId;
    setState({ busy: true, pending: null, notice: null, error: null });
    try {
      const result = await cancelUkiMarketplaceOrder({
        order: expectedOrder,
        walletAddress: expectedAddress,
        expectedChainId: expectedChain,
        marketplaceAddress: ukiMarketplacePublicConfig.marketplaceAddress,
        publicClient: publicClient as unknown as UkiMarketplaceCancelPublicClient,
        writeContractAsync:
          writeContractAsync as unknown as UkiMarketplaceCancelWriteContract,
        assertLiveContext,
      });
      if (!mountedRef.current) return false;
      let contextStable = true;
      try {
        assertLiveContext();
      } catch {
        contextStable = false;
      }
      setState({
        busy: false,
        pending: null,
        notice: contextStable
          ? "Anuncio cancelado en la cadena. Actualizando tu colección…"
          : "Anuncio cancelado en la cadena. La wallet cambió; vuelve a conectar la cuenta para actualizar tu colección.",
        error: null,
      });
      window.dispatchEvent(
        new CustomEvent("cukies:uki-marketplace:refresh", {
          detail: { hash: result.hash, orderId: expectedOrder.orderId },
        })
      );
      if (!contextStable) return true;
      try {
        await onConfirmed?.(result, expectedOrder);
      } catch {
        // The receipt is authoritative; an index refresh callback must not
        // turn a confirmed cancellation into a failed operation.
      }
      return true;
    } catch (reason) {
      if (!mountedRef.current) return false;
      if (isTransactionRefreshAborted(reason)) {
        setState((current) => ({ ...current, busy: false }));
        return false;
      }
      if (reason instanceof UkiMarketplaceCancelPendingError) {
        const pending = {
          hash: reason.hash,
          wallet: expectedAddress,
          chainId: expectedChain,
          orderId: expectedOrder.orderId,
        };
        pendingRef.current = pending;
        setState({
          busy: false,
          pending,
          notice: cancelErrorMessage(reason),
          error: null,
        });
      } else {
        setState({
          busy: false,
          pending: null,
          notice: null,
          error: cancelErrorMessage(reason),
        });
      }
      return false;
    }
  }, [
    address,
    assertLiveContext,
    chainId,
    enabled,
    expectedChainId,
    onConfirmed,
    order,
    publicClient,
    requestWallet,
    state.busy,
    writeContractAsync,
  ]);

  const recheckPending = useCallback(async () => {
    const pending = pendingRef.current;
    if (
      !pending ||
      state.busy ||
      !publicClient ||
      !order ||
      !address ||
      expectedChainId === null
    )
      return false;
    if (pending.orderId !== order.orderId) {
      setState((current) => ({
        ...current,
        notice: "Esta transacción pertenece a otro anuncio. Abre ese anuncio para comprobarla.",
        error: null,
      }));
      return false;
    }
    if (!sameAddress(address, pending.wallet) || chainId !== pending.chainId) {
      setState((current) => ({
        ...current,
        notice: "La wallet o la red cambió. Vuelve a conectar la cuenta original para comprobar la transacción pendiente.",
        error: null,
      }));
      return false;
    }
    try {
      assertLiveContext();
      setState((current) => ({
        ...current,
        busy: true,
        notice: "Comprobando la cancelación pendiente…",
        error: null,
      }));
      const confirmed = await waitForConfirmedEvmTransaction(
        publicClient,
        pending.hash
      );
      if (confirmed.receipt.status !== "success")
        throw new Error("TRANSACTION_REVERTED");
      assertLiveContext();
      pendingRef.current = null;
      setState({
        busy: false,
        pending: null,
        notice: "Anuncio cancelado en la cadena. Actualizando tu colección…",
        error: null,
      });
      window.dispatchEvent(
        new CustomEvent("cukies:uki-marketplace:refresh", {
          detail: { hash: confirmed.hash, orderId: order.orderId },
        })
      );
      try {
        await onConfirmed?.({ hash: confirmed.hash }, order);
      } catch {
        // The receipt is authoritative; keep the success state if the index
        // refresh callback is temporarily unavailable.
      }
      return true;
    } catch (reason) {
      if (!mountedRef.current) return false;
      if (isTransactionRefreshAborted(reason)) {
        setState((current) => ({ ...current, busy: false }));
        return false;
      }
      if (reason instanceof Error && reason.message === "TRANSACTION_REVERTED") {
        pendingRef.current = null;
        setState({
          busy: false,
          pending: null,
          notice: null,
          error: "La transacción fue revertida. El anuncio sigue activo.",
        });
      } else if (reason instanceof TransactionReplacementPendingError) {
        const updated = { ...pending, hash: reason.hash };
        pendingRef.current = updated;
        setState({
          busy: false,
          pending: updated,
          notice: cancelErrorMessage(reason),
          error: null,
        });
      } else if (reason instanceof TransactionReplacementError) {
        pendingRef.current = null;
        setState({
          busy: false,
          pending: null,
          notice: null,
          error: cancelErrorMessage(reason),
        });
      } else {
        setState((current) => ({
          ...current,
          busy: false,
          notice: cancelErrorMessage(reason),
          error: null,
        }));
      }
      return false;
    }
  }, [
    address,
    assertLiveContext,
    chainId,
    expectedChainId,
    onConfirmed,
    order,
    publicClient,
    state.busy,
  ]);

  const clearFeedback = useCallback(() => {
    setState((current) => ({ ...current, notice: null, error: null }));
  }, []);

  const canCancel = useMemo(
    () =>
      Boolean(
        enabled &&
          order &&
          order.status === "active" &&
          address &&
          expectedChainId !== null &&
          order.chainId === expectedChainId &&
          chainId === expectedChainId &&
          sameAddress(address, order.seller) &&
          !state.busy &&
          !pendingRef.current
      ),
    [address, chainId, enabled, expectedChainId, order, state.busy]
  );

  return {
    ...state,
    canCancel,
    cancelOrder,
    recheckPending,
    clearFeedback,
  };
}
