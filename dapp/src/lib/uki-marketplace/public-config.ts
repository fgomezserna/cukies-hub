import { isAddress, type Address } from 'viem';

export type UkiMarketplacePublicConfig = {
  ready: boolean;
  checkoutReady: boolean;
  ukiPaymentReady: boolean;
  asmPaymentReady: boolean;
  bnbPaymentReady: boolean;
  usdtPaymentReady: boolean;
  usdcPaymentReady: boolean;
  chainId: 56 | 97 | null;
  marketplaceAddress: Address | null;
  collectionAddresses: Address[];
  ukiTokenAddress: Address | null;
  asmTokenAddress: Address | null;
  routerAddress: Address | null;
  wrappedNativeAddress: Address | null;
  usdtTokenAddress: Address | null;
  usdcTokenAddress: Address | null;
  bnbPaymentPath: Address[];
  asmPaymentPath: Address[];
  usdtPaymentPath: Address[];
  usdcPaymentPath: Address[];
  explorerBaseUrl: string | null;
  issues: string[];
  checkoutIssues: string[];
};

type PublicConfigInput = {
  appEnvironment?: string;
  chainId?: string;
  marketplaceAddress?: string;
  collectionAddress?: string;
  collectionAddresses?: string;
  ukiTokenAddress?: string;
  asmTokenAddress?: string;
  routerAddress?: string;
  wrappedNativeAddress?: string;
  usdtTokenAddress?: string;
  usdcTokenAddress?: string;
  bnbPaymentPath?: string;
  asmPaymentPath?: string;
  usdtPaymentPath?: string;
  usdcPaymentPath?: string;
  explorerBaseUrl?: string;
};

function configuredAddress(value: string | undefined): Address | null {
  const candidate = value?.trim();
  return candidate && isAddress(candidate, { strict: false }) && !/^0x0{40}$/i.test(candidate)
    ? candidate as Address
    : null;
}

function configuredCollections(primary: string | undefined, multiple: string | undefined) {
  const raw = [
    ...(multiple?.trim() ? multiple.split(',') : []),
    ...(primary?.trim() ? [primary] : []),
  ].map((candidate) => candidate.trim()).filter(Boolean);
  const resolved = raw.map(configuredAddress);
  return {
    invalid: resolved.some((candidate) => candidate === null),
    addresses: [...new Map(
      resolved
        .filter((candidate): candidate is Address => candidate !== null)
        .map((candidate) => [candidate.toLowerCase(), candidate]),
    ).values()],
  };
}

function configuredPath(value: string | undefined) {
  const raw = value?.split(',').map((candidate) => candidate.trim()).filter(Boolean) ?? [];
  const addresses = raw.map(configuredAddress);
  return {
    invalid: raw.length < 2
      || raw.length > 5
      || addresses.some((candidate) => candidate === null),
    addresses: addresses.filter((candidate): candidate is Address => candidate !== null),
  };
}

