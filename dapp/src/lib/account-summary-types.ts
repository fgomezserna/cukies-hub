export type AccountSummary = {
  walletNormalized: string;
  chainId: 56 | 97 | null;
  network: {
    chainId: 56 | 97 | null;
    label: string;
  };
  uki: {
    balance: string;
    balanceRaw: string;
    decimals: number;
    symbol: 'UKI';
    source: 'wallet';
  } | null;
  credits: {
    availableCredits: number | null;
    reservedCredits: number | null;
    spentCredits: number | null;
    blocked: boolean;
    materialization: 'ready' | 'blocked' | 'unknown' | 'too_large' | 'stale';
    source: 'account';
  } | null;
  cukies: {
    total: number;
    inWallet: number;
    available: number;
    onSale: number;
    inPool: number;
    inCukieMaster: number;
    otherInUse: number;
    coverage: 'complete';
    source: 'collection';
  } | null;
};
