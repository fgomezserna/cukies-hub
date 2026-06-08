'use client';

import Link from 'next/link';
import { AlertTriangle, Timer } from 'lucide-react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { presaleAbi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';
import { LandingWalletConnectButton } from './wallet-connect-dynamic';

function hasPurchased(value?: bigint) {
  if (!value || value <= BigInt(0)) return false;

  const numeric = Number(formatUnits(value, 18));
  return Number.isFinite(numeric) && numeric > 0;
}

export function VestingAccessButton() {
  const { address, chainId, isConnected } = useAccount();
  const presaleAddress = ukiSaleContracts.presaleAddress as Address | undefined;
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;

  const { data: purchasedUki, isError, isLoading } = useReadContract({
    chainId: UKI_PRESALE_CHAIN_ID,
    address: presaleAddress,
    abi: presaleAbi,
    functionName: 'ukiPurchased',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && presaleAddress && !isWrongChain) },
  });

  if (!isConnected || !address) {
    return (
      <LandingWalletConnectButton
        className="mt-5 w-full justify-center"
        label="Conecta wallet para consultar"
        compactLabel="Consultar"
        showCompactText={false}
      />
    );
  }

  if (isWrongChain) {
    return (
      <button type="button" disabled className="uki-wallet-button mt-5 w-full justify-center opacity-60">
        Cambia a {UKI_PRESALE_CHAIN_LABEL}
      </button>
    );
  }

  if (!presaleAddress || isError) {
    return (
      <button type="button" disabled className="uki-wallet-button mt-5 w-full justify-center opacity-60">
        <AlertTriangle className="h-4 w-4" strokeWidth={1.8} />
        Vesting no disponible
      </button>
    );
  }

  if (hasPurchased(purchasedUki)) {
    return (
      <Link href="/vesting" className="uki-button uki-button-ghost mt-5 w-full justify-center">
        <span>Ver vesting</span>
        <span className="uki-button-icon" aria-hidden="true">
          <Timer className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </Link>
    );
  }

  return (
    <button type="button" disabled className="uki-wallet-button mt-5 w-full justify-center opacity-60">
      {isLoading ? 'Revisando wallet' : 'No tienes ningún UKI'}
    </button>
  );
}
