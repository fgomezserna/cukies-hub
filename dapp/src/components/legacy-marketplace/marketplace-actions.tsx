'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatEther, isAddress, parseEther } from 'viem';
import {
  useAccount,
  useConnect,
  useConfig,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { getAccount, getChainId } from 'wagmi/actions';
import { Check, CircleDollarSign, RotateCcw, Tag, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useTronLink } from '@/hooks/use-tronlink';
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';
import { legacyMarketplaceBscAbis } from '@/lib/legacy-marketplace/abis';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { legacyMarketplaceRuntime } from '@/lib/legacy-marketplace/runtime';
import {
  assertDisplayedPriceUnchanged,
  assertEvmActionContext,
  assertTronActionContext,
  captureTronActionContext,
  isSameEvmWallet,
  isSameTronWallet,
  reconcileConfirmedMarketplaceAction,
  type LegacyTronActionContext,
} from '@/lib/legacy-marketplace/action-safety';
import { getLegacyMarketplaceCollection } from '@/lib/legacy-marketplace/identity';
import {
  getLegacyTronWeb,
  readLegacyTronContract,
  sendLegacyTronContract,
} from '@/lib/legacy-marketplace/tron';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

import { formatLegacyPrice, shortWallet } from './format';

type MarketplaceActionsProps = {
  cuki: LegacyMarketplaceCukiItem;
};

const bscMarketplaceAddress = legacyMarketplaceContracts.bsc.contracts.marketplace;
const bscTokenAddress = legacyMarketplaceContracts.bsc.contracts.token;
const tronMarketplaceAddress =
  legacyMarketplaceContracts.tron.contracts.marketplace;

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('reject') || message.includes('denied') || message.includes('4001')) {
    return 'Operación rechazada en la wallet. No se ha enviado ninguna transacción.';
  }
  if (message.includes('invalid_price')) return 'Introduce un precio válido mayor que cero.';
  if (message.includes('approval_required')) return 'Debes conceder permiso al contrato antes de publicar el Cukie.';
  if (message.includes('not_owner') || message.includes('not_owned')) return 'La wallet conectada ya no es la propietaria válida para esta acción.';
  if (message.includes('not_active') || message.includes('not_sellable')) return 'El estado del Cukie cambió. Actualiza la ficha antes de continuar.';
  if (message.includes('owner_cannot_buy')) return 'La wallet propietaria no puede comprar su propio anuncio.';
  if (message.includes('already_approved')) return 'El contrato ya tiene permiso para operar con tus Cukies.';
  if (message.includes('listing_price_changed')) return 'El precio del anuncio cambió. Se ha actualizado la ficha; revísalo y confirma de nuevo.';
  if (message.includes('wallet_context_changed')) return 'La cuenta o la red cambió durante la validación. La operación no se ha enviado.';
  return 'La operación no se pudo completar. Vuelve a validar la red, el saldo y el estado del anuncio.';
}

function contractField(value: unknown, name: string, index: number) {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object') {
    return (value as Record<string, unknown>)[name]
      ?? (value as Record<string, unknown>)[String(index)];
  }
  return undefined;
}

function contractInteger(value: unknown) {
  const normalized = value && typeof value === 'object' && 'toString' in value
    ? String(value)
    : typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : '';
  if (!/^\d+$/.test(normalized)) throw new Error('INVALID_CONTRACT_VALUE');
  return BigInt(normalized);
}

function contractBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  throw new Error('INVALID_CONTRACT_VALUE');
}

export function MarketplaceActions({ cuki }: MarketplaceActionsProps) {
  if (!legacyMarketplaceRuntime.legacyMarketplaceActionsEnabled) {
    return (
      <div className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-5 text-amber-50">
        <h2 className="font-headline text-xl font-bold">Marketplace en modo seguro</h2>
        <p className="mt-2 text-sm text-amber-100/80">
          Puedes revisar el inventario. Comprar y vender volverá a estar disponible
          cuando termine la actualización del servicio.
        </p>
      </div>
    );
  }

  return <LegacyMainnetMarketplaceActions cuki={cuki} />;
}

