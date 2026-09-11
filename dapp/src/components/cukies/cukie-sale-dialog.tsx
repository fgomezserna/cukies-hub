'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Network,
  ShieldCheck,
  Store,
} from 'lucide-react';
import {
  formatUnits,
  isAddress,
  parseEther,
  type Address,
} from 'viem';
import { getAccount, getChainId } from 'wagmi/actions';
import { useAccount, useConfig, usePublicClient, useWriteContract } from 'wagmi';

import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTronLink } from '@/hooks/use-tronlink';
import {
  legacyMarketplaceBscAbis,
} from '@/lib/legacy-marketplace/abis';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import {
  assertEvmActionContext,
  assertTronActionContext,
  captureTronActionContext,
  isSameEvmWallet,
  isSameTronWallet,
} from '@/lib/legacy-marketplace/action-safety';
import {
  getLegacyTronWeb,
  getLegacyTronReadWeb,
  readLegacyTronContract,
  sendLegacyTronContract,
} from '@/lib/legacy-marketplace/tron';
import {
  defaultUkiMarketplaceExpiry,
  validateUkiMarketplaceListing,
} from '@/lib/uki-marketplace/listing';
import {
  ukiMarketplaceNftReadAbi,
  ukiMarketplaceReadAbi,
  ukiMarketplaceWriteAbi,
} from '@/lib/uki-marketplace/abi';
import { ukiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';
import type { MyCukieCollectionItem } from '@/lib/cukies-data/my-collection-types';
import {
  isTransactionRefreshAborted,
  TransactionReplacementError,
  TransactionReplacementPendingError,
  waitForConfirmedEvmTransaction,
  waitForTransactionRefresh,
} from '@/lib/transaction-refresh';
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';

type SaleSurface = 'legacy-bsc' | 'legacy-tron' | 'uki';
type ApprovalState = 'unknown' | 'checking' | 'required' | 'approved' | 'pending' | 'blocked' | 'error';
type TransactionPhase = 'idle' | 'checking' | 'approving' | 'listing' | 'syncing';
type ListingState = 'idle' | 'pending' | 'confirmed' | 'published';

type CukieSaleDialogProps = {
  cuki: MyCukieCollectionItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
  preferredSurface?: 'uki';
};

type EvmInspection = {
  owner: string;
  approved: boolean;
  approvedForAll: boolean;
  paused: boolean;
  activeListing: boolean;
  collectionAllowed: boolean;
  feeRaw: bigint | null;
};

type TronInspection = EvmInspection;

type Inspection = EvmInspection | TronInspection;

const ZERO_HASH = `0x${'0'.repeat(64)}`;

class BroadcastPendingError extends Error {
  readonly hash: string;

  constructor(hash: string, cause?: unknown) {
    super('TRANSACTION_PENDING');
    this.name = 'BroadcastPendingError';
    this.hash = hash;
    if (cause !== undefined) this.cause = cause;
  }
}

function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function shortIdentity(value: string | null | undefined) {
  if (!value) return 'No conectada';
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function asBigInt(value: unknown) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (value && typeof value === 'object' && 'toString' in value) {
    const result = String(value);
    if (/^\d+$/.test(result)) return BigInt(result);
  }
  throw new Error('INVALID_CONTRACT_VALUE');
}

function asBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  throw new Error('INVALID_CONTRACT_VALUE');
}

function tupleField(value: unknown, name: string, index: number) {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object') {
    return (value as Record<string, unknown>)[name]
      ?? (value as Record<string, unknown>)[String(index)];
  }
  return undefined;
}

function normalizedPrice(value: string) {
  return value.trim().replace(',', '.');
}

function parseBscPrice(value: string) {
  const normalized = normalizedPrice(value);
  if (!/^\d+(?:\.\d{1,18})?$/.test(normalized)) throw new Error('INVALID_PRICE');
  const parsed = parseEther(normalized);
  if (parsed <= BigInt(0)) throw new Error('INVALID_PRICE');
  return parsed;
}

function parseTronPrice(value: string) {
  const normalized = normalizedPrice(value);
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) throw new Error('INVALID_PRICE');
  const [whole, fraction = ''] = normalized.split('.');
  const parsed = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, '0'));
  if (parsed <= BigInt(0) || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('INVALID_PRICE');
  }
  return parsed;
}

function surfaceList(cuki: MyCukieCollectionItem): SaleSurface[] {
  const surfaces: SaleSurface[] = [];
  const network = cuki.network?.toUpperCase();
  const declared = cuki.sellSurfaces ?? [];
  const hasLegacy = declared.includes('legacy') || cuki.marketplaceSurface === 'legacy';
  const hasUki = declared.includes('uki') || cuki.marketplaceSurface === 'uki';
  if (hasLegacy && network === 'BSC') surfaces.push('legacy-bsc');
  if (hasLegacy && network === 'TRON') surfaces.push('legacy-tron');
  if (hasUki && network === 'BSC') surfaces.push('uki');
  return [...new Set(surfaces)];
}

function defaultSurface(cuki: MyCukieCollectionItem, surfaces: SaleSurface[]) {
  const network = cuki.network?.toUpperCase();
  if (cuki.marketplaceSurface === 'uki' && surfaces.includes('uki')) return 'uki' as const;
  if (cuki.marketplaceSurface === 'legacy') {
    if (network === 'TRON' && surfaces.includes('legacy-tron')) return 'legacy-tron' as const;
    if (network === 'BSC' && surfaces.includes('legacy-bsc')) return 'legacy-bsc' as const;
  }
  return surfaces[0] ?? null;
}

function surfaceLabel(surface: SaleSurface | null) {
  if (surface === 'legacy-bsc') return 'Legacy · BNB';
  if (surface === 'legacy-tron') return 'Legacy · TRX';
  if (surface === 'uki') return 'UKI · BSC';
  return 'Destino no disponible';
}

function surfaceCurrency(surface: SaleSurface | null) {
  if (surface === 'legacy-bsc') return 'BNB';
  if (surface === 'legacy-tron') return 'TRX';
  if (surface === 'uki') return 'UKI';
  return '—';
}

function targetChainId(surface: SaleSurface | null) {
  if (surface === 'legacy-bsc') return 56 as const;
  if (surface === 'uki' && (ukiMarketplacePublicConfig.chainId === 56 || ukiMarketplacePublicConfig.chainId === 97)) {
    return ukiMarketplacePublicConfig.chainId;
  }
  return null;
}

function targetCollection(cuki: MyCukieCollectionItem, surface: SaleSurface | null) {
  const collection = cuki.collectionAddress?.trim();
  if (!collection) return null;
  if (surface === 'legacy-bsc' && sameAddress(collection, legacyMarketplaceContracts.bsc.contracts.token)) {
    return legacyMarketplaceContracts.bsc.contracts.token as Address;
  }
  if (surface === 'legacy-tron' && collection === legacyMarketplaceContracts.tron.contracts.token) {
    return legacyMarketplaceContracts.tron.contracts.token;
  }
  if (
    surface === 'uki'
    && isAddress(collection, { strict: false })
    && ukiMarketplacePublicConfig.collectionAddresses.some((address) => sameAddress(address, collection))
  ) return collection as Address;
  return null;
}

function surfaceIdentityError(cuki: MyCukieCollectionItem, surface: SaleSurface | null) {
  const network = cuki.network?.toUpperCase();
  if (!surface) return 'Este Cukie no tiene un destino de venta verificable.';
  if (
    cuki.custody !== 'wallet'
    || cuki.state !== 'available'
    || cuki.poolStatus !== null
    || cuki.saleKind !== null
  ) {
    return 'Este Cukie está bloqueado por su estado actual y no se puede publicar.';
  }
  if (!cuki.availableActions.includes('sell')) {
    return 'La colección no ha confirmado que este Cukie se pueda vender ahora.';
  }
  if (surface === 'legacy-bsc' && (network !== 'BSC' || cuki.chainId !== 56)) {
    return 'La identidad Legacy BSC de este Cukie no coincide con la red de firma.';
  }
  if (surface === 'legacy-tron' && network !== 'TRON') {
    return 'La identidad TRON de este Cukie no coincide con la red de firma.';
  }
  if (surface === 'uki' && (
    network !== 'BSC'
    || cuki.chainId !== ukiMarketplacePublicConfig.chainId
    || !ukiMarketplacePublicConfig.ready
  )) {
    return 'La identidad UKI de este Cukie no coincide con la red de firma.';
  }
  if (!targetCollection(cuki, surface)) {
    return 'La colección de este Cukie no está habilitada para ese destino.';
  }
  return null;
}