function sameAddress(left: Address | null, right: Address | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function resolveUkiMarketplacePublicConfig(
  input: PublicConfigInput,
): UkiMarketplacePublicConfig {
  const issues: string[] = [];
  const parsedChainId = Number(input.chainId);
  const chainId = parsedChainId === 56 || parsedChainId === 97 ? parsedChainId : null;
  const marketplaceAddress = configuredAddress(input.marketplaceAddress);
  const collections = configuredCollections(input.collectionAddress, input.collectionAddresses);
  const ukiTokenAddress = configuredAddress(input.ukiTokenAddress);
  const asmTokenAddress = configuredAddress(input.asmTokenAddress);
  const routerAddress = configuredAddress(input.routerAddress);
  const wrappedNativeAddress = configuredAddress(input.wrappedNativeAddress);
  const usdtTokenAddress = configuredAddress(input.usdtTokenAddress);
  const usdcTokenAddress = configuredAddress(input.usdcTokenAddress);
  const bnbPaymentPath = configuredPath(input.bnbPaymentPath);
  const asmPaymentPath = configuredPath(input.asmPaymentPath);
  const usdtPaymentPath = configuredPath(input.usdtPaymentPath);
  const usdcPaymentPath = configuredPath(input.usdcPaymentPath);
  const appEnvironment = input.appEnvironment?.trim();

  if (appEnvironment === 'staging' && chainId !== 97) {
    issues.push('Stage requiere BSC Testnet chainId 97.');
  } else if (appEnvironment === 'production' && chainId !== 56) {
    issues.push('Production requiere BSC chainId 56.');
  } else if (appEnvironment !== 'staging' && appEnvironment !== 'production') {
    issues.push('El entorno público del marketplace UKI no está identificado.');
  }
  if (!chainId) issues.push('La chain pública del marketplace UKI no es válida.');
  if (!marketplaceAddress) issues.push('La address pública del marketplace UKI no es válida.');
  if (collections.invalid || collections.addresses.length === 0) {
    issues.push('La lista pública de colecciones UKI no es válida.');
  }

  const coreCheckoutIssues: string[] = [];
  if (!ukiTokenAddress) coreCheckoutIssues.push('La address pública de UKI no es válida.');
  if (!routerAddress) coreCheckoutIssues.push('La address pública del router no es válida.');
  if (!wrappedNativeAddress) coreCheckoutIssues.push('La address pública de WBNB no es válida.');
  if (sameAddress(ukiTokenAddress, wrappedNativeAddress)) {
    coreCheckoutIssues.push('UKI y WBNB deben ser contratos distintos.');
  }

  const bnbCheckoutIssues: string[] = [];
  if (bnbPaymentPath.invalid) {
    bnbCheckoutIssues.push('La ruta pública BNB → UKI no es válida.');
  } else if (
    !sameAddress(bnbPaymentPath.addresses[0] ?? null, wrappedNativeAddress)
    || !sameAddress(bnbPaymentPath.addresses.at(-1) ?? null, ukiTokenAddress)
  ) {
    bnbCheckoutIssues.push('La ruta pública BNB → UKI no coincide con WBNB y UKI.');
  }

  const usdtCheckoutIssues: string[] = [];
  if (!usdtTokenAddress) usdtCheckoutIssues.push('La address pública de USDT no es válida.');
  if (usdtPaymentPath.invalid) {
    usdtCheckoutIssues.push('La ruta pública USDT → UKI no es válida.');
  } else if (
    !sameAddress(usdtPaymentPath.addresses[0] ?? null, usdtTokenAddress)
    || !sameAddress(usdtPaymentPath.addresses.at(-1) ?? null, ukiTokenAddress)
  ) {
    usdtCheckoutIssues.push('La ruta pública USDT → UKI no coincide con USDT y UKI.');
  }
  if (
    sameAddress(ukiTokenAddress, usdtTokenAddress)
    || sameAddress(usdtTokenAddress, wrappedNativeAddress)
  ) {
    usdtCheckoutIssues.push('USDT debe ser un contrato distinto de UKI y WBNB.');
  }

  const asmCheckoutIssues: string[] = [];
  if (!asmTokenAddress) asmCheckoutIssues.push('La address pública de ASM no es válida.');
  if (asmPaymentPath.invalid) {
    asmCheckoutIssues.push('La ruta pública ASM → UKI no es válida.');
  } else if (
    !sameAddress(asmPaymentPath.addresses[0] ?? null, asmTokenAddress)
    || !sameAddress(asmPaymentPath.addresses.at(-1) ?? null, ukiTokenAddress)
  ) {
    asmCheckoutIssues.push('La ruta pública ASM → UKI no coincide con ASM y UKI.');
  }
  if (
    sameAddress(asmTokenAddress, ukiTokenAddress)
    || sameAddress(asmTokenAddress, wrappedNativeAddress)
    || sameAddress(asmTokenAddress, usdtTokenAddress)
    || sameAddress(asmTokenAddress, usdcTokenAddress)
  ) {
    asmCheckoutIssues.push('ASM debe ser un contrato distinto de las demás monedas.');
  }

  const usdcCheckoutIssues: string[] = [];
  if (!usdcTokenAddress) usdcCheckoutIssues.push('La address pública de USDC no es válida.');
  if (usdcPaymentPath.invalid) {
    usdcCheckoutIssues.push('La ruta pública USDC → UKI no es válida.');
  } else if (
    !sameAddress(usdcPaymentPath.addresses[0] ?? null, usdcTokenAddress)
    || !sameAddress(usdcPaymentPath.addresses.at(-1) ?? null, ukiTokenAddress)
  ) {
    usdcCheckoutIssues.push('La ruta pública USDC → UKI no coincide con USDC y UKI.');
  }
  if (
    sameAddress(usdcTokenAddress, ukiTokenAddress)
    || sameAddress(usdcTokenAddress, wrappedNativeAddress)
    || sameAddress(usdcTokenAddress, usdtTokenAddress)
    || sameAddress(usdcTokenAddress, asmTokenAddress)
  ) {
    usdcCheckoutIssues.push('USDC debe ser un contrato distinto de las demás monedas.');
  }

  const checkoutReady = issues.length === 0 && coreCheckoutIssues.length === 0;
  const checkoutIssues = [
    ...coreCheckoutIssues,
    ...bnbCheckoutIssues,
    ...asmCheckoutIssues,
    ...usdtCheckoutIssues,
    ...usdcCheckoutIssues,
  ];

  const explorerBaseUrl = input.explorerBaseUrl?.trim().replace(/\/$/, '')
    || (chainId === 97
      ? 'https://testnet.bscscan.com'
      : chainId === 56
        ? 'https://bscscan.com'
        : null);

  return {
    ready: issues.length === 0,
    checkoutReady,
    ukiPaymentReady: checkoutReady,
    asmPaymentReady: checkoutReady && asmCheckoutIssues.length === 0,
    bnbPaymentReady: checkoutReady && bnbCheckoutIssues.length === 0,
    usdtPaymentReady: checkoutReady && usdtCheckoutIssues.length === 0,
    usdcPaymentReady: checkoutReady && usdcCheckoutIssues.length === 0,
    chainId,
    marketplaceAddress,
    collectionAddresses: collections.addresses,
    ukiTokenAddress,
    asmTokenAddress,
    routerAddress,
    wrappedNativeAddress,
    usdtTokenAddress,
    usdcTokenAddress,
    bnbPaymentPath: bnbPaymentPath.addresses,
    asmPaymentPath: asmPaymentPath.addresses,
    usdtPaymentPath: usdtPaymentPath.addresses,
    usdcPaymentPath: usdcPaymentPath.addresses,
    explorerBaseUrl,
    issues,
    checkoutIssues,
  };
}

export const ukiMarketplacePublicConfig = resolveUkiMarketplacePublicConfig({
  appEnvironment: process.env.NEXT_PUBLIC_APP_ENV,
  chainId: process.env.NEXT_PUBLIC_UKI_CHAIN_ID,
  marketplaceAddress: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS,
  collectionAddress: process.env.NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESS,
  collectionAddresses: process.env.NEXT_PUBLIC_CUKIES_NFT_COLLECTION_ADDRESSES,
  ukiTokenAddress: process.env.NEXT_PUBLIC_UKI_TOKEN_ADDRESS,
  asmTokenAddress: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_ASM_ADDRESS,
  routerAddress: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_ROUTER_ADDRESS,
  wrappedNativeAddress: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_WBNB_ADDRESS,
  usdtTokenAddress: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_USDT_ADDRESS,
  usdcTokenAddress: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_USDC_ADDRESS,
  bnbPaymentPath: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_BNB_PATH,
  asmPaymentPath: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_ASM_PATH,
  usdtPaymentPath: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_USDT_PATH,
  usdcPaymentPath: process.env.NEXT_PUBLIC_UKI_MARKETPLACE_USDC_PATH,
  explorerBaseUrl: process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL,
});
