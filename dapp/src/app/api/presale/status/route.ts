import { NextResponse } from 'next/server';
import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { presaleAbi, ukiSaleContracts } from '@/lib/contracts/uki-sale';
import {
  UKI_PRESALE_START_ISO,
  UKI_PRESALE_START_LABEL,
  UKI_PRESALE_CHAIN_ID,
  UKI_PRESALE_CHAIN_LABEL,
} from '@/components/landing/sale-config';

export const dynamic = 'force-dynamic';

function getChain(chainId: number) {
  return chainId === bscTestnet.id ? bscTestnet : bsc;
}

export async function GET() {
  const configuredPresale = ukiSaleContracts.presaleAddress;
  const baseStatus = {
    chainId: UKI_PRESALE_CHAIN_ID,
    chainLabel: UKI_PRESALE_CHAIN_LABEL,
    startsAt: UKI_PRESALE_START_ISO,
    startsAtLabel: UKI_PRESALE_START_LABEL,
    contracts: ukiSaleContracts,
  };

  if (!configuredPresale || !isAddress(configuredPresale)) {
    return NextResponse.json({
      ...baseStatus,
      source: 'static',
      isConfigured: false,
      message: 'Presale contract is not configured yet.',
    });
  }

  const chain = getChain(ukiSaleContracts.chainId);
  const client = createPublicClient({
    chain,
    transport: http(),
  });

  const [
    isOpen,
    saleStart,
    saleEnd,
    ukiPerAsm,
    minAsmPerPurchase,
    maxAsmPerPurchase,
    walletAsmCap,
    totalUkiForSale,
    totalAsmRaised,
    totalUkiSold,
    vestingStart,
    vestingDuration,
  ] = await Promise.all([
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'isOpen' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'saleStart' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'saleEnd' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'ukiPerAsm' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'minAsmPerPurchase' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'maxAsmPerPurchase' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'walletAsmCap' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'totalUkiForSale' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'totalAsmRaised' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'totalUkiSold' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'vestingStart' }),
    client.readContract({ address: configuredPresale, abi: presaleAbi, functionName: 'vestingDuration' }),
  ]);

  return NextResponse.json({
    ...baseStatus,
    source: 'contract',
    isConfigured: true,
    isOpen,
    saleStart: Number(saleStart),
    saleEnd: Number(saleEnd),
    vestingStart: Number(vestingStart),
    vestingDuration: Number(vestingDuration),
    price: {
      ukiPerAsm: ukiPerAsm.toString(),
      ukiPerAsmFormatted: formatUnits(ukiPerAsm, 18),
    },
    limits: {
      minAsmPerPurchase: minAsmPerPurchase.toString(),
      maxAsmPerPurchase: maxAsmPerPurchase.toString(),
      walletAsmCap: walletAsmCap.toString(),
    },
    totals: {
      totalUkiForSale: totalUkiForSale.toString(),
      totalAsmRaised: totalAsmRaised.toString(),
      totalUkiSold: totalUkiSold.toString(),
    },
  });
}
