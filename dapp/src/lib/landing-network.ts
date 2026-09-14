export type LandingNetworkEnvironment = Partial<Record<
  | 'APP_ENV'
  | 'NEXT_PUBLIC_APP_ENV'
  | 'NEXT_PUBLIC_UKI_CHAIN_ID'
  | 'NEXT_PUBLIC_ASM_TOKEN_ADDRESS'
  | 'NEXT_PUBLIC_UKI_TOKEN_ADDRESS'
  | 'NEXT_PUBLIC_UKI_STAKING_ADDRESS'
  | 'NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS'
  | 'NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS'
  | 'NEXT_PUBLIC_UKI_LIQUIDITY_UNLOCK_LABEL'
  | 'NEXT_PUBLIC_BSCSCAN_BASE_URL'
  | 'NEXT_PUBLIC_UKI_SWAP_URL',
  string | undefined
>>;

export type LandingNetworkConfig = Readonly<{
  appEnv: 'staging' | 'production' | 'unknown';
  chainId: number | null;
  networkLabel: string;
  explorerBaseUrl: string | null;
  asmTokenAddress: string | null;
  ukiTokenAddress: string | null;
  stakingAddress: string | null;
  liquidityPairAddress: string | null;
  liquidityLockerAddress: string | null;
  liquidityUnlockLabel: string | null;
  swapUrl: string | null;
  issues: readonly string[];
}>;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BSC_MAINNET_EXPLORER = 'https://bscscan.com';
const BSC_TESTNET_EXPLORER = 'https://testnet.bscscan.com';
const PANCAKESWAP_ORIGIN = 'https://pancakeswap.finance';

function optionalValue(environment: LandingNetworkEnvironment, key: keyof LandingNetworkEnvironment) {
  return environment[key]?.trim() || null;
}

function optionalAddress(
  environment: LandingNetworkEnvironment,
  key: keyof LandingNetworkEnvironment,
  issues: string[],
) {
  const value = optionalValue(environment, key);
  if (!value) return null;
  if (!ADDRESS_PATTERN.test(value)) {
    issues.push(`${key} is not a valid EVM address`);
    return null;
  }
  return value;
}

function normalizeBaseUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validateSwapUrl(
  value: string | null,
  expectedChain: 'bsc' | 'bscTestnet' | null,
  expectedInputAddress: string | null,
  expectedOutputAddress: string | null,
  issues: string[],
) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const chain = url.searchParams.get('chain');
    const inputAddress = url.searchParams.get('inputCurrency');
    const outputAddress = url.searchParams.get('outputCurrency');
    if (
      url.protocol !== 'https:'
      || url.origin !== PANCAKESWAP_ORIGIN
      || url.pathname !== '/swap'
      || url.username
      || url.password
      || url.hash
      || chain !== expectedChain
    ) {
      issues.push('NEXT_PUBLIC_UKI_SWAP_URL does not match the configured BSC network');
      return null;
    }
    if (
      !expectedInputAddress
      || !expectedOutputAddress
      || inputAddress?.toLowerCase() !== expectedInputAddress.toLowerCase()
      || outputAddress?.toLowerCase() !== expectedOutputAddress.toLowerCase()
    ) {
      issues.push('NEXT_PUBLIC_UKI_SWAP_URL does not match the configured ASM/UKI tokens');
      return null;
    }
    return url.toString();
  } catch {
    issues.push('NEXT_PUBLIC_UKI_SWAP_URL is not a valid URL');
    return null;
  }
}

