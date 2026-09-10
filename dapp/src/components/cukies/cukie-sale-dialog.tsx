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
  type Hash,
} from 'viem';
import { getAccount, getChainId } from 'wagmi/actions';
import { useAccount, useConfig, usePublicClient, useWriteContract } from 'wagmi';

import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';

type SaleSurface = 'legacy-bsc' | 'legacy-tron' | 'uki';
type ApprovalState = 'unknown' | 'checking' | 'required' | 'approved' | 'blocked' | 'error';
type TransactionPhase = 'idle' | 'checking' | 'approving' | 'listing' | 'syncing';
type ListingState = 'idle' | 'pending' | 'published';

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
    message.includes('tron_not_ready')
    || message.includes('tron provider')
    || message.includes('tron_signer_unavailable')
    || message.includes('missing signer')
    || message.includes('signer unavailable')
  ) {
    return 'TronLink no está preparado en TRON Mainnet. Conéctalo y vuelve a intentarlo.';
  }
  if (message.includes('wallet_coordinator_unavailable')) {
    return 'No se pudo preparar la wallet. Vuelve a conectar la red de firma.';
  }
  if (message.includes('wallet_not_ready') || message.includes('bsc_not_ready')) {
    return 'Conecta la wallet en la red indicada para continuar.';
  }
  if (message.includes('marketplace_paused')) return 'El marketplace está pausado temporalmente.';
  if (reason instanceof Error && reason.message.startsWith('SALE_UI:')) return reason.message.slice('SALE_UI:'.length);
  return 'La operación no se pudo confirmar. Revisa la wallet, la red y el estado del Cukie; el precio se conserva.';
}

function assertTronSendResult(result: unknown) {
  if (typeof result === 'string' && /failed|revert|error/i.test(result)) {
    throw new Error('TRANSACTION_REVERTED');
  }
  if (!result || typeof result !== 'object') return;
  const record = result as Record<string, unknown>;
  if (record.result === false || record.success === false) throw new Error('TRANSACTION_REVERTED');
  const receipt = record.receipt;
  if (receipt && typeof receipt === 'object') {
    const receiptResult = (receipt as Record<string, unknown>).result;
    if (receiptResult && receiptResult !== 'SUCCESS' && receiptResult !== 'success' && receiptResult !== true) {
      throw new Error('TRANSACTION_REVERTED');
    }
  }
}

