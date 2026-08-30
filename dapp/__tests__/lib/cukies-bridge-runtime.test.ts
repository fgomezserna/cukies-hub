import { buildCukiesBridgeRuntimeConfig } from '@/lib/legacy-marketplace/bridge-runtime';

const BSC_TEST_COLLECTION = '0x1111111111111111111111111111111111111111';
const BSC_TEST_ENDPOINT = '0x2222222222222222222222222222222222222222';
const TRON_TEST_COLLECTION = 'T111111111111111111111111111111111';
const TRON_TEST_ENDPOINT = 'T222222222222222222222222222222222';

function validStageEnvironment() {
  return {
    APP_ENV: 'staging',
    NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    NEXT_PUBLIC_CUKIES_BRIDGE_MODE: 'testnet',
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID: '97',
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS: BSC_TEST_COLLECTION,
    NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS: BSC_TEST_ENDPOINT,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK: 'nile',
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL: 'https://nile.trongrid.io',
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS: TRON_TEST_COLLECTION,
    NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS: TRON_TEST_ENDPOINT,
  } as const;
}

describe('Cukies bridge runtime safety', () => {
  it('habilita exclusivamente BSC Testnet y TRON Nile en Stage', () => {
    const config = buildCukiesBridgeRuntimeConfig(validStageEnvironment());

    expect(config.issues).toEqual([]);
    expect(config.enabled).toBe(true);
    expect(config.mode).toBe('testnet');
    expect(config.bsc).toMatchObject({
      chainId: 97,
      collectionAddress: BSC_TEST_COLLECTION,
      endpointAddress: BSC_TEST_ENDPOINT,
      explorerBaseUrl: 'https://testnet.bscscan.com',
    });
    expect(config.tron).toMatchObject({
      network: 'nile',
      rpcUrl: 'https://nile.trongrid.io',
      collectionAddress: TRON_TEST_COLLECTION,
      endpointAddress: TRON_TEST_ENDPOINT,
    });
  });

  it('mantiene el bridge apagado por defecto sin heredar contratos mainnet', () => {
    const config = buildCukiesBridgeRuntimeConfig({
      APP_ENV: 'staging',
      NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    });

    expect(config.mode).toBe('disabled');
    expect(config.enabled).toBe(false);
    expect(config.issues).toEqual([]);
    expect(config.bsc.collectionAddress).toBeNull();
    expect(config.bsc.endpointAddress).toBeNull();
    expect(config.tron.collectionAddress).toBeNull();
    expect(config.tron.endpointAddress).toBeNull();
  });

  it('rechaza cualquier intento de habilitar un modo live o mainnet', () => {
    const config = buildCukiesBridgeRuntimeConfig({
      ...validStageEnvironment(),
      NEXT_PUBLIC_CUKIES_BRIDGE_MODE: 'live',
    });

    expect(config.mode).toBe('disabled');
    expect(config.enabled).toBe(false);
    expect(config.issues).toContain(
      'NEXT_PUBLIC_CUKIES_BRIDGE_MODE debe ser disabled o testnet',
    );
  });

  it('falla cerrado si Stage intenta apuntar a mainnet', () => {
    const config = buildCukiesBridgeRuntimeConfig({
      ...validStageEnvironment(),
      NEXT_PUBLIC_CUKIES_BRIDGE_BSC_CHAIN_ID: '56',
      NEXT_PUBLIC_CUKIES_BRIDGE_BSC_COLLECTION_ADDRESS:
        '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
      NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS:
        '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
      NEXT_PUBLIC_CUKIES_BRIDGE_TRON_NETWORK: 'mainnet',
      NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL: 'https://api.trongrid.io',
      NEXT_PUBLIC_CUKIES_BRIDGE_TRON_COLLECTION_ADDRESS:
        'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
      NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS:
        'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
    });

    expect(config.enabled).toBe(false);
    expect(config.issues).toEqual(expect.arrayContaining([
      'testnet requiere BSC chain 97',
      'testnet requiere TRON nile',
      'NEXT_PUBLIC_CUKIES_BRIDGE_TRON_RPC_URL debe ser https://nile.trongrid.io',
      'Stage no puede usar la coleccion Cukies de BSC mainnet',
      'Stage no puede usar el bridge Cukies de BSC mainnet',
      'Stage no puede usar la coleccion Cukies de TRON mainnet',
      'Stage no puede usar el bridge Cukies de TRON mainnet',
    ]));
  });

  it('rechaza la fixture que solo emite eventos como endpoint operativo', () => {
    const config = buildCukiesBridgeRuntimeConfig({
      ...validStageEnvironment(),
      NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS:
        '0x6E29448282bCc1c568Ec9450Bef50a01d67845C2',
    });

    expect(config.enabled).toBe(false);
    expect(config.issues).toContain(
      'La fixture de eventos BSC Testnet no custodia NFTs y no es un endpoint bridge',
    );
  });

  it('no acepta endpoints y colecciones compartiendo address', () => {
    const config = buildCukiesBridgeRuntimeConfig({
      ...validStageEnvironment(),
      NEXT_PUBLIC_CUKIES_BRIDGE_BSC_ENDPOINT_ADDRESS: BSC_TEST_COLLECTION,
      NEXT_PUBLIC_CUKIES_BRIDGE_TRON_ENDPOINT_ADDRESS: TRON_TEST_COLLECTION,
    });

    expect(config.enabled).toBe(false);
    expect(config.issues).toEqual(expect.arrayContaining([
      'La coleccion y el endpoint BSC deben usar contratos distintos',
      'La coleccion y el endpoint TRON deben usar contratos distintos',
    ]));
  });
});
