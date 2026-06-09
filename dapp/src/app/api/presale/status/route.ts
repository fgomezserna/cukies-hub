import { NextResponse } from 'next/server';
import { createPublicClient, formatUnits, http, isAddress, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { presaleAbi, ukiSaleContracts, vestingVaultAbi } from '@/lib/contracts/uki-sale';
import {
  UKI_PRESALE_START_ISO,
  UKI_PRESALE_START_LABEL,
  UKI_PRESALE_CHAIN_ID,
  UKI_PRESALE_CHAIN_LABEL,
} from '@/components/landing/sale-config';
import { formatPresaleDateLabel, isoFromUnixSeconds } from '@/lib/presale-display';

export const dynamic = 'force-dynamic';

function getChain(chainId: number) {
  return chainId === bscTestnet.id ? bscTestnet : bsc;
}

function asBigInt(value: unknown) {
  return typeof value === 'bigint' ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function secondsFrom(value: unknown) {
  const parsed = asBigInt(value);
  if (parsed === null) return null;

  return Number(parsed);
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
      message: 'El contrato de preventa aún no está configurado.',
    });
  }

  const chain = getChain(ukiSaleContracts.chainId);
  const presaleAddress = configuredPresale as Address;
  const client = createPublicClient({
    chain,
    transport: http(),
  });

  type PresaleReadFunctionName =
    | 'isOpen'
    | 'saleStart'
    | 'saleEnd'
    | 'ukiPerAsm'
    | 'minAsmPerPurchase'
    | 'totalUkiForSale'
    | 'totalAsmRaised'
    | 'totalUkiSold'
    | 'saleEnabled'
    | 'vestingVault';

  async function readPresale(functionName: PresaleReadFunctionName) {
    try {
      return await client.readContract({ address: presaleAddress, abi: presaleAbi, functionName });
    } catch {
      return null;
    }
  }

  const [
    isOpenValue,
    saleStartValue,
    saleEndValue,
    ukiPerAsmValue,
    minAsmPerPurchaseValue,
    totalUkiForSaleValue,
    totalAsmRaisedValue,
    totalUkiSoldValue,
    saleEnabledValue,
    vestingVaultAddress,
  ] = await Promise.all([
    readPresale('isOpen'),
    readPresale('saleStart'),
    readPresale('saleEnd'),
    readPresale('ukiPerAsm'),
    readPresale('minAsmPerPurchase'),
    readPresale('totalUkiForSale'),
    readPresale('totalAsmRaised'),
    readPresale('totalUkiSold'),
    readPresale('saleEnabled'),
    readPresale('vestingVault'),
  ]);

  const saleStart = secondsFrom(saleStartValue);
  const saleEnd = secondsFrom(saleEndValue);
  const startsAt = isoFromUnixSeconds(saleStart) ?? UKI_PRESALE_START_ISO;
  const startsAtLabel = formatPresaleDateLabel(startsAt) ?? UKI_PRESALE_START_LABEL;
  const startsAtShortLabel = formatPresaleDateLabel(startsAt, { short: true }) ?? startsAtLabel;
  const endsAt = isoFromUnixSeconds(saleEnd);
  const computedIsOpen =
    saleStart !== null && saleEnd !== null && Date.now() >= saleStart * 1000 && Date.now() <= saleEnd * 1000;

  let vestingStart: unknown = null;
  let vestingDuration: unknown = null;
  let vestingConfigFrozen: unknown = null;
  const vestingVaultAddressString = typeof vestingVaultAddress === 'string' ? vestingVaultAddress : null;

  if (vestingVaultAddressString && isAddress(vestingVaultAddressString)) {
    const vestingAddress = vestingVaultAddressString as Address;
    type VestingReadFunctionName =
      | 'presaleVestingStart'
      | 'presaleVestingDuration'
      | 'presaleVestingConfigFrozen';

    async function readVesting(functionName: VestingReadFunctionName) {
      try {
        return await client.readContract({ address: vestingAddress, abi: vestingVaultAbi, functionName });
      } catch {
        return null;
      }
    }

    [vestingStart, vestingDuration, vestingConfigFrozen] = await Promise.all([
      readVesting('presaleVestingStart'),
      readVesting('presaleVestingDuration'),
      readVesting('presaleVestingConfigFrozen'),
    ]);
  }

  const ukiPerAsm = asBigInt(ukiPerAsmValue);
  const minAsmPerPurchase = asBigInt(minAsmPerPurchaseValue);
  const totalUkiForSale = asBigInt(totalUkiForSaleValue);
  const totalAsmRaised = asBigInt(totalAsmRaisedValue);
  const totalUkiSold = asBigInt(totalUkiSoldValue);

  return NextResponse.json({
    ...baseStatus,
    startsAt,
    startsAtLabel,
    startsAtShortLabel,
    endsAt,
    endsAtLabel: formatPresaleDateLabel(endsAt),
    source: 'contract',
    isConfigured: true,
    isOpen: asBoolean(isOpenValue) ?? computedIsOpen,
    saleEnabled: asBoolean(saleEnabledValue),
    saleStart,
    saleEnd,
    vestingVaultAddress: vestingVaultAddressString,
    vesting: {
      start: secondsFrom(vestingStart),
      duration: secondsFrom(vestingDuration),
      configFrozen: asBoolean(vestingConfigFrozen),
    },
    price: {
      ukiPerAsm: ukiPerAsm?.toString() ?? null,
      ukiPerAsmFormatted: ukiPerAsm ? formatUnits(ukiPerAsm, 18) : null,
    },
    limits: {
      minAsmPerPurchase: minAsmPerPurchase?.toString() ?? null,
      hasPerPurchaseMaximum: false,
      hasWalletCap: false,
    },
    totals: {
      totalUkiForSale: totalUkiForSale?.toString() ?? null,
      totalAsmRaised: totalAsmRaised?.toString() ?? null,
      totalUkiSold: totalUkiSold?.toString() ?? null,
    },
  });
}