function LegacyMainnetMarketplaceActions({ cuki }: MarketplaceActionsProps) {
  const router = useRouter();
  const wagmiConfig = useConfig();
  const { address, chainId, isConnected } = useAccount();
  const { isPending: isConnectingWallet } = useConnect();
  const publicClient = usePublicClient({ chainId: 56 });
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const {
    address: tronAddress,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
  } = useTronLink();
  const { requestWallet, evm: evmWallet } = useWalletCoordinator();
  const [sellPrice, setSellPrice] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isTronPending, setIsTronPending] = useState(false);
  const [isBscPending, setIsBscPending] = useState(false);
  const [buyConfirmation, setBuyConfirmation] = useState(false);
  const [isPreparingBuy, setIsPreparingBuy] = useState(false);
  const actionLockRef = useRef(false);
  const hasMounted = useHasMounted();

  const tokenId = useMemo(() => BigInt(cuki.tokenId), [cuki.tokenId]);
  const isBsc = cuki.network === 'BSC';
  const isTron = cuki.network === 'TRON';
  const bscOwner = isBsc && cuki.owner && isAddress(cuki.owner) ? cuki.owner : undefined;
  const isOwner = isBsc
    ? isSameEvmWallet(address, cuki.owner)
    : Boolean(
        hasMounted
        && typeof window !== 'undefined'
        && getLegacyTronWeb()
        && isSameTronWallet(getLegacyTronWeb()!, tronAddress, cuki.owner),
      );
  const isBscReady = isBsc && isConnected && chainId === 56;

  useEffect(() => {
    setBuyConfirmation(false);
  }, [cuki.network, cuki.owner, cuki.priceOriginal, cuki.tokenId, address, chainId, tronAddress, isTronConnected]);

  function parsedBscPrice() {
    const value = sellPrice.trim();
    if (!/^\d+(?:\.\d{1,18})?$/.test(value)) {
      throw new Error('INVALID_PRICE');
    }
    const price = parseEther(value);
    if (price <= BigInt(0)) throw new Error('INVALID_PRICE');
    return price;
  }

  function parsedTronPrice() {
    const value = sellPrice.trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
      throw new Error('INVALID_PRICE');
    }
    const [whole, fraction = ''] = value.split('.');
    const price = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, '0'));
    if (price <= BigInt(0) || price > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('INVALID_PRICE');
    }
    return Number(price);
  }

  const { data: isApprovedForAll } = useReadContract({
    address: bscTokenAddress,
    abi: legacyMarketplaceBscAbis.token,
    functionName: 'isApprovedForAll',
    args: bscOwner ? [bscOwner, bscMarketplaceAddress] : undefined,
    query: {
      enabled: Boolean(isBsc && bscOwner),
    },
  });
  const { data: feeCancelPrice } = useReadContract({
    address: bscMarketplaceAddress,
    abi: legacyMarketplaceBscAbis.marketplace,
    functionName: 'feeCancelPrice',
    query: {
      enabled: isBsc,
    },
  });
  const { data: feeChangePrice } = useReadContract({
    address: bscMarketplaceAddress,
    abi: legacyMarketplaceBscAbis.marketplace,
    functionName: 'feeChangePrice',
    query: {
      enabled: isBsc,
    },
  });

  async function connectBscWallet() {
    try {
      setStatus('Abriendo tu wallet...');
      await requestWallet({
        kind: 'evm',
        targetChainId: 56,
        reason: 'Conecta una wallet EVM en BNB Smart Chain para operar este anuncio.',
      });
      setStatus('Wallet lista. Ya puedes continuar.');
      return true;
    } catch (error) {
      setStatus(`No se pudo conectar la wallet: ${getErrorMessage(error)}`);
      return false;
    }
  }

  function ensureBsc() {
    if (!isBsc) return false;
    if (!isConnected) {
      setStatus('Conecta tu wallet antes de continuar.');
      return false;
    }
    if (chainId !== 56 && getChainId(wagmiConfig) !== 56) {
      setStatus('Cambia la wallet a BNB Smart Chain para continuar.');
      void requestWallet({
        kind: 'evm',
        targetChainId: 56,
        reason: 'Cambia la wallet a BNB Smart Chain para continuar esta acción.',
      }).then(() => setStatus('Wallet lista. Revisa la acción y confirma de nuevo.'))
        .catch((error) => setStatus(getErrorMessage(error)));
      return false;
    }
    return true;
  }

  function assertCurrentBscContext() {
    if (!address) throw new Error('WALLET_CONTEXT_CHANGED');
    const current = getAccount(wagmiConfig);
    assertEvmActionContext({
      expectedAddress: address,
      expectedChainId: 56,
      currentAddress: current.address,
      currentChainId: getChainId(wagmiConfig),
    });
  }

  async function reconcileListing() {
    const collection = getLegacyMarketplaceCollection(cuki.network);
    if (!collection) throw new Error('INVALID_LEGACY_MARKETPLACE_NETWORK');
    const response = await fetch('/api/legacy-marketplace/reconcile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        source: 'legacy',
        tokenId: cuki.tokenId,
        network: cuki.network,
        collection,
      }),
    });
    if (!response.ok) throw new Error('LEGACY_RECONCILIATION_UNAVAILABLE');
  }

  async function inspectBsc() {
    if (!publicClient || !address) throw new Error('BSC_NOT_READY');
    const [paused, owner, listing, approved, liveFeeCancelPrice, liveFeeChangePrice] = await Promise.all([
      publicClient.readContract({
        address: bscMarketplaceAddress,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'paused',
      }),
      publicClient.readContract({
        address: bscTokenAddress,
        abi: legacyMarketplaceBscAbis.token,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      publicClient.readContract({
        address: bscMarketplaceAddress,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'marketTokens',
        args: [tokenId],
      }),
      publicClient.readContract({
        address: bscTokenAddress,
        abi: legacyMarketplaceBscAbis.token,
        functionName: 'isApprovedForAll',
        args: [address, bscMarketplaceAddress],
      }),
      publicClient.readContract({
        address: bscMarketplaceAddress,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'feeCancelPrice',
      }),
      publicClient.readContract({
        address: bscMarketplaceAddress,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'feeChangePrice',
      }),
    ]);
    const marketToken = listing as readonly [string, bigint, bigint, boolean, bigint, bigint];
    return {
      paused: paused as boolean,
      owner: String(owner),
      approved: approved as boolean,
      listingOwner: marketToken[0],
      price: marketToken[1],
      isOnSale: marketToken[3],
      feeCancelPrice: liveFeeCancelPrice as bigint,
      feeChangePrice: liveFeeChangePrice as bigint,
    };
  }

  async function runBscAction(
    label: string,
    request: () => Promise<`0x${string}`>,
  ) {
    if (actionLockRef.current || !ensureBsc() || !publicClient) return;
    actionLockRef.current = true;
    setIsBscPending(true);
    setStatus(label);
    try {
      const hash = await request();
      setStatus('Transacción enviada. Esperando confirmación en BNB Smart Chain…');
      const confirmation = await reconcileConfirmedMarketplaceAction(
        async () => {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== 'success') throw new Error('TRANSACTION_REVERTED');
          return receipt;
        },
        reconcileListing,
      );
      if (confirmation.reconciled) {
        setStatus(`Confirmada en BNB Smart Chain · ${hash.slice(0, 10)}…${hash.slice(-6)}. Ficha reconciliada.`);
      } else {
        setStatus(`Confirmada en BNB Smart Chain · ${hash.slice(0, 10)}…${hash.slice(-6)}. La sincronización sigue pendiente; no repitas la transacción.`);
      }
      router.refresh();
    } catch (error) {
      setStatus(getErrorMessage(error));
      if (error instanceof Error && error.message.includes('LISTING_PRICE_CHANGED')) {
        router.refresh();
      }
    } finally {
      actionLockRef.current = false;
      setIsBscPending(false);
    }
  }

  async function approveBsc() {
    await runBscAction('Validando propiedad y permiso en el contrato…', async () => {
      const live = await inspectBsc();
      if (!isSameEvmWallet(live.owner, address)) throw new Error('NOT_OWNER');
      if (live.approved) throw new Error('ALREADY_APPROVED');
      assertCurrentBscContext();
      return writeContractAsync({
        account: address,
        chainId: 56,
        address: bscTokenAddress,
        abi: legacyMarketplaceBscAbis.token,
        functionName: 'setApprovalForAll',
        args: [bscMarketplaceAddress, true],
      });
    });
  }

  async function buyBsc() {
    await runBscAction('Validando anuncio, propietario y precio en el contrato…', async () => {
      const live = await inspectBsc();
      if (live.paused || !live.isOnSale || live.price <= BigInt(0)) {
        throw new Error('LISTING_NOT_ACTIVE');
      }
      if (isSameEvmWallet(live.listingOwner, address)) throw new Error('OWNER_CANNOT_BUY');
      assertDisplayedPriceUnchanged(cuki.priceOriginal, live.price);
      assertCurrentBscContext();
      return writeContractAsync({
        account: address,
        chainId: 56,
        address: bscMarketplaceAddress,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'buyToken',
        args: [tokenId],
        value: live.price,
      });
    });
  }

  async function sellBsc() {
    await runBscAction('Validando propiedad, permiso y estado en el contrato…', async () => {
      const live = await inspectBsc();
      if (live.paused || live.isOnSale || !isSameEvmWallet(live.owner, address)) {
        throw new Error('TOKEN_NOT_SELLABLE');
      }
      if (!live.approved) throw new Error('APPROVAL_REQUIRED');
      assertCurrentBscContext();
      return writeContractAsync({
        account: address,
        chainId: 56,
        address: bscMarketplaceAddress,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'putTokenOnSale',
        args: [tokenId, parsedBscPrice()],
        value: BigInt(0),
      });
    });
  }

  async function cancelBscSale() {
    await runBscAction('Validando el anuncio antes de retirarlo…', async () => {
      const live = await inspectBsc();
      if (live.paused || !live.isOnSale || !isSameEvmWallet(live.listingOwner, address)) {
        throw new Error('LISTING_NOT_OWNED');
      }
      assertCurrentBscContext();
      return writeContractAsync({
        account: address,
        chainId: 56,
        address: bscMarketplaceAddress,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'cancelTokenSale',
        args: [tokenId],
        value: live.feeCancelPrice,
      });
    });
  }

  async function changeBscPrice() {
    await runBscAction('Validando el anuncio antes de cambiar el precio…', async () => {
      const live = await inspectBsc();
      if (live.paused || !live.isOnSale || !isSameEvmWallet(live.listingOwner, address)) {
        throw new Error('LISTING_NOT_OWNED');
      }
      assertCurrentBscContext();
      return writeContractAsync({
        account: address,
        chainId: 56,
        address: bscMarketplaceAddress,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'changeMarketTokenPrice',
        args: [tokenId, parsedBscPrice()],
        value: live.feeChangePrice,
      });
    });
  }

  async function ensureTron() {
    if (!isTron) return false;
    if (!isTronInstalled) {
      setStatus('Instala o activa TronLink para operar en TRON.');
      return false;
    }
    try {
      await requestWallet({
        kind: 'tron',
        targetTronNetwork: 'mainnet',
        reason: 'Conecta TronLink en TRON Mainnet para operar este anuncio.',
      });
      return Boolean(getLegacyTronWeb());
    } catch (error) {
      setStatus(getErrorMessage(error));
      return false;
    }
  }

  async function inspectTron(actionAddress: string) {
    const tronWeb = getLegacyTronWeb();
    if (!tronWeb) throw new Error('TRON_NOT_READY');
    const [paused, owner, listing, approved] = await Promise.all([
      readLegacyTronContract(tronWeb, 'marketplace', 'paused'),
      readLegacyTronContract(tronWeb, 'token', 'ownerOf', [cuki.tokenId]),
      readLegacyTronContract(tronWeb, 'marketplace', 'marketTokens', [cuki.tokenId]),
      readLegacyTronContract(tronWeb, 'token', 'isApprovedForAll', [
        actionAddress,
        tronMarketplaceAddress,
      ]),
    ]);
    return {
      paused: contractBoolean(paused),
      owner: String(owner),
      approved: contractBoolean(approved),
      listingOwner: String(contractField(listing, 'owner', 0) ?? ''),
      price: contractInteger(contractField(listing, 'price', 1)),
      isOnSale: contractBoolean(contractField(listing, 'isOnSale', 3)),
    };
  }

  function captureCurrentTronContext(): LegacyTronActionContext | null {
    const tronWeb = getLegacyTronWeb();
    if (!tronWeb) return null;
    try {
      return captureTronActionContext(
        tronWeb,
        legacyMarketplaceContracts.tron.rpcUrl,
      );
    } catch (error) {
      setStatus(getErrorMessage(error));
      return null;
    }
  }

  async function runTronAction(action: () => Promise<unknown>, label: string) {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setIsTronPending(true);
    setStatus(label);
    try {
      const confirmation = await reconcileConfirmedMarketplaceAction(
        action,
        reconcileListing,
      );
      const tx = confirmation.result;
      if (confirmation.reconciled) {
        setStatus(`Operación confirmada en TRON · ${String(tx).slice(0, 18)}… Ficha reconciliada.`);
      } else {
        setStatus(`Operación confirmada en TRON · ${String(tx).slice(0, 18)}… La sincronización sigue pendiente; no repitas la transacción.`);
      }
      router.refresh();
    } catch (error) {
      setStatus(getErrorMessage(error));
      if (error instanceof Error && error.message.includes('LISTING_PRICE_CHANGED')) {
        router.refresh();
      }
    } finally {
      actionLockRef.current = false;
      setIsTronPending(false);
    }
  }

  async function approveTron() {
    if (!(await ensureTron())) return;
    const tronWeb = getLegacyTronWeb();
    const actionContext = captureCurrentTronContext();
    if (!tronWeb || !actionContext) return;
    await runTronAction(
      async () => {
        const live = await inspectTron(actionContext.address);
        const currentTronWeb = getLegacyTronWeb();
        if (!currentTronWeb || !isSameTronWallet(currentTronWeb, live.owner, actionContext.address)) {
          throw new Error('NOT_OWNER');
        }
        if (live.approved) throw new Error('ALREADY_APPROVED');
        return sendLegacyTronContract(
          tronWeb,
          'token',
          'setApprovalForAll',
          [tronMarketplaceAddress, true],
          { feeLimit: 800_000_000, shouldPollResponse: true },
          () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
        );
      },
      'Validando propiedad y permiso en TRON Mainnet…',
    );
  }

  async function buyTron() {
    if (!(await ensureTron())) return;
    const tronWeb = getLegacyTronWeb();
    const actionContext = captureCurrentTronContext();
    if (!tronWeb || !cuki.priceOriginal || !actionContext) return;
    await runTronAction(
      async () => {
        const live = await inspectTron(actionContext.address);
        if (live.paused || !live.isOnSale || live.price <= BigInt(0)) {
          throw new Error('LISTING_NOT_ACTIVE');
        }
        const currentTronWeb = getLegacyTronWeb();
        if (!currentTronWeb) throw new Error('TRON_NOT_READY');
        if (isSameTronWallet(currentTronWeb, live.listingOwner, actionContext.address)) {
          throw new Error('OWNER_CANNOT_BUY');
        }
        assertDisplayedPriceUnchanged(cuki.priceOriginal, live.price);
        return sendLegacyTronContract(
          tronWeb,
          'marketplace',
          'buyToken',
          [cuki.tokenId],
          {
            callValue: Number(live.price),
            feeLimit: 800_000_000,
            shouldPollResponse: true,
          },
          () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
        );
      },
      'Validando anuncio, propietario y precio en TRON Mainnet…',
    );
  }

  async function sellTron() {
    if (!(await ensureTron())) return;
    const tronWeb = getLegacyTronWeb();
    const actionContext = captureCurrentTronContext();
    if (!tronWeb || !sellPrice || !actionContext) return;
    await runTronAction(
      async () => {
        const live = await inspectTron(actionContext.address);
        const currentTronWeb = getLegacyTronWeb();
        if (
          !currentTronWeb
          || live.paused
          || live.isOnSale
          || !isSameTronWallet(currentTronWeb, live.owner, actionContext.address)
        ) {
          throw new Error('TOKEN_NOT_SELLABLE');
        }
        if (!live.approved) throw new Error('APPROVAL_REQUIRED');
        return sendLegacyTronContract(
          tronWeb,
          'marketplace',
          'putTokenOnSale',
          [cuki.tokenId, parsedTronPrice()],
          { feeLimit: 800_000_000, shouldPollResponse: true },
          () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
        );
      },
      'Validando propiedad, permiso y estado en TRON Mainnet…',
    );
  }

  async function cancelTronSale() {
    if (!(await ensureTron())) return;
    const tronWeb = getLegacyTronWeb();
    const actionContext = captureCurrentTronContext();
    if (!tronWeb || !actionContext) return;
    await runTronAction(async () => {
      const live = await inspectTron(actionContext.address);
      const currentTronWeb = getLegacyTronWeb();
      if (
        !currentTronWeb
        || live.paused
        || !live.isOnSale
        || !isSameTronWallet(currentTronWeb, live.listingOwner, actionContext.address)
      ) {
        throw new Error('LISTING_NOT_OWNED');
      }
      const fee = await readLegacyTronContract<unknown>(
        tronWeb,
        'marketplace',
        'feeCancelPrice',
      );
      return sendLegacyTronContract(
        tronWeb,
        'marketplace',
        'cancelTokenSale',
        [cuki.tokenId],
        {
          callValue: Number(contractInteger(fee)),
          feeLimit: 800_000_000,
          shouldPollResponse: true,
        },
        () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
      );
    }, 'Retirando el anuncio...');
  }

  async function changeTronPrice() {
    if (!(await ensureTron())) return;
    const tronWeb = getLegacyTronWeb();
    const actionContext = captureCurrentTronContext();
    if (!tronWeb || !actionContext) return;
    await runTronAction(async () => {
      const live = await inspectTron(actionContext.address);
      const currentTronWeb = getLegacyTronWeb();
      if (
        !currentTronWeb
        || live.paused
        || !live.isOnSale
        || !isSameTronWallet(currentTronWeb, live.listingOwner, actionContext.address)
      ) {
        throw new Error('LISTING_NOT_OWNED');
      }
      const fee = await readLegacyTronContract<unknown>(
        tronWeb,
        'marketplace',
        'feeChangePrice',
      );
      return sendLegacyTronContract(
        tronWeb,
        'marketplace',
        'changeMarketTokenPrice',
        [cuki.tokenId, parsedTronPrice()],
        {
          callValue: Number(contractInteger(fee)),
          feeLimit: 800_000_000,
          shouldPollResponse: true,
        },
        () => assertTronActionContext(getLegacyTronWeb()!, actionContext),
      );
    }, 'Validando el anuncio antes de cambiar el precio…');
  }

  async function prepareBuy() {
    if (buyConfirmation) {
      if (isBsc) await buyBsc();
      else await buyTron();
      return;
    }
    setIsPreparingBuy(true);
    setStatus('Preparando la wallet para revisar la compra…');
    try {
      await requestWallet({
        kind: isBsc ? 'evm' : 'tron',
        ...(isBsc
          ? { targetChainId: 56 as const }
          : { targetTronNetwork: 'mainnet' as const }),
        reason: `Comprar Cukie · ${formatLegacyPrice(cuki)}. No se firmará nada hasta confirmar.`,
      });
      setBuyConfirmation(true);
      setStatus('Wallet lista. Revisa el comprador, la red y el precio; después confirma la compra.');
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsPreparingBuy(false);
    }
  }

  const disabled = isWriting || isBscPending || evmWallet.isConnecting || isTronPending || isConnectingWallet || isPreparingBuy;

  return (
    <div className="rounded-[12px] border border-[var(--uki-lilac)]/20 bg-[#080712]/92 p-5 shadow-[0_0_32px_rgba(228,92,255,0.08)]">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-headline text-2xl font-bold text-white">
              Qué puedes hacer
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {cuki.network} · propietario {shortWallet(cuki.owner)}
            </p>
          </div>
          <span className="rounded-full border border-lilac-300/25 bg-lilac-300/10 px-3 py-1 text-xs font-semibold text-lilac-100">
            {formatLegacyPrice(cuki)}
          </span>
        </div>
        {isBsc && feeCancelPrice !== undefined && (
          <p className="text-xs text-slate-500">
            Retirar el anuncio cuesta {formatEther(feeCancelPrice as bigint)} BNB · Cambiar el precio cuesta{' '}
            {formatEther((feeChangePrice as bigint | undefined) ?? BigInt(0))} BNB
          </p>
        )}
        {legacyMarketplaceRuntime.appEnv === 'staging' && (
          <p className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 p-3 text-xs font-semibold text-amber-100">
            Stage usa los contratos Legacy reales de BSC/TRON Mainnet. La wallet volverá a validar red, propietario, anuncio, precio y permisos antes de firmar.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-3">
        {isBsc && !isBscReady && (
          <Button
            onClick={() => {
              if (isConnected) {
                ensureBsc();
                return;
              }

              void connectBscWallet();
            }}
            disabled={disabled}
            className="bg-lilac-400 text-slate-950 hover:bg-lilac-300"
          >
            <Wallet className="mr-2 h-4 w-4" />
            {isConnectingWallet
              ? 'Conectando wallet...'
              : isConnected
                ? 'Cambiar a BNB Smart Chain'
                : 'Conectar wallet'}
          </Button>
        )}

        {isTron && !isTronConnected && (
          <Button
            onClick={() => void ensureTron()}
            disabled={disabled}
            className="bg-lilac-400 text-slate-950 hover:bg-lilac-300"
          >
            <Wallet className="mr-2 h-4 w-4" />
            Conectar TronLink
          </Button>
        )}

        {isOwner && (
          <Button
            onClick={isBsc ? () => void approveBsc() : () => void approveTron()}
            disabled={disabled || (isBsc && Boolean(isApprovedForAll))}
            variant="outline"
            className="border-lilac-300/25 bg-lilac-300/10 text-lilac-100 hover:bg-lilac-300/20"
          >
            <Check className="mr-2 h-4 w-4" />
            {isBsc && isApprovedForAll ? 'Permiso concedido' : 'Dar permiso para operar'}
          </Button>
        )}

        {cuki.state === 'onSale' && !isOwner && (
          <>
          {buyConfirmation ? (
            <div role="status" className="rounded-[8px] border border-lilac-200/25 bg-lilac-200/[0.08] p-3 text-sm text-lilac-50">
              <p className="font-bold">Confirma la compra de Cukie #{cuki.tokenId}</p>
              <p className="mt-1 text-xs text-lilac-100/80">
                Comprador: {shortWallet(isBsc ? (address ?? '') : (tronAddress ?? ''))} · Red: {isBsc ? 'BNB Smart Chain' : 'TRON Mainnet'} · Precio: {formatLegacyPrice(cuki)}
              </p>
              <p className="mt-1 text-xs text-lilac-100/70">La validación live de anuncio, propietario, precio y permisos ocurrirá antes de pedir la firma.</p>
            </div>
          ) : null}
          <Button
            onClick={() => void prepareBuy()}
            disabled={disabled || !cuki.priceOriginal}
            className="bg-[var(--uki-lilac)] text-[#100516] hover:bg-[#f19bff]"
          >
            <CircleDollarSign className="mr-2 h-4 w-4" />
            {buyConfirmation ? 'Confirmar compra' : 'Conectar y revisar compra'}
          </Button>
          </>
        )}

        {isOwner && (
          <div className="grid gap-3 rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
            <Input
              inputMode="decimal"
              placeholder={isBsc ? 'Precio en BNB' : 'Precio en TRX'}
              value={sellPrice}
              onChange={(event) => setSellPrice(event.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {cuki.state === 'onSale' ? (
                <>
                  <Button
                    onClick={isBsc ? () => void changeBscPrice() : () => void changeTronPrice()}
                    disabled={disabled || !sellPrice}
                    className="bg-white text-slate-950 hover:bg-slate-200"
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    Actualizar precio
                  </Button>
                  <Button
                    onClick={isBsc ? () => void cancelBscSale() : () => void cancelTronSale()}
                    disabled={disabled}
                    variant="outline"
                    className="border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Retirar de la venta
                  </Button>
                </>
              ) : (
                <Button
                  onClick={isBsc ? () => void sellBsc() : () => void sellTron()}
                  disabled={disabled || !sellPrice}
                  className="bg-white text-slate-950 hover:bg-slate-200 sm:col-span-2"
                >
                  <Tag className="mr-2 h-4 w-4" />
                  Poner a la venta
                </Button>
              )}
            </div>
          </div>
        )}

        {!isOwner && cuki.state !== 'onSale' && (
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
            Este Cukie no está a la venta. Las acciones aparecen cuando
            conectas la wallet propietaria.
          </div>
        )}

        {status && (
          <div className="rounded-[8px] border border-lilac-300/20 bg-lilac-300/10 p-3 text-sm text-lilac-100">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