function legacyFeeBpsFromRaw(value: bigint | null | undefined) {
  if (value === null || value === undefined || value < BigInt(0) || value > BigInt(10_000)) {
    return null;
  }
  return value;
}

function legacyFeeLabel(value: bigint | null | undefined) {
  const feeBps = legacyFeeBpsFromRaw(value);
  if (feeBps === null) return null;
  return `${(Number(feeBps) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`;
}

function legacySellerAmountLabel(price: string, surface: SaleSurface | null, feeRaw: bigint | null | undefined) {
  if (surface !== 'legacy-bsc' && surface !== 'legacy-tron') return null;
  const feeBps = legacyFeeBpsFromRaw(feeRaw);
  if (feeBps === null) return null;
  try {
    const priceRaw = surface === 'legacy-bsc' ? parseBscPrice(price) : parseTronPrice(price);
    const sellerRaw = priceRaw - (priceRaw * feeBps / BigInt(10_000));
    const decimals = surface === 'legacy-bsc' ? 18 : 6;
    return `${formatUnits(sellerRaw, decimals)} ${surfaceCurrency(surface)}`;
  } catch {
    return null;
  }
}

function transactionMessage(reason: unknown) {
  const values: string[] = [];
  const seen = new Set<unknown>();
  const collect = (value: unknown, depth = 0) => {
    if (depth > 4 || value === null || value === undefined || seen.has(value)) return;
    if (typeof value === 'string') {
      if (value.trim()) values.push(value.trim());
      return;
    }
    if (typeof value !== 'object') return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ['shortMessage', 'message', 'details', 'reason', 'error', 'data', 'cause', 'code']) {
      collect(record[key], depth + 1);
    }
  };
  collect(reason);
  return values.join(' ').toLowerCase();
}

function userError(reason: unknown) {
  const message = transactionMessage(reason);
  if (message.includes('user rejected') || message.includes('user denied') || message.includes('rejected') || message.includes('4001')) {
    return 'La wallet rechazó la firma. El precio se conserva y no se ha publicado el Cukie.';
  }
  if (message.includes('invalid_price') || message.includes('invalid price')) return 'Introduce un precio válido mayor que cero.';
  if (message.includes('marketplacenotapproved') || message.includes('approval_required') || message.includes('not approved')) {
    return 'El contrato aún no tiene permiso para este Cukie. Apruébalo y vuelve a publicar.';
  }
  if (message.includes('not_owner') || message.includes('notowned') || message.includes('not token owner')) {
    return 'La wallet conectada ya no es la propietaria de este Cukie.';
  }
  if (
    message.includes('wallet_context_changed')
    || message.includes('wallet_account_changed')
    || message.includes('wallet_request_replaced')
    || message.includes('wallet_request_cancelled')
    || message.includes('account changed')
    || message.includes('chain changed')
  ) {
      return 'La cuenta o la red cambió durante la validación. No se ha enviado la operación.';
  }
  if (message.includes('transaction_reverted') || message.includes('execution reverted') || message.includes('reverted')) {
    return 'El contrato rechazó la operación. Actualiza el estado del Cukie y vuelve a intentarlo.';
  }
  if (message.includes('energy') || message.includes('bandwidth')) {
    return 'TRON no tiene suficiente energía o ancho de banda para completar la operación.';
  }
  if (message.includes('insufficient funds') || message.includes('insufficient balance')) {
    return 'La wallet no tiene saldo suficiente para las comisiones de red.';
  }
  if (
    message.includes('tron_signer_unavailable')
  ) {
    return 'Conecta TronLink para confirmar la operación y vuelve a intentarlo.';
  }
  if (
    message.includes('tron_not_ready')
    || message.includes('tron provider')
    || message.includes('missing signer')
    || message.includes('signer unavailable')
  ) {
    return 'TronLink no está preparado en TRON Mainnet. Conéctalo y vuelve a intentarlo.';
  }
  if (message.includes('wallet_coordinator_unavailable')) {
    return 'No se pudo preparar la wallet. Vuelve a conectar la red de firma.';
  }
  if (message.includes('transaction_pending')) {
    return 'La transacción sigue pendiente. Puedes comprobarla sin firmar otra vez.';
  }
  if (message.includes('transaction_cancelled')) {
    return 'La wallet canceló la transacción. No se ha publicado el Cukie.';
  }
  if (message.includes('transaction_replaced')) {
    return 'La transacción fue reemplazada por otra operación. No se ha publicado el Cukie.';
  }
  if (message.includes('wallet_not_ready') || message.includes('bsc_not_ready')) {
    return 'Conecta la wallet en la red indicada para continuar.';
  }
  if (message.includes('marketplace_paused')) return 'El marketplace está pausado temporalmente.';
  if (reason instanceof Error && reason.message.startsWith('SALE_UI:')) return reason.message.slice('SALE_UI:'.length);
  return 'La operación no se pudo confirmar. Revisa la wallet, la red y el estado del Cukie; el precio se conserva.';
}

function tronTransactionId(value: unknown): string | null {
  if (typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const candidate of [record.id, record.txid, record.txID, record.transactionHash, record.hash]) {
    if (typeof candidate === 'string' && /^[0-9a-f]{64}$/i.test(candidate)) return candidate;
  }
  if (record.transaction && typeof record.transaction === 'object') return tronTransactionId(record.transaction);
  return null;
}

function assertTronSendResult(result: unknown) {
  if (typeof result === 'string' && /failed|revert|error/i.test(result)) {
    throw new Error('TRANSACTION_REVERTED');
  }
  if (!result || typeof result !== 'object') return;
  const record = result as Record<string, unknown>;
  const values = [record.result, record.code, record.contractRet, record.status]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
  if (record.result === false || record.success === false || values.some((value) => (
    value.includes('failed')
    || value.includes('revert')
    || value.includes('error')
    || value.includes('out_of_energy')
    || value.includes('out_of_time')
  ))) throw new Error('TRANSACTION_REVERTED');
  const receipt = record.receipt;
  if (receipt && typeof receipt === 'object') {
    const receiptResult = (receipt as Record<string, unknown>).result;
    if (typeof receiptResult === 'string' && /failed|revert|error|out_of_energy|out_of_time/i.test(receiptResult)) {
      throw new Error('TRANSACTION_REVERTED');
    }
    if (receiptResult !== undefined && receiptResult !== 'SUCCESS' && receiptResult !== 'success' && receiptResult !== true) {
      throw new Error('TRANSACTION_REVERTED');
    }
  }
}

async function waitForTronReceipt(result: unknown) {
  const txId = tronTransactionId(result);
  if (!txId) throw new Error('TRANSACTION_PENDING');
  const tronWeb = getLegacyTronWeb() as (ReturnType<typeof getLegacyTronWeb> & {
    trx?: { getTransactionInfo?: (hash: string) => Promise<unknown> };
  }) | null;
  const trx = tronWeb?.trx;
  const getInfo = trx?.getTransactionInfo;
  if (!trx || typeof getInfo !== 'function') throw new Error('TRANSACTION_PENDING');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const info = await getInfo.call(trx, txId);
      if (info && typeof info === 'object') {
        const record = info as Record<string, unknown>;
        const receipt = record.receipt && typeof record.receipt === 'object'
          ? record.receipt as Record<string, unknown>
          : null;
        const resultValue = receipt?.result ?? record.contractRet ?? record.result;
        const infoTxId = tronTransactionId(info);
        // Ignore an unrelated indexed receipt before interpreting its result;
        // a foreign REVERT must not fail this transaction's confirmation.
        if (!infoTxId || infoTxId.toLowerCase() === txId.toLowerCase()) {
          assertTronSendResult(info);
          if (typeof resultValue === 'string' && resultValue.toLowerCase() === 'success') return;
        }
      }
    } catch (reason) {
      if (transactionMessage(reason).includes('transaction_reverted')) throw reason;
    }
    if (attempt < 5) await new Promise((resolve) => window.setTimeout(resolve, 700));
  }
  throw new Error('TRANSACTION_PENDING');
}

function isPendingReason(reason: unknown) {
  return transactionMessage(reason).includes('transaction_pending');
}

function isRevertedReason(reason: unknown) {
  const message = transactionMessage(reason);
  return message.includes('transaction_reverted')
    || message.includes('execution reverted')
    || message.includes('reverted');
}

type SaleOperationContext = {
  assetId: string;
  surface: SaleSurface | null;
  price: string;
  open: boolean;
  wallet: string | null;
};

type PendingListing = {
  context: SaleOperationContext;
  hash: string | null;
  wallet: string;
};

type PendingApproval = {
  context: SaleOperationContext;
  hash: string | null;
  wallet: string;
};