export function buildLandingNetworkConfig(
  environment: LandingNetworkEnvironment,
): LandingNetworkConfig {
  const issues: string[] = [];
  const rawAppEnv = optionalValue(environment, 'NEXT_PUBLIC_APP_ENV')
    ?? optionalValue(environment, 'APP_ENV');
  const appEnv = rawAppEnv === 'staging' || rawAppEnv === 'production'
    ? rawAppEnv
    : 'unknown';
  const rawChainId = optionalValue(environment, 'NEXT_PUBLIC_UKI_CHAIN_ID');
  const chainId = rawChainId && /^\d+$/.test(rawChainId) ? Number(rawChainId) : null;
  const expectedChainId = appEnv === 'staging' ? 97 : appEnv === 'production' ? 56 : null;

  if (expectedChainId !== null && chainId !== expectedChainId) {
    issues.push(`${appEnv} requires BSC chain ${expectedChainId}`);
  }
  if (chainId !== 56 && chainId !== 97) {
    issues.push('NEXT_PUBLIC_UKI_CHAIN_ID must be 56 or 97');
  }

  const expectedExplorer = chainId === 97
    ? BSC_TESTNET_EXPLORER
    : chainId === 56
      ? BSC_MAINNET_EXPLORER
      : null;
  const configuredExplorer = normalizeBaseUrl(
    optionalValue(environment, 'NEXT_PUBLIC_BSCSCAN_BASE_URL'),
  );
  if (configuredExplorer !== expectedExplorer) {
    issues.push(`NEXT_PUBLIC_BSCSCAN_BASE_URL must match BSC chain ${chainId ?? 'unknown'}`);
  }

  const networkIsConsistent = expectedChainId !== null && chainId === expectedChainId;
  const explorerBaseUrl = networkIsConsistent && configuredExplorer === expectedExplorer
    ? configuredExplorer
    : null;

  const asmTokenAddress = optionalAddress(environment, 'NEXT_PUBLIC_ASM_TOKEN_ADDRESS', issues);
  const ukiTokenAddress = optionalAddress(environment, 'NEXT_PUBLIC_UKI_TOKEN_ADDRESS', issues);
  const stakingAddress = optionalAddress(environment, 'NEXT_PUBLIC_UKI_STAKING_ADDRESS', issues);
  const liquidityPairAddress = optionalAddress(
    environment,
    'NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS',
    issues,
  );
  const liquidityLockerAddress = optionalAddress(
    environment,
    'NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS',
    issues,
  );
  const liquidityUnlockLabel = optionalValue(environment, 'NEXT_PUBLIC_UKI_LIQUIDITY_UNLOCK_LABEL');
  const expectedSwapChain = appEnv === 'staging'
    ? 'bscTestnet'
    : appEnv === 'production'
      ? 'bsc'
      : chainId === 97
        ? 'bscTestnet'
        : chainId === 56
          ? 'bsc'
          : null;
  const configuredSwapValue = optionalValue(environment, 'NEXT_PUBLIC_UKI_SWAP_URL');
  const configuredSwapUrl = validateSwapUrl(
    configuredSwapValue,
    expectedSwapChain,
    asmTokenAddress,
    ukiTokenAddress,
    issues,
  );
  if (configuredSwapValue && !liquidityPairAddress) {
    issues.push('NEXT_PUBLIC_UKI_SWAP_URL requires NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS');
  }

  const generatedMainnetSwapUrl = chainId === 56
    && asmTokenAddress
    && ukiTokenAddress
    && liquidityPairAddress
    ? `${PANCAKESWAP_ORIGIN}/swap?chain=bsc&inputCurrency=${asmTokenAddress}&outputCurrency=${ukiTokenAddress}`
    : null;
  const swapUrl = networkIsConsistent && liquidityPairAddress
    ? configuredSwapValue
      ? configuredSwapUrl
      : generatedMainnetSwapUrl
    : null;

  return Object.freeze({
    appEnv,
    chainId,
    networkLabel: chainId === 97 ? 'BSC Testnet' : chainId === 56 ? 'BNB Smart Chain' : 'Red no configurada',
    explorerBaseUrl,
    asmTokenAddress,
    ukiTokenAddress,
    stakingAddress,
    liquidityPairAddress,
    liquidityLockerAddress,
    liquidityUnlockLabel,
    swapUrl,
    issues: Object.freeze(issues),
  });
}

export function getLandingExplorerUrl(
  config: LandingNetworkConfig,
  kind: 'address' | 'token',
  address: string | null,
) {
  if (!config.explorerBaseUrl || !address || !ADDRESS_PATTERN.test(address)) return null;
  return `${config.explorerBaseUrl}/${kind}/${address}`;
}

export const landingNetworkConfig = buildLandingNetworkConfig({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_UKI_CHAIN_ID: process.env.NEXT_PUBLIC_UKI_CHAIN_ID,
  NEXT_PUBLIC_ASM_TOKEN_ADDRESS: process.env.NEXT_PUBLIC_ASM_TOKEN_ADDRESS,
  NEXT_PUBLIC_UKI_TOKEN_ADDRESS: process.env.NEXT_PUBLIC_UKI_TOKEN_ADDRESS,
  NEXT_PUBLIC_UKI_STAKING_ADDRESS: process.env.NEXT_PUBLIC_UKI_STAKING_ADDRESS,
  NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS: process.env.NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS,
  NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS: process.env.NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS,
  NEXT_PUBLIC_UKI_LIQUIDITY_UNLOCK_LABEL: process.env.NEXT_PUBLIC_UKI_LIQUIDITY_UNLOCK_LABEL,
  NEXT_PUBLIC_BSCSCAN_BASE_URL: process.env.NEXT_PUBLIC_BSCSCAN_BASE_URL,
  NEXT_PUBLIC_UKI_SWAP_URL: process.env.NEXT_PUBLIC_UKI_SWAP_URL,
});
