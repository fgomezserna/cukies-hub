'use client';

import { useMemo, useState } from 'react';
import { formatEther, isAddress, parseEther } from 'viem';
import {
  useAccount,
  useConnect,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { Check, CircleDollarSign, RotateCcw, Tag, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTronLink } from '@/hooks/use-tronlink';
import { legacyMarketplaceBscAbis } from '@/lib/legacy-marketplace/abis';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import {
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
  return error instanceof Error ? error.message : 'Unknown transaction error';
}

function isSameWallet(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function MarketplaceActions({ cuki }: MarketplaceActionsProps) {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: isConnectingWallet } = useConnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContract, isPending: isWriting } = useWriteContract();
  const {
    address: tronAddress,
    connect: connectTron,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
  } = useTronLink();
  const [sellPrice, setSellPrice] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isTronPending, setIsTronPending] = useState(false);

  const tokenId = useMemo(() => BigInt(cuki.tokenId), [cuki.tokenId]);
  const isBsc = cuki.network === 'BSC';
  const isTron = cuki.network === 'TRON';
  const bscOwner = isBsc && cuki.owner && isAddress(cuki.owner) ? cuki.owner : undefined;
  const isOwner = isBsc
    ? isSameWallet(address, cuki.owner)
    : isSameWallet(tronAddress, cuki.owner);
  const isBscReady = isBsc && isConnected && chainId === 56;
  const evmConnector =
    connectors.find((connector) => connector.id === 'injected') ?? connectors[0];

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
    if (!evmConnector) {
      setStatus('Instala una wallet EVM como MetaMask para operar en BSC.');
      return false;
    }

    try {
      setStatus('Abriendo wallet EVM...');
      const result = await connectAsync({ connector: evmConnector });
      const connectedChainId = result.chainId ?? chainId;

      if (connectedChainId !== 56) {
        setStatus('Cambia la wallet a BNB Smart Chain para continuar.');
        switchChain({ chainId: 56 });
        return false;
      }

      setStatus('Wallet EVM conectada en BSC. Ya puedes continuar.');
      return true;
    } catch (error) {
      setStatus(`No se pudo conectar la wallet EVM: ${getErrorMessage(error)}`);
      return false;
    }
  }

  function ensureBsc() {
    if (!isBsc) return false;
    if (!isConnected) {
      setStatus('Conecta una wallet EVM antes de continuar.');
      return false;
    }
    if (chainId !== 56) {
      setStatus('Cambia la wallet a BNB Smart Chain para continuar.');
      switchChain({ chainId: 56 });
      return false;
    }
    return true;
  }

  function approveBsc() {
    if (!ensureBsc()) return;
    setStatus('Enviando approval del marketplace BSC...');
    writeContract({
      address: bscTokenAddress,
      abi: legacyMarketplaceBscAbis.token,
      functionName: 'setApprovalForAll',
      args: [bscMarketplaceAddress, true],
    });
  }

  function buyBsc() {
    if (!ensureBsc() || !cuki.priceOriginal) return;
    setStatus('Enviando compra en BSC...');
    writeContract({
      address: bscMarketplaceAddress,
      abi: legacyMarketplaceBscAbis.marketplace,
      functionName: 'buyToken',
      args: [tokenId],
      value: BigInt(cuki.priceOriginal),
    });
  }

  function sellBsc() {
    if (!ensureBsc() || !sellPrice) return;
    setStatus('Listando Cukie en BSC...');
    writeContract({
      address: bscMarketplaceAddress,
      abi: legacyMarketplaceBscAbis.marketplace,
      functionName: 'putTokenOnSale',
      args: [tokenId, parseEther(sellPrice)],
      value: BigInt(0),
    });
  }

  function cancelBscSale() {
    if (!ensureBsc()) return;
    setStatus('Cancelando venta en BSC...');
    writeContract({
      address: bscMarketplaceAddress,
      abi: legacyMarketplaceBscAbis.marketplace,
      functionName: 'cancelTokenSale',
      args: [tokenId],
      value: (feeCancelPrice as bigint | undefined) ?? BigInt(0),
    });
  }

  function changeBscPrice() {
    if (!ensureBsc() || !sellPrice) return;
    setStatus('Actualizando precio en BSC...');
    writeContract({
      address: bscMarketplaceAddress,
      abi: legacyMarketplaceBscAbis.marketplace,
      functionName: 'changeMarketTokenPrice',
      args: [tokenId, parseEther(sellPrice)],
      value: (feeChangePrice as bigint | undefined) ?? BigInt(0),
    });
  }

  async function ensureTron() {
    if (!isTron) return false;
    if (!isTronInstalled) {
      setStatus('Instala o activa TronLink para operar en TRON.');
      return false;
    }
    if (!isTronConnected) {
      await connectTron();
      return false;
    }
    if (!window.tronWeb) {
      setStatus('TronLink no ha expuesto tronWeb todavia.');
      return false;
    }
    return true;
  }

  async function runTronAction(action: () => Promise<unknown>, label: string) {
    setIsTronPending(true);
    setStatus(label);
    try {
      const tx = await action();
      setStatus(`Transaccion enviada: ${String(tx).slice(0, 18)}...`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsTronPending(false);
    }
  }

  async function approveTron() {
    if (!(await ensureTron()) || !window.tronWeb) return;
    await runTronAction(
      () =>
        sendLegacyTronContract(
          window.tronWeb,
          'token',
          'setApprovalForAll',
          [tronMarketplaceAddress, true],
          { feeLimit: 800_000_000, shouldPollResponse: false },
        ),
      'Enviando approval del marketplace TRON...',
    );
  }

  async function buyTron() {
    if (!(await ensureTron()) || !window.tronWeb || !cuki.priceOriginal) return;
    await runTronAction(
      () =>
        sendLegacyTronContract(
          window.tronWeb,
          'marketplace',
          'buyToken',
          [cuki.tokenId],
          {
            callValue: Number(cuki.priceOriginal),
            feeLimit: 800_000_000,
            shouldPollResponse: false,
          },
        ),
      'Enviando compra en TRON...',
    );
  }

  async function sellTron() {
    if (!(await ensureTron()) || !window.tronWeb || !sellPrice) return;
    await runTronAction(
      () =>
        sendLegacyTronContract(
          window.tronWeb,
          'marketplace',
          'putTokenOnSale',
          [cuki.tokenId, Math.round(Number(sellPrice) * 1_000_000)],
          { feeLimit: 800_000_000, shouldPollResponse: false },
        ),
      'Listando Cukie en TRON...',
    );
  }

  async function cancelTronSale() {
    if (!(await ensureTron()) || !window.tronWeb) return;
    await runTronAction(async () => {
      const fee = await readLegacyTronContract<unknown>(
        window.tronWeb,
        'marketplace',
        'feeCancelPrice',
      );
      return sendLegacyTronContract(
        window.tronWeb,
        'marketplace',
        'cancelTokenSale',
        [cuki.tokenId],
        {
          callValue: Number(fee),
          feeLimit: 800_000_000,
          shouldPollResponse: false,
        },
      );
    }, 'Cancelando venta en TRON...');
  }

  const disabled = isWriting || isSwitchingChain || isTronPending || isConnectingWallet;

  return (
    <div className="rounded-[8px] border border-white/10 bg-[#101b19]/90 p-5 shadow-xl shadow-black/25">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-headline text-2xl font-bold text-white">
              Operaciones
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {cuki.network} · owner {shortWallet(cuki.owner)}
            </p>
          </div>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
            {formatLegacyPrice(cuki)}
          </span>
        </div>
        {isBsc && feeCancelPrice !== undefined && (
          <p className="text-xs text-slate-500">
            Cancel fee {formatEther(feeCancelPrice as bigint)} BNB · Change fee{' '}
            {formatEther((feeChangePrice as bigint | undefined) ?? BigInt(0))} BNB
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
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          >
            <Wallet className="mr-2 h-4 w-4" />
            {isConnectingWallet
              ? 'Connecting wallet...'
              : isConnected
                ? 'Switch to BSC'
                : 'Connect EVM wallet'}
          </Button>
        )}

        {isTron && !isTronConnected && (
          <Button
            onClick={() => void ensureTron()}
            disabled={disabled}
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          >
            <Wallet className="mr-2 h-4 w-4" />
            Connect TronLink
          </Button>
        )}

        {isOwner && (
          <Button
            onClick={isBsc ? approveBsc : () => void approveTron()}
            disabled={disabled}
            variant="outline"
            className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
          >
            <Check className="mr-2 h-4 w-4" />
            {isBsc && isApprovedForAll ? 'Marketplace approved' : 'Approve marketplace'}
          </Button>
        )}

        {cuki.state === 'onSale' && !isOwner && (
          <Button
            onClick={isBsc ? buyBsc : () => void buyTron()}
            disabled={disabled || !cuki.priceOriginal}
            className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
          >
            <CircleDollarSign className="mr-2 h-4 w-4" />
            Buy Cukie
          </Button>
        )}

        {isOwner && (
          <div className="grid gap-3 rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
            <Input
              inputMode="decimal"
              placeholder={isBsc ? 'Price in BNB' : 'Price in TRX'}
              value={sellPrice}
              onChange={(event) => setSellPrice(event.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {cuki.state === 'onSale' ? (
                <>
                  <Button
                    onClick={isBsc ? changeBscPrice : () => void sellTron()}
                    disabled={disabled || !sellPrice}
                    className="bg-white text-slate-950 hover:bg-slate-200"
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    Update price
                  </Button>
                  <Button
                    onClick={isBsc ? cancelBscSale : () => void cancelTronSale()}
                    disabled={disabled}
                    variant="outline"
                    className="border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Cancel sale
                  </Button>
                </>
              ) : (
                <Button
                  onClick={isBsc ? sellBsc : () => void sellTron()}
                  disabled={disabled || !sellPrice}
                  className="bg-white text-slate-950 hover:bg-slate-200 sm:col-span-2"
                >
                  <Tag className="mr-2 h-4 w-4" />
                  Put on sale
                </Button>
              )}
            </div>
          </div>
        )}

        {!isOwner && cuki.state !== 'onSale' && (
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
            Este Cukie no esta listado. Las acciones de venta aparecen cuando
            conectas la wallet propietaria.
          </div>
        )}

        {status && (
          <div className="rounded-[8px] border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