function sameSaleOperationContext(left: SaleOperationContext, right: SaleOperationContext) {
  const walletMatches = left.surface === 'legacy-tron'
    ? left.wallet === right.wallet
    : left.wallet === null && right.wallet === null
      ? true
      : sameAddress(left.wallet, right.wallet);
  return left.open
    && right.open
    && left.assetId === right.assetId
    && left.surface === right.surface
    && left.price === right.price
    && walletMatches;
}

function listingPriceLabel(value: string, surface: SaleSurface | null) {
  const normalized = normalizedPrice(value);
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return `— ${surfaceCurrency(surface)}`;
  return `${normalized} ${surfaceCurrency(surface)}`;
}

export function CukieSaleDialog({
  cuki,
  open,
  onOpenChange,
  onCompleted,
  preferredSurface,
}: CukieSaleDialogProps) {
  const surfaces = useMemo(() => surfaceList(cuki), [cuki]);
  const initialSurface = useMemo(() => defaultSurface(cuki, surfaces), [cuki, surfaces]);
  const openingSurface = preferredSurface && surfaces.includes(preferredSurface)
    ? preferredSurface
    : initialSurface;
  const [surface, setSurface] = useState<SaleSurface | null>(openingSurface);
  const [price, setPrice] = useState('');
  const [approvalState, setApprovalState] = useState<ApprovalState>('unknown');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [phase, setPhase] = useState<TransactionPhase>('idle');
  const [listingState, setListingState] = useState<ListingState>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);
  const [inspectState, setInspectState] = useState<'idle' | 'checking' | 'ready' | 'needs_wallet' | 'error'>('idle');
  const operationLockRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const inspectionIdRef = useRef(0);
  const pendingListingRef = useRef<PendingListing | null>(null);
  const pendingApprovalRef = useRef<PendingApproval | null>(null);
  const reconcileAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const latestOperationContextRef = useRef<SaleOperationContext>({
    assetId: cuki.assetId,
    surface,
    price: normalizedPrice(price),
    open,
    wallet: null,
  });

  const { address, chainId, isConnected } = useAccount();
  const wagmiConfig = useConfig();
  const { writeContractAsync } = useWriteContract();
  const { requestWallet } = useWalletCoordinator();
  const tron = useTronLink();
  const evmChain = targetChainId(surface);
  const publicClient = usePublicClient({ chainId: evmChain ?? undefined });
  const busy = phase !== 'idle';
  const identityError = surfaceIdentityError(cuki, surface);
  const marketplaceAddress = surface === 'uki'
    ? ukiMarketplacePublicConfig.marketplaceAddress
    : surface === 'legacy-bsc'
      ? legacyMarketplaceContracts.bsc.contracts.marketplace
      : surface === 'legacy-tron'
        ? legacyMarketplaceContracts.tron.contracts.marketplace
        : null;
  const collectionAddress = targetCollection(cuki, surface);
  const validation = useMemo(() => {
    if (surface !== 'uki') return { valid: true as const, ukiPriceRaw: BigInt(0), expiresAt: BigInt(0) };
    return validateUkiMarketplaceListing({
      ukiPrice: price,
      expiresAt: defaultUkiMarketplaceExpiry(),
    });
  }, [price, surface]);

  const currentWallet = surface === 'legacy-tron' ? tron.address : address ?? null;
  const signatureNetwork = surface === 'legacy-tron'
    ? 'TRON Mainnet'
    : evmChain === 97
      ? 'BSC'
      : evmChain === 56
        ? 'BNB Smart Chain'
        : 'Red no disponible';
  latestOperationContextRef.current = {
    assetId: cuki.assetId,
    surface,
    price: normalizedPrice(price),
    open,
    wallet: currentWallet,
  };

  const inspectSurface = useCallback(async (wallet?: string | null): Promise<Inspection> => {
    if (identityError) throw new Error(`SALE_UI:${identityError}`);
    if (!marketplaceAddress || !collectionAddress) throw new Error('SALE_UI:No se pudo validar el destino de venta para este Cukie.');
    const tokenId = BigInt(cuki.tokenId);
    if (surface === 'legacy-tron') {
      const tronWeb = getLegacyTronWeb();
      if (!tronWeb) throw new Error('TRON_NOT_READY');
      const context = captureTronActionContext(tronWeb, legacyMarketplaceContracts.tron.rpcUrl);
      if (wallet && !isSameTronWallet(tronWeb, context.address, wallet)) throw new Error('WALLET_CONTEXT_CHANGED');
      const readWeb = getLegacyTronReadWeb(context.address) ?? tronWeb;
      const [paused, owner, listing, approvedToken, approvedForAll, fee] = await Promise.all([
        readLegacyTronContract(readWeb, 'marketplace', 'paused'),
        readLegacyTronContract(readWeb, 'token', 'ownerOf', [cuki.tokenId]),
        readLegacyTronContract(readWeb, 'marketplace', 'marketTokens', [cuki.tokenId]),
        readLegacyTronContract(readWeb, 'token', 'getApproved', [cuki.tokenId]),
        readLegacyTronContract(readWeb, 'token', 'isApprovedForAll', [context.address, marketplaceAddress]),
        readLegacyTronContract(readWeb, 'marketplace', 'marketFeePercentage'),
      ]);
      const listingPrice = asBigInt(tupleField(listing, 'price', 1));
      const listed = asBoolean(tupleField(listing, 'isOnSale', 3)) && listingPrice > BigInt(0);
      const approved = isSameTronWallet(tronWeb, String(approvedToken), marketplaceAddress)
        || asBoolean(approvedForAll);
      return {
        owner: String(owner),
        approved,
        approvedForAll: asBoolean(approvedForAll),
        paused: asBoolean(paused),
        activeListing: listed,
        collectionAllowed: true,
        feeRaw: asBigInt(fee),
      };
    }
    if (!publicClient || !evmChain) throw new Error('WALLET_NOT_READY');
    const current = getAccount(wagmiConfig);
    const currentAddress = current.address ?? null;
    const currentChainId = getChainId(wagmiConfig);
    if (!currentAddress || currentChainId !== evmChain) throw new Error('WALLET_NOT_READY');
    assertEvmActionContext({
      expectedAddress: wallet ?? currentAddress,
      expectedChainId: evmChain,
      currentAddress,
      currentChainId,
    });
    if (surface === 'legacy-bsc') {
      const evmCollectionAddress = collectionAddress as Address;
      const [paused, owner, listing, approvedToken, approvedForAll, fee] = await Promise.all([
        publicClient.readContract({
          address: marketplaceAddress as Address,
          abi: legacyMarketplaceBscAbis.marketplace,
          functionName: 'paused',
        }),
        publicClient.readContract({
          address: evmCollectionAddress,
          abi: legacyMarketplaceBscAbis.token,
          functionName: 'ownerOf',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: marketplaceAddress as Address,
          abi: legacyMarketplaceBscAbis.marketplace,
          functionName: 'marketTokens',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: evmCollectionAddress,
          abi: legacyMarketplaceBscAbis.token,
          functionName: 'getApproved',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: evmCollectionAddress,
          abi: legacyMarketplaceBscAbis.token,
          functionName: 'isApprovedForAll',
          args: [currentAddress as Address, marketplaceAddress as Address],
        }),
        publicClient.readContract({
          address: marketplaceAddress as Address,
          abi: legacyMarketplaceBscAbis.marketplace,
          functionName: 'marketFeePercentage',
        }),
      ]);
      const listingPrice = asBigInt(tupleField(listing, 'price', 1));
      const listed = asBoolean(tupleField(listing, 'isOnSale', 3)) && listingPrice > BigInt(0);
      const approved = sameAddress(String(approvedToken), marketplaceAddress) || Boolean(approvedForAll);
      return {
        owner: String(owner),
        approved,
        approvedForAll: Boolean(approvedForAll),
        paused: Boolean(paused),
        activeListing: listed,
        collectionAllowed: true,
        feeRaw: asBigInt(fee),
      };
    }
    const evmCollectionAddress = collectionAddress as Address;
    const [paused, owner, collectionAllowed, approvedToken, approvedForAll, orderId, fee] = await Promise.all([
      publicClient.readContract({
        address: marketplaceAddress as Address,
        abi: ukiMarketplaceReadAbi,
        functionName: 'paused',
      }),
      publicClient.readContract({
        address: evmCollectionAddress,
        abi: ukiMarketplaceNftReadAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      publicClient.readContract({
        address: marketplaceAddress as Address,
        abi: ukiMarketplaceReadAbi,
        functionName: 'collectionAllowed',
        args: [evmCollectionAddress],
      }),
      publicClient.readContract({
        address: evmCollectionAddress,
        abi: ukiMarketplaceNftReadAbi,
        functionName: 'getApproved',
        args: [tokenId],
      }),
      publicClient.readContract({
        address: evmCollectionAddress,
        abi: ukiMarketplaceNftReadAbi,
        functionName: 'isApprovedForAll',
        args: [currentAddress as Address, marketplaceAddress as Address],
      }),
      publicClient.readContract({
        address: marketplaceAddress as Address,
        abi: ukiMarketplaceReadAbi,
        functionName: 'activeOrderIds',
        args: [evmCollectionAddress, tokenId],
      }),
      publicClient.readContract({
        address: marketplaceAddress as Address,
        abi: ukiMarketplaceReadAbi,
        functionName: 'feeBps',
      }),
    ]);
    let activeListing = false;
    if (String(orderId).toLowerCase() !== ZERO_HASH) {
      const state = await publicClient.readContract({
        address: marketplaceAddress as Address,
        abi: ukiMarketplaceReadAbi,
        functionName: 'orderState',
        args: [orderId as `0x${string}`],
      });
      activeListing = Number(state) === 1;
    }
    const approved = sameAddress(String(approvedToken), marketplaceAddress) || Boolean(approvedForAll);
    return {
      owner: String(owner),
      approved,
      approvedForAll: Boolean(approvedForAll),
      paused: Boolean(paused),
      activeListing,
      collectionAllowed: Boolean(collectionAllowed),
      feeRaw: asBigInt(fee),
    };
  }, [cuki.tokenId, collectionAddress, evmChain, identityError, marketplaceAddress, publicClient, surface, wagmiConfig]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      reconcileAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setSurface(openingSurface);
    setPrice('');
    setNotice(null);
    setError(null);
    setLatestTxHash(null);
    setListingState('idle');
    pendingListingRef.current = null;
    pendingApprovalRef.current = null;
  }, [cuki.assetId, openingSurface, open]);

  useEffect(() => {
    if (!open) return;
    const id = inspectionIdRef.current + 1;
    inspectionIdRef.current = id;
    setInspection(null);
    setApprovalState(identityError ? 'blocked' : 'checking');
    setInspectState(identityError ? 'error' : 'checking');
    if (identityError) {
      setError(identityError);
      return;
    }
    const walletReady = surface === 'legacy-tron'
      ? Boolean(tron.isConnected && tron.address)
      : Boolean(isConnected && address && evmChain && chainId === evmChain);
    if (!walletReady) {
      setApprovalState('unknown');
      setInspectState('needs_wallet');
      return;
    }
    void inspectSurface(currentWallet).then((result) => {
      if (inspectionIdRef.current !== id) return;
      setInspection(result);
      setApprovalState(result.approved ? 'approved' : 'required');
      setInspectState('ready');
      if (result.activeListing) {
        setNotice('Este Cukie ya tiene un anuncio activo. Retíralo antes de crear otro.');
      }
    }).catch((reason: unknown) => {
      if (inspectionIdRef.current !== id) return;
      setApprovalState('error');
      setInspectState('error');
      setError(userError(reason));
    });
  }, [address, chainId, currentWallet, evmChain, identityError, inspectSurface, isConnected, open, surface, tron.address, tron.isConnected]);

  const ensureWallet = useCallback(async () => {
    if (surface === 'legacy-tron') {
      return requestWallet({
        kind: 'tron',
        targetTronNetwork: 'mainnet',
        reason: 'Conecta TronLink en TRON Mainnet para aprobar o publicar este Cukie.',
      });
    }
    if (!evmChain) throw new Error('SALE_UI:La red de firma no está disponible para este Cukie.');
    return requestWallet({
      kind: 'evm',
      targetChainId: evmChain,
      reason: `Prepara ${signatureNetwork} para aprobar o publicar este Cukie.`,
    });
  }, [evmChain, requestWallet, signatureNetwork, surface]);

  async function writeEvm(
    input: Parameters<typeof writeContractAsync>[0],
    options: { preserveBroadcast?: boolean } = {},
  ) {
    if (!publicClient) throw new Error('SALE_UI:No podemos comprobar la confirmación de esta red.');
    const hash = await writeContractAsync(input);
    setLatestTxHash(hash);
    let confirmedHash = hash;
    let receipt;
    try {
      const confirmed = await waitForConfirmedEvmTransaction(publicClient, hash);
      receipt = confirmed.receipt;
      confirmedHash = confirmed.hash;
      if (confirmedHash !== hash) setLatestTxHash(confirmedHash);
    } catch (reason) {
      if (reason instanceof TransactionReplacementError) throw reason;
      if (reason instanceof TransactionReplacementPendingError) {
        if (options.preserveBroadcast) throw new BroadcastPendingError(reason.hash, reason);
        throw reason;
      }
      if (options.preserveBroadcast) throw new BroadcastPendingError(hash, reason);
      throw reason;
    }
    if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
    return confirmedHash;
  }

  function beginOperation(next: Exclude<TransactionPhase, 'idle' | 'syncing'>, context: SaleOperationContext) {
    if (operationLockRef.current || busy) return false;
    if (!sameSaleOperationContext(context, latestOperationContextRef.current)) return false;
    operationLockRef.current = true;
    setPhase(next);
    setError(null);
    setNotice(null);
    return true;
  }

  function assertOperationContext(context: SaleOperationContext) {
    if (!sameSaleOperationContext(context, latestOperationContextRef.current)) {
      throw new Error('WALLET_CONTEXT_CHANGED');
    }
  }

  async function reconcilePublishedListing(context: SaleOperationContext, wallet: string) {
    reconcileAbortRef.current?.abort();
    const controller = new AbortController();
    reconcileAbortRef.current = controller;
    const delays = [0, 350, 750, 1_200];
    let latest: Inspection | null = null;
    try {
      for (let index = 0; index < delays.length; index += 1) {
        if (delays[index] > 0) {
          await waitForTransactionRefresh(delays[index], controller.signal);
        }
        if (!mountedRef.current) return latest;
        assertOperationContext(context);
        try {
          const result = await inspectSurface(wallet);
          assertOperationContext(context);
          latest = result;
          if (result.activeListing) return result;
        } catch (reason) {
          if (isTransactionRefreshAborted(reason)) throw reason;
          if (transactionMessage(reason).includes('wallet_context_changed')) throw reason;
        }
      }
      return latest;
    } finally {
      if (reconcileAbortRef.current === controller) reconcileAbortRef.current = null;
    }
  }

  function rememberPendingListing(context: SaleOperationContext, hash: string | null, wallet: string) {
    pendingListingRef.current = { context, hash, wallet };
    if (hash) setLatestTxHash(hash);
    setListingState('pending');
  }

  function rememberPendingApproval(context: SaleOperationContext, hash: string | null, wallet: string) {
    pendingApprovalRef.current = { context, hash, wallet };
    if (hash) setLatestTxHash(hash);
    setApprovalState('pending');
  }

  async function recheckPendingApproval() {
    const pending = pendingApprovalRef.current;
    if (!pending || operationLockRef.current || busy) return;
    if (!sameSaleOperationContext(pending.context, latestOperationContextRef.current)) {
      setError('La wallet o el precio de la operación pendiente cambiaron. Vuelve a conectar la wallet original para comprobarla.');
      return;
    }
    operationLockRef.current = true;
    setPhase('syncing');
    setError(null);
    setNotice('Comprobando la aprobación…');
    let receiptConfirmed = false;
    try {
      assertOperationContext(pending.context);
      if (pending.context.surface === 'legacy-tron' && pending.hash) {
        await waitForTronReceipt(pending.hash);
        receiptConfirmed = true;
        assertOperationContext(pending.context);
      } else if (pending.context.surface !== 'legacy-tron' && pending.hash) {
        if (!publicClient) throw new Error('SALE_UI:No podemos comprobar la confirmación de esta red.');
        let receipt;
        try {
          const confirmed = await waitForConfirmedEvmTransaction(publicClient, pending.hash as `0x${string}`);
          receipt = confirmed.receipt;
          pending.hash = confirmed.hash;
          setLatestTxHash(confirmed.hash);
        } catch (reason) {
          if (reason instanceof TransactionReplacementPendingError) {
            pending.hash = reason.hash;
            setLatestTxHash(reason.hash);
            throw reason;
          }
          if (reason instanceof TransactionReplacementError) throw reason;
          throw new Error('TRANSACTION_PENDING');
        }
        assertOperationContext(pending.context);
        if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
        receiptConfirmed = true;
      }
      const result = await inspectSurface(pending.wallet);
      assertOperationContext(pending.context);
      if (!pending.hash && !result.approved) throw new Error('TRANSACTION_PENDING');
      pendingApprovalRef.current = null;
      setInspection(result);
      setApprovalState(result.approved ? 'approved' : 'required');
      setNotice(result.approved
        ? pending.hash
          ? `Aprobación confirmada en ${signatureNetwork}. Ya puedes publicar el anuncio.`
          : 'El contrato ya tiene permiso para este Cukie. Ya puedes publicar el anuncio.'
        : `Aprobación confirmada en ${signatureNetwork}. El permiso actual ha cambiado; revísalo antes de publicar.`);
    } catch (reason) {
      if (!mountedRef.current || isTransactionRefreshAborted(reason)) return;
      if (reason instanceof TransactionReplacementPendingError) {
        pending.hash = reason.hash;
        setLatestTxHash(reason.hash);
        setApprovalState('pending');
        setError(null);
        setNotice('La aprobación fue repriciada y sigue pendiente. Conservamos el hash nuevo; compruébala sin firmar otra vez.');
      } else if (reason instanceof TransactionReplacementError) {
        pendingApprovalRef.current = null;
        setApprovalState('required');
        setLatestTxHash(null);
        setError(userError(reason));
      } else if (isPendingReason(reason)) {
        setApprovalState('pending');
        setNotice('La aprobación sigue pendiente. Puedes volver a comprobarla sin firmar otra vez.');
      } else if (isRevertedReason(reason)) {
        pendingApprovalRef.current = null;
        setApprovalState('required');
        setLatestTxHash(null);
        setError(userError(reason));
      } else if (receiptConfirmed && !transactionMessage(reason).includes('wallet_context_changed')) {
        pendingApprovalRef.current = null;
        setApprovalState('approved');
        setError(null);
        setNotice(`Aprobación confirmada en ${signatureNetwork}. La ficha se actualizará cuando el estado esté disponible.`);
      } else if (receiptConfirmed) {
        setApprovalState('pending');
        setError(null);
        setNotice('La aprobación ya fue enviada, pero la cuenta o la red cambió. Vuelve a conectar la wallet original para comprobarla.');
      } else {
        setApprovalState('pending');
        setError(userError(reason));
      }
    } finally {
      operationLockRef.current = false;
      setPhase('idle');
    }
  }

  async function recheckPendingListing() {
    const pending = pendingListingRef.current;
    if (!pending || operationLockRef.current || busy) return;
    if (!sameSaleOperationContext(pending.context, latestOperationContextRef.current)) {
      setError('La wallet o el precio del anuncio pendiente cambiaron. Vuelve a conectar la wallet original para comprobarlo.');
      return;
    }
    operationLockRef.current = true;
    setPhase('syncing');
    setError(null);
    setNotice('Comprobando la transacción y el anuncio…');
    let receiptConfirmed = false;
    try {
      assertOperationContext(pending.context);
      if (pending.context.surface === 'legacy-tron' && pending.hash) {
        await waitForTronReceipt(pending.hash);
        receiptConfirmed = true;
        assertOperationContext(pending.context);
      } else if (pending.context.surface !== 'legacy-tron') {
        if (!publicClient) throw new Error('SALE_UI:No podemos comprobar la confirmación de esta red.');
        let receipt;
        try {
          const confirmed = await waitForConfirmedEvmTransaction(publicClient, pending.hash as `0x${string}`);
          receipt = confirmed.receipt;
          pending.hash = confirmed.hash;
          setLatestTxHash(confirmed.hash);
        } catch (reason) {
          if (reason instanceof TransactionReplacementPendingError) {
            pending.hash = reason.hash;
            setLatestTxHash(reason.hash);
            throw reason;
          }
          if (reason instanceof TransactionReplacementError) throw reason;
          throw new Error('TRANSACTION_PENDING');
        }
        assertOperationContext(pending.context);
        if (receipt.status !== 'success') {
          pendingListingRef.current = null;
          setListingState('idle');
          setLatestTxHash(null);
          throw new Error('TRANSACTION_REVERTED');
        }
        receiptConfirmed = true;
      }
      const result = await inspectSurface(pending.wallet);
      assertOperationContext(pending.context);
      if (!pending.hash && !result.activeListing) throw new Error('TRANSACTION_PENDING');
      pendingListingRef.current = null;
      setInspection(result);
      setListingState(result.activeListing ? 'published' : 'confirmed');
      setNotice(result.activeListing
        ? `Venta publicada en ${signatureNetwork}. Actualizando la ficha y el catálogo…`
        : `Publicación confirmada en ${signatureNetwork}. El estado actual del anuncio ya está actualizado.`);
      window.dispatchEvent(new CustomEvent(pending.context.surface === 'uki' ? 'cukies:uki-marketplace:refresh' : 'cukies:legacy-marketplace:refresh', { detail: pending.hash ? { hash: pending.hash } : undefined }));
      onCompleted?.();
    } catch (reason) {
      if (!mountedRef.current || isTransactionRefreshAborted(reason)) return;
      if (reason instanceof TransactionReplacementPendingError) {
        pending.hash = reason.hash;
        setLatestTxHash(reason.hash);
        setListingState('pending');
        setError(null);
        setNotice('La publicación fue repriciada y sigue pendiente. Conservamos el hash nuevo; compruébala sin firmar otra vez.');
      } else if (reason instanceof TransactionReplacementError) {
        pendingListingRef.current = null;
        setListingState('idle');
        setLatestTxHash(null);
        setError(userError(reason));
      } else if (reason instanceof Error && reason.message === 'TRANSACTION_PENDING') {
        setListingState('pending');
        setNotice('La transacción sigue pendiente. Puedes volver a comprobarla sin firmar otra publicación.');
      } else if (isRevertedReason(reason)) {
        pendingListingRef.current = null;
        setListingState('idle');
        setLatestTxHash(null);
        setError(userError(reason));
      } else if (receiptConfirmed && !transactionMessage(reason).includes('wallet_context_changed')) {
        pendingListingRef.current = null;
        setListingState('confirmed');
        setError(null);
        setNotice(`Publicación confirmada en ${signatureNetwork}. La ficha se actualizará cuando el estado esté disponible.`);
        window.dispatchEvent(new CustomEvent(pending.context.surface === 'uki' ? 'cukies:uki-marketplace:refresh' : 'cukies:legacy-marketplace:refresh', { detail: pending.hash ? { hash: pending.hash } : undefined }));
        onCompleted?.();
      } else if (receiptConfirmed) {
        setListingState('pending');
        setError(null);
        setNotice('La publicación ya fue enviada, pero la cuenta o la red cambió. Vuelve a conectar la wallet original para comprobarla.');
      } else {
        setError(userError(reason));
      }
    } finally {
      operationLockRef.current = false;
      setPhase('idle');
    }
  }

  async function approveCukie() {
    const context = latestOperationContextRef.current;
    if (!beginOperation('checking', context)) return;
    let activeContext: SaleOperationContext | null = null;
    let approvalHash: string | null = null;
    let receiptConfirmed = false;
    try {
      assertOperationContext(context);
      const ready = await ensureWallet();
      activeContext = { ...context, wallet: ready.address };
      latestOperationContextRef.current = { ...latestOperationContextRef.current, wallet: ready.address };
      assertOperationContext(activeContext);
      const result = await inspectSurface(ready.address);
      assertOperationContext(activeContext);
      setInspection(result);
      if (result.paused) throw new Error('MARKETPLACE_PAUSED');
      if (!result.collectionAllowed) throw new Error('SALE_UI:Esta colección no está habilitada por el contrato.');
      if (result.activeListing) throw new Error('SALE_UI:Este Cukie ya tiene un anuncio activo.');
      if (surface === 'legacy-tron') {
        const tronWeb = getLegacyTronWeb();
        if (!tronWeb) throw new Error('TRON_NOT_READY');
        const actionContext = captureTronActionContext(tronWeb, legacyMarketplaceContracts.tron.rpcUrl);
        if (!isSameTronWallet(tronWeb, result.owner, actionContext.address)) throw new Error('NOT_OWNER');
        if (result.approved) {
          setApprovalState('approved');
          setNotice('Este Cukie ya estaba aprobado. Puedes pasar al paso de publicación.');
          return;
        }
        setPhase('approving');
        assertOperationContext(activeContext);
        const tx = await sendLegacyTronContract(
          tronWeb,
          'token',
          'approve',
          [marketplaceAddress, cuki.tokenId],
          { feeLimit: 800_000_000, shouldPollResponse: false },
          () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
        );
        assertTronSendResult(tx);
        approvalHash = tronTransactionId(tx);
        rememberPendingApproval(activeContext, approvalHash, ready.address);
        if (!approvalHash) throw new Error('TRANSACTION_PENDING');
        await waitForTronReceipt(approvalHash);
        receiptConfirmed = true;
        assertOperationContext(activeContext);
        const confirmed = await inspectSurface(actionContext.address);
        assertOperationContext(activeContext);
        pendingApprovalRef.current = null;
        setInspection(confirmed);
        setApprovalState(confirmed.approved ? 'approved' : 'required');
        setNotice(confirmed.approved
          ? 'Aprobación confirmada en TRON Mainnet. Ya puedes publicar el anuncio.'
          : 'Aprobación confirmada en TRON Mainnet. El permiso actual ha cambiado; revísalo antes de publicar.');
        return;
      }
      if (!publicClient || !collectionAddress || !marketplaceAddress || !evmChain) throw new Error('WALLET_NOT_READY');
      const current = getAccount(wagmiConfig);
      assertEvmActionContext({
        expectedAddress: ready.address,
        expectedChainId: evmChain,
        currentAddress: current.address,
        currentChainId: getChainId(wagmiConfig),
      });
      if (!isSameEvmWallet(result.owner, ready.address)) throw new Error('NOT_OWNER');
      if (result.approved) {
        setApprovalState('approved');
        setNotice('Este Cukie ya estaba aprobado. Puedes pasar al paso de publicación.');
        return;
      }
      setPhase('approving');
      assertOperationContext(activeContext);
      approvalHash = await writeEvm({
        account: ready.address as Address,
        chainId: evmChain,
        address: collectionAddress as Address,
        abi: surface === 'uki' ? ukiMarketplaceNftReadAbi : legacyMarketplaceBscAbis.token,
        functionName: 'approve',
        args: [marketplaceAddress as Address, BigInt(cuki.tokenId)],
      }, { preserveBroadcast: true });
      receiptConfirmed = true;
      assertOperationContext(activeContext);
      const confirmed = await inspectSurface(ready.address);
      assertOperationContext(activeContext);
      pendingApprovalRef.current = null;
      setInspection(confirmed);
      setApprovalState(confirmed.approved ? 'approved' : 'required');
      setNotice(confirmed.approved
        ? `Aprobación confirmada en ${signatureNetwork}. Ya puedes publicar el anuncio.`
        : `Aprobación confirmada en ${signatureNetwork}. El permiso actual ha cambiado; revísalo antes de publicar.`);
    } catch (reason) {
      if (!mountedRef.current || isTransactionRefreshAborted(reason)) return;
      const broadcastHash = reason instanceof BroadcastPendingError ? reason.hash : approvalHash;
      const reverted = isRevertedReason(reason);
      const contextChanged = transactionMessage(reason).includes('wallet_context_changed');
      if (reverted) {
        pendingApprovalRef.current = null;
        setApprovalState('required');
        setLatestTxHash(null);
        setError(userError(reason));
      } else if (receiptConfirmed && activeContext && !contextChanged) {
        pendingApprovalRef.current = null;
        setApprovalState('approved');
        setError(null);
        setNotice(`Aprobación confirmada en ${signatureNetwork}. La ficha se actualizará cuando el estado esté disponible.`);
      } else if (broadcastHash && activeContext?.wallet) {
        rememberPendingApproval(activeContext, broadcastHash, activeContext.wallet);
        setError(null);
        setNotice('Transacción enviada. Puedes comprobar la aprobación sin firmar otra vez.');
      } else if (pendingApprovalRef.current && activeContext) {
        setApprovalState('pending');
        setError(null);
        setNotice('Transacción enviada. Puedes comprobar la aprobación sin firmar otra vez.');
      } else {
        setError(userError(reason));
        setApprovalState('required');
      }
    } finally {
      operationLockRef.current = false;
      setPhase('idle');
    }
  }

  async function publishCukie() {
    const context = latestOperationContextRef.current;
    if (!beginOperation('checking', context)) return;
    let activeContext: SaleOperationContext | null = null;
    let listingHash: string | null = null;
    let receiptConfirmed = false;
    try {
      assertOperationContext(context);
      if (identityError) throw new Error(`SALE_UI:${identityError}`);
      if (surface === 'uki' && !validation.valid) throw new Error(`SALE_UI:${validation.priceError ?? validation.expiryError ?? 'El precio no es válido.'}`);
      const ready = await ensureWallet();
      activeContext = { ...context, wallet: ready.address };
      latestOperationContextRef.current = { ...latestOperationContextRef.current, wallet: ready.address };
      assertOperationContext(activeContext);
      const result = await inspectSurface(ready.address);
      assertOperationContext(activeContext);
      setInspection(result);
      if (result.paused) throw new Error('MARKETPLACE_PAUSED');
      if (!result.collectionAllowed) throw new Error('SALE_UI:Esta colección no está habilitada por el contrato.');
      if (result.activeListing) throw new Error('SALE_UI:Este Cukie ya tiene un anuncio activo.');
      if (surface !== 'uki' && legacyFeeBpsFromRaw(result.feeRaw) === null) {
        throw new Error('SALE_UI:No se ha podido verificar la comisión de esta red.');
      }
      if (surface === 'legacy-tron') {
        const tronWeb = getLegacyTronWeb();
        if (!tronWeb) throw new Error('TRON_NOT_READY');
        const actionContext = captureTronActionContext(tronWeb, legacyMarketplaceContracts.tron.rpcUrl);
        if (!isSameTronWallet(tronWeb, result.owner, actionContext.address)) throw new Error('NOT_OWNER');
        if (!result.approved) throw new Error('APPROVAL_REQUIRED');
        const priceRaw = parseTronPrice(price);
        setPhase('listing');
        assertOperationContext(activeContext);
        const tx = await sendLegacyTronContract(
          tronWeb,
          'marketplace',
          'putTokenOnSale',
          [cuki.tokenId, Number(priceRaw)],
          { callValue: 0, feeLimit: 800_000_000, shouldPollResponse: false },
          () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
        );
        assertTronSendResult(tx);
        const txId = tronTransactionId(tx);
        listingHash = txId;
        if (txId) setLatestTxHash(txId);
        rememberPendingListing(activeContext, txId, ready.address);
        if (!txId) throw new Error('TRANSACTION_PENDING');
        await waitForTronReceipt(txId);
        receiptConfirmed = true;
        assertOperationContext(activeContext);
        setPhase('syncing');
        const reconciled = await reconcilePublishedListing(activeContext, ready.address);
        assertOperationContext(activeContext);
        pendingListingRef.current = null;
        setInspection(reconciled);
        setListingState(reconciled?.activeListing ? 'published' : 'confirmed');
        setNotice(reconciled?.activeListing
          ? 'Venta publicada en TRON Mainnet. Actualizando la ficha y el catálogo…'
          : 'Publicación confirmada en TRON Mainnet. El estado actual del anuncio ya está actualizado.');
        window.dispatchEvent(new CustomEvent('cukies:legacy-marketplace:refresh', { detail: listingHash ? { hash: listingHash } : undefined }));
        onCompleted?.();
        return;
      }
      if (!publicClient || !collectionAddress || !marketplaceAddress || !evmChain) throw new Error('WALLET_NOT_READY');
      const current = getAccount(wagmiConfig);
      assertEvmActionContext({
        expectedAddress: ready.address,
        expectedChainId: evmChain,
        currentAddress: current.address,
        currentChainId: getChainId(wagmiConfig),
      });
      if (!isSameEvmWallet(result.owner, ready.address)) throw new Error('NOT_OWNER');
      if (!result.approved) throw new Error('APPROVAL_REQUIRED');
      setPhase('listing');
      assertOperationContext(activeContext);
      if (surface === 'uki') {
        if (!validation.valid) throw new Error('INVALID_PRICE');
        listingHash = await writeEvm({
          account: ready.address as Address,
          chainId: evmChain,
          address: marketplaceAddress as Address,
          abi: ukiMarketplaceWriteAbi,
          functionName: 'createOrder',
          args: [collectionAddress as Address, BigInt(cuki.tokenId), validation.ukiPriceRaw, validation.expiresAt],
        }, { preserveBroadcast: true });
      } else {
        const request = {
          account: ready.address as Address,
          chainId: evmChain,
          address: marketplaceAddress as Address,
          abi: legacyMarketplaceBscAbis.marketplace,
          functionName: 'putTokenOnSale',
          args: [BigInt(cuki.tokenId), parseBscPrice(price)],
          value: BigInt(0),
        } as unknown as Parameters<typeof writeContractAsync>[0];
        listingHash = await writeEvm(request, { preserveBroadcast: true });
      }
      receiptConfirmed = true;
      assertOperationContext(activeContext);
      setPhase('syncing');
      const reconciled = await reconcilePublishedListing(activeContext, ready.address);
      assertOperationContext(activeContext);
      if (reconciled) {
        pendingListingRef.current = null;
        setInspection(reconciled);
        setListingState(reconciled.activeListing ? 'published' : 'confirmed');
        setNotice(reconciled.activeListing
          ? `Venta publicada en ${signatureNetwork}. Actualizando la ficha y el catálogo…`
          : `Publicación confirmada en ${signatureNetwork}. El estado actual del anuncio ya está actualizado.`);
      } else {
        // The receipt is decisive even when the indexer or a later read is unavailable.
        // Keep the hash visible and let the normal refresh catch up without blocking close.
        pendingListingRef.current = null;
        setListingState('confirmed');
        setNotice(`Publicación confirmada en ${signatureNetwork}. La ficha se actualizará cuando el estado esté disponible.`);
      }
      window.dispatchEvent(new CustomEvent(surface === 'uki' ? 'cukies:uki-marketplace:refresh' : 'cukies:legacy-marketplace:refresh', { detail: listingHash ? { hash: listingHash } : undefined }));
      onCompleted?.();
    } catch (reason) {
      if (!mountedRef.current || isTransactionRefreshAborted(reason)) return;
      const broadcastHash = reason instanceof BroadcastPendingError ? reason.hash : listingHash;
      const pending = pendingListingRef.current;
      const reverted = isRevertedReason(reason);
      const contextChanged = transactionMessage(reason).includes('wallet_context_changed');
      if (reverted && (pending || broadcastHash)) {
        pendingListingRef.current = null;
        setListingState('idle');
        setLatestTxHash(null);
        setError(userError(reason));
      } else if (receiptConfirmed && !contextChanged) {
        pendingListingRef.current = null;
        setListingState('confirmed');
        setError(null);
        setNotice(`Publicación confirmada en ${signatureNetwork}. La ficha se actualizará cuando el estado esté disponible.`);
        window.dispatchEvent(new CustomEvent(surface === 'uki' ? 'cukies:uki-marketplace:refresh' : 'cukies:legacy-marketplace:refresh', { detail: listingHash ? { hash: listingHash } : undefined }));
        onCompleted?.();
      } else if (activeContext?.wallet && (broadcastHash || pending)) {
        if (broadcastHash) rememberPendingListing(activeContext, broadcastHash, activeContext.wallet);
        setError(null);
        setNotice('Transacción enviada. Puedes comprobar la publicación sin firmar otra vez.');
      } else {
        setError(userError(reason));
      }
    } finally {
      operationLockRef.current = false;
      setPhase('idle');
    }
  }

  const feeBps = legacyFeeBpsFromRaw(inspection?.feeRaw);
  const feeLabel = legacyFeeLabel(inspection?.feeRaw);
  const sellerAmount = legacySellerAmountLabel(price, surface, inspection?.feeRaw);
  const feeVerified = feeBps !== null;
  const feeCopy = surface === 'uki'
    ? feeBps === null
      ? 'Comisión pendiente de verificar.'
      : `Comisión al comprador: ${(Number(feeBps) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}%. Tú recibes el precio exacto.`
    : feeLabel === null
      ? 'No hemos podido verificar la comisión de esta red. La publicación queda bloqueada.'
      : `Comisión de venta: ${feeLabel}. El importe para ti se calcula sobre el precio indicado.`;
  const sellerAmountCopy = surface === 'uki'
    ? `Recibes ${listingPriceLabel(price, surface)} exactos.`
    : sellerAmount
      ? `Recibes ${sellerAmount} (estimación según la comisión actual).`
      : 'Introduce un precio para calcular cuánto recibirás.';
  const approvalDone = approvalState === 'approved';
  const canPublish = approvalDone
    && !busy
    && !identityError
    && listingState === 'idle'
    && inspection !== null
    && !inspection.activeListing
    && feeVerified
    && (surface === 'uki' ? validation.valid : price.trim().length > 0);
  const isMobile = useIsMobile();
  const dismissBlocked = busy || listingState === 'pending' || approvalState === 'pending';
  const listingDone = listingState === 'confirmed' || listingState === 'published';
  const listingPending = listingState === 'pending';
  const approvalActionLabel = approvalState === 'pending'
    ? 'Aprobación pendiente'
    : phase === 'approving'
      ? 'Esperando confirmación…'
      : phase === 'checking'
        ? 'Comprobando…'
        : 'Aprobar Cukie';
  const listingActionLabel = listingPending
    ? 'Publicación pendiente'
    : phase === 'listing'
      ? 'Esperando confirmación…'
      : phase === 'checking'
        ? 'Comprobando…'
        : 'Poner en la tienda';
  const approvalStepCopy = approvalDone
    ? 'Permiso confirmado; ya puedes publicar.'
    : approvalState === 'pending'
      ? 'Firma enviada; todavía no está confirmada.'
      : 'Autoriza solo este Cukie; aún no se publica.';
  const listingStepCopy = listingDone
    ? listingState === 'published'
      ? 'Anuncio activo en el marketplace.'
      : 'Recibo confirmado; el catálogo terminará de actualizarse.'
    : listingPending
      ? 'Firma enviada; todavía no está confirmada.'
      : approvalDone
        ? 'Revisa el precio y confirma el anuncio.'
        : 'Se habilita después de aprobar.';

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!dismissBlocked) onOpenChange(next);
      }}
    >
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        onOpenAutoFocus={() => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef.current?.isConnected) {
            event.preventDefault();
            returnFocusRef.current.focus({ preventScroll: true });
          }
        }}
        onEscapeKeyDown={(event) => {
          if (dismissBlocked) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (dismissBlocked) event.preventDefault();
        }}
        className={`uki-theme grid w-full motion-reduce:animate-none motion-reduce:transition-none [&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:grid [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:place-items-center grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-[var(--uki-lilac-border)] bg-[var(--uki-bg)] p-0 text-[var(--uki-cream)] shadow-[0_0_80px_rgba(228,92,255,0.18)] ${isMobile
          ? 'max-h-[calc(100dvh-0.5rem)] max-w-none rounded-t-2xl sm:max-w-none'
          : 'h-full max-h-full rounded-l-2xl sm:max-w-[35rem]'
        }`}
      >
        <SheetHeader className="border-b border-white/10 px-5 py-5 pr-14 text-left sm:px-7 sm:py-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">
            <Store className="h-4 w-4" aria-hidden="true" /> Publicar en marketplace
          </div>
          <SheetTitle className="mt-2 font-headline text-2xl font-black tracking-[-0.025em] text-[var(--uki-cream)] sm:text-3xl">
            Vender Cukie #{cuki.tokenId}
          </SheetTitle>
          <SheetDescription className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            Indica el precio y revisa cuánto recibirás. Después aprueba el Cukie y confirma el anuncio.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-5">
            <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--uki-lilac-border)] bg-[var(--uki-bg-2)]">
              <CukiImage
                src={cuki.imageUrl}
                alt={`Cukie #${cuki.tokenId}`}
                sizes="96px"
                className="object-contain p-2"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] px-2.5 py-1 text-xs font-black text-[var(--uki-lilac)]">
                  {surfaceLabel(surface)}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-[5rem_minmax(0,1fr)]">
                <dt className="font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Tu wallet</dt>
                <dd className="font-semibold text-[var(--uki-text)]">{signatureNetwork} · {shortIdentity(currentWallet)}</dd>
              </dl>
              <details className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-black text-[var(--uki-muted)]">Detalles de la operación</summary>
                <dl className="mt-3 grid gap-2 sm:grid-cols-[5rem_minmax(0,1fr)]">
                  <dt className="font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Colección</dt>
                  <dd className="min-w-0 break-all font-mono text-[var(--uki-text)]">{cuki.collectionAddress || 'No disponible'}</dd>
                  <dt className="font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Token</dt>
                  <dd className="font-mono text-[var(--uki-text)]">{cuki.tokenId}</dd>
                </dl>
              </details>
            </div>
          </div>

          {surfaces.length > 1 ? (
            <label className="mt-5 grid gap-2 text-sm font-black text-[var(--uki-cream)]">
              Destino y moneda
              <select
                aria-label="Destino y moneda"
                value={surface ?? ''}
                onChange={(event) => {
                  setSurface(event.target.value as SaleSurface);
                  setInspection(null);
                  setApprovalState('unknown');
                  setInspectState('idle');
                  setError(null);
                  setNotice(null);
                }}
                disabled={busy || listingState === 'pending' || approvalState === 'pending'}
                className="min-h-11 rounded-xl border border-white/15 bg-black/30 px-3 text-sm font-bold text-[var(--uki-text)] outline-none transition focus:border-[var(--uki-lilac)] disabled:opacity-60"
              >
                {surfaces.map((option) => <option key={option} value={option}>{surfaceLabel(option)}</option>)}
              </select>
            </label>
          ) : null}

          <div className="mt-5 grid gap-4 rounded-xl border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end">
            <label className="grid gap-2 text-sm font-black text-[var(--uki-cream)]">
              Precio de venta ({surfaceCurrency(surface)})
              <input
                aria-label={`Precio de venta en ${surfaceCurrency(surface)}`}
                inputMode="decimal"
                type="text"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder={surface === 'legacy-tron' ? '3333' : surface === 'legacy-bsc' ? '0,195' : '1250'}
                disabled={busy || listingState === 'pending' || approvalState === 'pending'}
                className="min-h-12 rounded-xl border border-white/15 bg-black/30 px-3 font-mono text-lg font-bold text-[var(--uki-cream)] outline-none transition placeholder:text-white/30 focus:border-[var(--uki-lilac)] disabled:opacity-60"
              />
              {surface === 'uki' && !validation.valid && price ? <span className="text-xs font-semibold text-amber-200">{validation.priceError ?? validation.expiryError}</span> : null}
              {surface !== 'uki' && price && (() => {
                try {
                  if (surface === 'legacy-bsc') parseBscPrice(price);
                  else parseTronPrice(price);
                  return null;
                } catch {
                  return <span className="text-xs font-semibold text-amber-200">Introduce un precio válido mayor que cero.</span>;
                }
              })()}
            </label>
            <div className="rounded-lg border border-[rgba(242,195,75,0.35)] bg-[rgba(242,195,75,0.08)] p-3 text-xs">
              <p className="font-black uppercase tracking-[0.1em] text-[var(--uki-gold)]">Recibes</p>
              <p className="mt-1 font-headline text-lg font-black leading-tight text-[var(--uki-gold)]"><span className="sr-only">Recibes </span>{sellerAmountCopy.replace(/^Recibes\s/, '')}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-gold)]" aria-hidden="true" />
              <p className="leading-6 text-[var(--uki-text)]">{feeCopy}</p>
            </div>
            {surface === 'uki' ? <p className="pl-7 text-xs font-semibold leading-5 text-[var(--uki-muted)]">El anuncio estará disponible durante 7 días.</p> : <p className="pl-7 text-xs font-semibold leading-5 text-[var(--uki-muted)]">La wallet mostrará el coste de red antes de firmar.</p>}
          </div>

          {inspectState === 'needs_wallet' ? (
            <p role="status" className="mt-4 rounded-xl border border-[rgba(242,195,75,0.3)] bg-[rgba(242,195,75,0.08)] p-3 text-sm font-semibold text-[#ffe2a0]">Conecta o cambia la wallet a {signatureNetwork} para comprobar propiedad y aprobación.</p>
          ) : null}
          {inspectState === 'checking' ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--uki-muted)]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Preparando la venta…</p>
          ) : null}
          {error ? <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[rgba(242,195,75,0.3)] bg-[rgba(242,195,75,0.08)] p-3 text-sm font-semibold leading-6 text-[#ffe2a0]"><CircleAlert className="mt-1 h-4 w-4 shrink-0 text-[var(--uki-gold)]" aria-hidden="true" /> {error}</p> : null}
          {notice ? <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-[rgba(242,195,75,0.3)] bg-[rgba(242,195,75,0.08)] p-3 text-sm font-semibold leading-6 text-[#ffe9a4]"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[var(--uki-gold)]" aria-hidden="true" /> {notice}</p> : null}
          {latestTxHash ? <p className="mt-2 break-all text-xs font-mono text-[var(--uki-muted)]">Última transacción: {latestTxHash}</p> : null}

          <ol aria-label="Pasos para publicar el Cukie" className="mt-5 grid gap-2">
            <li
              aria-current={!approvalDone ? 'step' : undefined}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${approvalDone ? 'border-[rgba(242,195,75,0.35)] bg-[rgba(242,195,75,0.07)]' : approvalState === 'pending' ? 'border-[rgba(242,195,75,0.35)] bg-[rgba(242,195,75,0.05)]' : 'border-white/10 bg-black/20'}`}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${approvalDone ? 'border-[rgba(242,195,75,0.6)] bg-[rgba(242,195,75,0.15)] text-[var(--uki-gold)]' : approvalState === 'pending' ? 'border-[rgba(242,195,75,0.5)] bg-[rgba(242,195,75,0.1)] text-[var(--uki-gold)]' : 'border-white/20 text-[var(--uki-muted)]'}`}>
                {approvalDone ? <Check className="h-4 w-4" aria-hidden="true" /> : approvalState === 'pending' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : '1'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-[var(--uki-cream)]"><span className="text-[var(--uki-muted)]">Paso 1 · </span>Aprobar Cukie</p>
                <p className={`mt-0.5 text-xs font-semibold leading-5 ${approvalDone || approvalState === 'pending' ? 'text-[var(--uki-gold)]' : 'text-[var(--uki-muted)]'}`}>{approvalStepCopy}</p>
              </div>
              {approvalState === 'pending' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void recheckPendingApproval()}
                  disabled={busy}
                  aria-label="Comprobar aprobación"
                  className="min-h-11 shrink-0 border-[rgba(242,195,75,0.35)] bg-[rgba(242,195,75,0.1)] px-2.5 text-xs text-[#ffe2a0] hover:bg-[rgba(242,195,75,0.2)]"
                >
                  Comprobar
                </Button>
              ) : null}
            </li>
            <li
              aria-current={approvalDone && !listingDone ? 'step' : undefined}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${listingDone ? 'border-[rgba(242,195,75,0.35)] bg-[rgba(242,195,75,0.07)]' : listingPending ? 'border-[rgba(242,195,75,0.35)] bg-[rgba(242,195,75,0.05)]' : 'border-white/10 bg-black/20'}`}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${listingDone ? 'border-[rgba(242,195,75,0.6)] bg-[rgba(242,195,75,0.15)] text-[var(--uki-gold)]' : listingPending ? 'border-[rgba(242,195,75,0.5)] bg-[rgba(242,195,75,0.1)] text-[var(--uki-gold)]' : 'border-white/20 text-[var(--uki-muted)]'}`}>
                {listingDone ? <Check className="h-4 w-4" aria-hidden="true" /> : listingPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : '2'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-[var(--uki-cream)]"><span className="text-[var(--uki-muted)]">Paso 2 · </span>Poner en la tienda</p>
                <p className={`mt-0.5 text-xs font-semibold leading-5 ${listingDone || listingPending ? 'text-[var(--uki-gold)]' : 'text-[var(--uki-muted)]'}`}>{listingStepCopy}</p>
              </div>
              {listingPending ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void recheckPendingListing()}
                  disabled={busy}
                  aria-label="Comprobar publicación"
                  className="min-h-11 shrink-0 border-[rgba(242,195,75,0.35)] bg-[rgba(242,195,75,0.1)] px-2.5 text-xs text-[#ffe2a0] hover:bg-[rgba(242,195,75,0.2)]"
                >
                  Comprobar
                </Button>
              ) : null}
            </li>
          </ol>

          <p className="mt-4 flex items-start gap-2 text-xs font-semibold leading-5 text-[var(--uki-muted)]"><Network className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" /> Comprobaremos de nuevo la información antes de pedir cada firma. Si cambias de cuenta o red, el precio se conserva.</p>
        </div>

        <SheetFooter className="flex-col border-t border-white/10 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-7">
          <div className="flex w-full items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={dismissBlocked} className="min-h-11 shrink-0 border-white/15 bg-white/[0.03] px-3 text-xs text-[var(--uki-cream)] sm:mr-auto">Cerrar</Button>
            {!approvalDone ? (
              <Button
                type="button"
                onClick={() => void approveCukie()}
                disabled={busy || approvalState === 'pending' || Boolean(identityError)}
                className="min-h-11 flex-1 bg-[var(--uki-lilac)] text-[#100516] hover:bg-[#f19bff]"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {approvalActionLabel}
              </Button>
            ) : !listingDone ? (
              <Button
                type="button"
                onClick={() => void publishCukie()}
                disabled={!canPublish}
                className="min-h-11 flex-1 bg-[var(--uki-lilac)] text-[#100516] hover:bg-[#f19bff]"
              >
                <Store className="h-4 w-4" aria-hidden="true" />
                {listingActionLabel}
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
