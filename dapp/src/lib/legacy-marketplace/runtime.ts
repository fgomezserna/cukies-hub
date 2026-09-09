export type LegacyMarketplaceEnvironment = Partial<Record<
  'APP_ENV' | 'NEXT_PUBLIC_APP_ENV',
  string | undefined
>>;

export type LegacyMarketplaceRuntime = Readonly<{
  appEnv: 'staging' | 'production' | 'unknown';
  legacyMainnetEnabled: boolean;
  legacyMarketplaceActionsEnabled: boolean;
  bscChainId: 56 | null;
  bscExplorerBaseUrl: string | null;
  tronExplorerBaseUrl: string | null;
  reason: string | null;
}>;

function environmentValue(
  environment: LegacyMarketplaceEnvironment,
  key: keyof LegacyMarketplaceEnvironment,
) {
  return environment[key]?.trim().toLowerCase() || null;
}

export function buildLegacyMarketplaceRuntime(
  environment: LegacyMarketplaceEnvironment,
): LegacyMarketplaceRuntime {
  const rawAppEnv = environmentValue(environment, 'NEXT_PUBLIC_APP_ENV')
    ?? environmentValue(environment, 'APP_ENV');
  const appEnv = rawAppEnv === 'staging' || rawAppEnv === 'production'
    ? rawAppEnv
    : 'unknown';
  const legacyMainnetEnabled = appEnv === 'production';
  const legacyMarketplaceActionsEnabled = appEnv === 'staging' || appEnv === 'production';

  return Object.freeze({
    appEnv,
    legacyMainnetEnabled,
    legacyMarketplaceActionsEnabled,
    bscChainId: legacyMarketplaceActionsEnabled ? 56 : null,
    bscExplorerBaseUrl: legacyMarketplaceActionsEnabled ? 'https://bscscan.com' : null,
    tronExplorerBaseUrl: legacyMarketplaceActionsEnabled ? 'https://tronscan.org' : null,
    reason: legacyMarketplaceActionsEnabled
      ? null
      : 'El marketplace legacy permanece desactivado hasta identificar el entorno.',
  });
}

export const legacyMarketplaceRuntime = buildLegacyMarketplaceRuntime({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  APP_ENV: process.env.APP_ENV,
});

export function getLegacyPointExplorerUrl(
  runtime: LegacyMarketplaceRuntime,
  network: string | null,
  chainId: number | null,
  txId: string | null,
) {
  if (!txId) return null;
  if (network === 'BSC' && chainId === 97) {
    return `https://testnet.bscscan.com/tx/${txId}`;
  }
  if (
    network === 'BSC'
    && runtime.legacyMainnetEnabled
    && (chainId === 56 || chainId === null)
  ) {
    return `https://bscscan.com/tx/${txId}`;
  }
  if (network === 'TRON' && runtime.legacyMainnetEnabled) {
    return `https://tronscan.org/#/transaction/${txId}`;
  }
  return null;
}
