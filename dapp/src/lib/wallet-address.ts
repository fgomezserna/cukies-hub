export function normalizeWalletAddress(walletAddress: string) {
  const trimmed = walletAddress.trim();

  if (/^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed.toLowerCase();
}