type SaleOperationContext = {
  assetId: string;
  surface: SaleSurface | null;
  price: string;
  open: boolean;
  wallet: string | null;
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
  const [latestTxHash, setLatestTxHash] = useState<Hash | null>(null);
  const [inspectState, setInspectState] = useState<'idle' | 'checking' | 'ready' | 'needs_wallet' | 'error'>('idle');
  const operationLockRef = useRef(false);
  const inspectionIdRef = useRef(0);
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
    if (!publicClient || !evmChain || !isConnected || !address) throw new Error('WALLET_NOT_READY');
    const current = getAccount(wagmiConfig);
    assertEvmActionContext({
      expectedAddress: wallet ?? address,
      expectedChainId: evmChain,
      currentAddress: current.address,
      currentChainId: getChainId(wagmiConfig),
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
          args: [current.address as Address, marketplaceAddress as Address],
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
        args: [current.address as Address, marketplaceAddress as Address],
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
  }, [address, cuki.tokenId, collectionAddress, evmChain, identityError, isConnected, marketplaceAddress, publicClient, surface, wagmiConfig]);

  useEffect(() => {
    if (!open) return;
    setSurface(openingSurface);
    setPrice('');
    setNotice(null);
    setError(null);
    setLatestTxHash(null);
    setListingState('idle');
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

  async function writeEvm(input: Parameters<typeof writeContractAsync>[0]) {
    if (!publicClient) throw new Error('SALE_UI:No podemos comprobar el recibo de esta red.');
    const hash = await writeContractAsync(input);
    setLatestTxHash(hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
    return hash;
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
    const delays = [0, 350, 750, 1_200];
    for (let index = 0; index < delays.length; index += 1) {
      if (delays[index] > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delays[index]));
      }
      assertOperationContext(context);
      try {
        const result = await inspectSurface(wallet);
        assertOperationContext(context);
        if (result.activeListing) return result;
      } catch (reason) {
        if (transactionMessage(reason).includes('wallet_context_changed')) throw reason;
      }
    }
    return null;
  }

  async function approveCukie() {
    const context = latestOperationContextRef.current;
    if (!beginOperation('checking', context)) return;
    try {
      assertOperationContext(context);
      const ready = await ensureWallet();
      const activeContext = { ...context, wallet: ready.address };
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
          { feeLimit: 800_000_000, shouldPollResponse: true },
          () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
        );
        assertTronSendResult(tx);
        assertOperationContext(activeContext);
        const confirmed = await inspectSurface(actionContext.address);
        assertOperationContext(activeContext);
        if (!confirmed.approved) throw new Error('SALE_UI:El recibo llegó, pero no hemos podido confirmar la aprobación.');
        setInspection(confirmed);
        setApprovalState('approved');
        setNotice('Aprobación confirmada en TRON Mainnet. Ya puedes publicar el anuncio.');
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
      await writeEvm({
        account: ready.address as Address,
        chainId: evmChain,
        address: collectionAddress as Address,
        abi: surface === 'uki' ? ukiMarketplaceNftReadAbi : legacyMarketplaceBscAbis.token,
        functionName: 'approve',
        args: [marketplaceAddress as Address, BigInt(cuki.tokenId)],
      });
      assertOperationContext(activeContext);
      const confirmed = await inspectSurface(ready.address);
      assertOperationContext(activeContext);
      if (!confirmed.approved) throw new Error('SALE_UI:El recibo llegó, pero no hemos podido confirmar la aprobación.');
      setInspection(confirmed);
      setApprovalState('approved');
      setNotice(`Aprobación confirmada en ${signatureNetwork}. Ya puedes publicar el anuncio.`);
    } catch (reason) {
      setError(userError(reason));
      setApprovalState('required');
    } finally {
      operationLockRef.current = false;
      setPhase('idle');
    }
  }

  async function publishCukie() {
    const context = latestOperationContextRef.current;
    if (!beginOperation('checking', context)) return;
    try {
      assertOperationContext(context);
      if (identityError) throw new Error(`SALE_UI:${identityError}`);
      if (surface === 'uki' && !validation.valid) throw new Error(`SALE_UI:${validation.priceError ?? validation.expiryError ?? 'El precio no es válido.'}`);
      const ready = await ensureWallet();
      const activeContext = { ...context, wallet: ready.address };
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
          { callValue: 0, feeLimit: 800_000_000, shouldPollResponse: true },
          () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
        );
        assertTronSendResult(tx);
        assertOperationContext(activeContext);
        setPhase('syncing');
        const reconciled = await reconcilePublishedListing(activeContext, ready.address);
        assertOperationContext(activeContext);
        setListingState(reconciled ? 'published' : 'pending');
        setNotice(reconciled
          ? 'Venta publicada en TRON Mainnet. Actualizando la ficha y el catálogo…'
          : 'Transacción enviada en TRON Mainnet. La venta aparecerá cuando termine la indexación.');
        window.dispatchEvent(new Event('cukies:legacy-marketplace:refresh'));
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
        await writeEvm({
          account: ready.address as Address,
          chainId: evmChain,
          address: marketplaceAddress as Address,
          abi: ukiMarketplaceWriteAbi,
          functionName: 'createOrder',
          args: [collectionAddress as Address, BigInt(cuki.tokenId), validation.ukiPriceRaw, validation.expiresAt],
        });
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
        await writeEvm(request);
      }
      assertOperationContext(activeContext);
      setPhase('syncing');
      const reconciled = await reconcilePublishedListing(activeContext, ready.address);
      assertOperationContext(activeContext);
      setListingState(reconciled ? 'published' : 'pending');
      setNotice(reconciled
        ? `Venta publicada en ${signatureNetwork}. Actualizando la ficha y el catálogo…`
        : `Transacción enviada en ${signatureNetwork}. La venta aparecerá cuando termine la indexación.`);
      window.dispatchEvent(new Event(surface === 'uki' ? 'cukies:uki-marketplace:refresh' : 'cukies:legacy-marketplace:refresh'));
      onCompleted?.();
    } catch (reason) {
      setError(userError(reason));
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="grid max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl border border-[var(--uki-lilac)]/30 bg-[#09060f] p-0 text-[var(--uki-cream)] shadow-[0_0_80px_rgba(228,92,255,0.18)] sm:max-h-[calc(100dvh-3rem)]">
        <DialogHeader className="border-b border-white/10 px-5 py-5 pr-12 text-left sm:px-7 sm:py-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">
            <Store className="h-4 w-4" aria-hidden="true" /> Publicar en marketplace
          </div>
          <DialogTitle className="mt-2 font-headline text-2xl font-black tracking-[-0.025em] text-[var(--uki-cream)] sm:text-3xl">
            Vender Cukie #{cuki.tokenId}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            Revisa el precio y confirma cada firma por separado. El Cukie sigue en tu wallet hasta que el contrato valide la publicación.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-white/10 bg-[#0d0914] sm:aspect-square">
              <CukiImage
                src={cuki.imageUrl}
                alt={`Cukie #${cuki.tokenId}`}
                sizes="128px"
                className="object-contain p-2"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs font-black text-[var(--uki-cream)]">
                  {cuki.network ?? 'Red no identificada'}
                </span>
                <span className="rounded-full border border-[var(--uki-lilac)]/35 bg-[var(--uki-lilac)]/10 px-2.5 py-1 text-xs font-black text-[var(--uki-lilac)]">
                  {surfaceLabel(surface)}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]">
                <dt className="font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Colección</dt>
                <dd className="min-w-0 break-all font-mono text-[var(--uki-text)]">{cuki.collectionAddress || 'No disponible'}</dd>
                <dt className="font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Token</dt>
                <dd className="font-mono text-[var(--uki-text)]">{cuki.tokenId}</dd>
                <dt className="font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Firma</dt>
                <dd className="font-semibold text-[var(--uki-text)]">{signatureNetwork} · {shortIdentity(currentWallet)}</dd>
              </dl>
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
                disabled={busy}
                className="min-h-11 rounded-xl border border-white/15 bg-black/30 px-3 text-sm font-bold text-[var(--uki-text)] outline-none transition focus:border-[var(--uki-lilac)]/60 disabled:opacity-60"
              >
                {surfaces.map((option) => <option key={option} value={option}>{surfaceLabel(option)}</option>)}
              </select>
            </label>
          ) : null}

          <div className="mt-5 grid gap-4 rounded-xl border border-[var(--uki-lilac)]/20 bg-[var(--uki-lilac)]/[0.06] p-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
            <label className="grid gap-2 text-sm font-black text-[var(--uki-cream)]">
              Precio de venta ({surfaceCurrency(surface)})
              <input
                aria-label={`Precio de venta en ${surfaceCurrency(surface)}`}
                inputMode="decimal"
                type="text"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder={surface === 'legacy-tron' ? '3333' : surface === 'legacy-bsc' ? '0,195' : '1250'}
                disabled={busy || listingState === 'pending'}
                className="min-h-12 rounded-xl border border-white/15 bg-black/30 px-3 font-mono text-lg font-bold text-[var(--uki-cream)] outline-none transition placeholder:text-white/30 focus:border-[var(--uki-lilac)]/65 disabled:opacity-60"
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
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
              <p className="font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Vendedor</p>
              <p className="mt-1 font-semibold text-[var(--uki-cream)]">{sellerAmountCopy}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
              <p className="leading-6 text-[var(--uki-text)]">{feeCopy}</p>
            </div>
            {surface === 'uki' ? <p className="pl-7 text-xs font-semibold leading-5 text-[var(--uki-muted)]">La orden vence por defecto en 7 días. No se habilitan BNB, USDT ni otros tokens en este flujo.</p> : <p className="pl-7 text-xs font-semibold leading-5 text-[var(--uki-muted)]">La comisión Legacy se lee en cada red y puede tener reglas históricas propias. La wallet mostrará el coste de red antes de firmar.</p>}
          </div>

          {inspectState === 'needs_wallet' ? (
            <p role="status" className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm font-semibold text-amber-100">Conecta o cambia la wallet a {signatureNetwork} para comprobar propiedad y aprobación.</p>
          ) : null}
          {inspectState === 'checking' ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--uki-muted)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Comprobando propietario, red, colección y permiso…</p>
          ) : null}
          {error ? <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm font-semibold leading-6 text-amber-100"><CircleAlert className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /> {error}</p> : null}
          {notice ? <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm font-semibold leading-6 text-emerald-100"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /> {notice}</p> : null}
          {latestTxHash ? <p className="mt-2 break-all text-xs font-mono text-[var(--uki-muted)]">Última transacción: {latestTxHash}</p> : null}

          <ol aria-label="Pasos para publicar el Cukie" className="mt-5 grid gap-3">
            <li className={`rounded-xl border p-4 ${approvalDone ? 'border-emerald-300/25 bg-emerald-300/[0.06]' : 'border-white/10 bg-black/20'}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${approvalDone ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100' : 'border-white/20 text-[var(--uki-muted)]'}`}>
                  {approvalDone ? <Check className="h-4 w-4" aria-hidden="true" /> : '1'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-[var(--uki-cream)]">Aprobar Cukie</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--uki-muted)]">Permiso limitado a este token y a este marketplace. La aprobación no publica el anuncio.</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void approveCukie()}
                    disabled={busy || approvalDone || Boolean(identityError)}
                    className="mt-3 min-h-10 border-[var(--uki-lilac)]/35 bg-[var(--uki-lilac)]/10 text-[var(--uki-cream)] hover:bg-[var(--uki-lilac)]/20"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    {approvalDone ? 'Aprobar Cukie · ya aprobado' : phase === 'approving' ? 'Esperando recibo…' : phase === 'checking' ? 'Comprobando…' : 'Aprobar Cukie'}
                  </Button>
                  {approvalDone ? <p className="mt-2 text-xs font-bold text-emerald-200">Aprobación confirmada y revalidada.</p> : null}
                </div>
              </div>
            </li>
            <li className={`rounded-xl border p-4 ${listingState === 'pending' || listingState === 'published' ? 'border-emerald-300/25 bg-emerald-300/[0.06]' : 'border-white/10 bg-black/20'}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${listingState === 'pending' || listingState === 'published' ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100' : 'border-white/20 text-[var(--uki-muted)]'}`}>
                  {listingState === 'pending' || listingState === 'published' ? <Check className="h-4 w-4" aria-hidden="true" /> : '2'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-[var(--uki-cream)]">Poner en la tienda</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--uki-muted)]">Después del recibo de aprobación, firma una segunda transacción para crear el anuncio.</p>
                  <Button
                    type="button"
                    onClick={() => void publishCukie()}
                    disabled={!canPublish}
                    className="mt-3 min-h-10 bg-[var(--uki-lilac)] text-[#09060f] hover:bg-[#f19bff]"
                  >
                    <Store className="h-4 w-4" aria-hidden="true" />
                    {listingState === 'published' ? 'Anuncio publicado' : listingState === 'pending' ? 'Publicación pendiente…' : phase === 'listing' ? 'Esperando recibo…' : 'Poner en la tienda'}
                  </Button>
                </div>
              </div>
            </li>
          </ol>

          <p className="mt-4 flex items-start gap-2 text-xs font-semibold leading-5 text-[var(--uki-muted)]"><Network className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" /> Cada operación vuelve a comprobar wallet, red, propietario, colección, bloqueo y anuncio antes de firmar. Un cambio de cuenta o red cancela la operación sin borrar el precio.</p>
        </div>

        <DialogFooter className="border-t border-white/10 px-5 py-4 sm:px-7">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="min-h-11 border-white/15 bg-white/[0.03] text-[var(--uki-cream)]">Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
