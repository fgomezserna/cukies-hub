import {
  clearPendingNftVaultOperation,
  loadPendingNftVaultOperations,
  pendingNftVaultStorageKey,
  projectionMatchesPendingOperation,
  savePendingNftVaultOperation,
  type NftVaultPendingContext,
  type NftVaultPendingOperation,
} from './pending-operations';

const context: NftVaultPendingContext = {
  chainId: 97,
  walletAddress: '0x1111111111111111111111111111111111111111',
  vaultAddress: '0x2222222222222222222222222222222222222222',
};

function operation(overrides: Partial<NftVaultPendingOperation> = {}): NftVaultPendingOperation {
  return {
    version: 1,
    ...context,
    assetId: '97:0x3333333333333333333333333333333333333333:1',
    collectionAddress: '0x3333333333333333333333333333333333333333',
    tokenId: '1',
    action: 'deposit',
    phase: 'awaiting_receipt',
    txHash: `0x${'a'.repeat(64)}`,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('pending NFT vault operations', () => {
  beforeEach(() => localStorage.clear());

  it('aísla y reemplaza una operación por chain, wallet, vault y asset', () => {
    savePendingNftVaultOperation(localStorage, operation());
    savePendingNftVaultOperation(localStorage, operation({ phase: 'syncing_projection', updatedAt: 2 }));
    savePendingNftVaultOperation(localStorage, operation({ assetId: 'asset-2', tokenId: '2' }));

    expect(loadPendingNftVaultOperations(localStorage, context)).toEqual([
      expect.objectContaining({ assetId: operation().assetId, phase: 'syncing_projection', updatedAt: 2 }),
      expect.objectContaining({ assetId: 'asset-2' }),
    ]);
    expect(loadPendingNftVaultOperations(localStorage, { ...context, chainId: 56 })).toEqual([]);
  });

  it('descarta datos corruptos o pertenecientes a otra identidad', () => {
    localStorage.setItem(pendingNftVaultStorageKey(context), JSON.stringify([
      operation(),
      operation({ walletAddress: '0x4444444444444444444444444444444444444444' }),
      { nope: true },
    ]));

    expect(loadPendingNftVaultOperations(localStorage, context)).toEqual([operation()]);
    expect(JSON.parse(localStorage.getItem(pendingNftVaultStorageKey(context)) ?? '[]')).toHaveLength(1);
  });

  it('limpia solo el asset indicado', () => {
    savePendingNftVaultOperation(localStorage, operation());
    savePendingNftVaultOperation(localStorage, operation({ assetId: 'asset-2', tokenId: '2' }));

    clearPendingNftVaultOperation(localStorage, context, operation().assetId);

    expect(loadPendingNftVaultOperations(localStorage, context)).toEqual([
      expect.objectContaining({ assetId: 'asset-2' }),
    ]);
  });

  it('conserva solicitudes de salida del vault de préstamos', () => {
    const requestExit = operation({ action: 'request_exit' });
    savePendingNftVaultOperation(localStorage, requestExit);

    expect(loadPendingNftVaultOperations(localStorage, context)).toEqual([requestExit]);
  });

  it('solo considera liquidada la proyección cuando la custodia esperada ya aparece', () => {
    const deposit = operation({ phase: 'syncing_projection' });
    const withdrawal = operation({ action: 'withdraw', phase: 'syncing_projection' });

    expect(projectionMatchesPendingOperation(deposit, { assetId: deposit.assetId, custody: 'wallet' })).toBe(false);
    expect(projectionMatchesPendingOperation(deposit, { assetId: deposit.assetId, custody: 'cukie_master_nft_vault' })).toBe(true);
    expect(projectionMatchesPendingOperation(withdrawal, { assetId: withdrawal.assetId, custody: 'wallet' })).toBe(true);
  });

  it('no propaga errores si el navegador bloquea el almacenamiento local', () => {
    const deniedStorage = {
      getItem: jest.fn(() => { throw new DOMException('Denied', 'SecurityError'); }),
      setItem: jest.fn(() => { throw new DOMException('Full', 'QuotaExceededError'); }),
      removeItem: jest.fn(() => { throw new DOMException('Denied', 'SecurityError'); }),
    };

    expect(loadPendingNftVaultOperations(deniedStorage, context)).toEqual([]);
    expect(savePendingNftVaultOperation(deniedStorage, operation())).toBe(false);
    expect(clearPendingNftVaultOperation(deniedStorage, context, operation().assetId)).toBe(false);
  });
});
