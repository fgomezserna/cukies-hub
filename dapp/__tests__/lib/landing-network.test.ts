import {
  buildLandingNetworkConfig,
  getLandingExplorerUrl,
} from '@/lib/landing-network';

const TESTNET_UKI = '0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c';
const TESTNET_ASM = '0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C';
const TESTNET_STAKING = '0x551bd243eE4C5d68BA53A27fd9aE09339d5C2205';

describe('landing network safety', () => {
  it('emula app 28 con contratos y explorer exclusivos de BSC Testnet', () => {
    const config = buildLandingNetworkConfig({
      APP_ENV: 'staging',
      NEXT_PUBLIC_UKI_CHAIN_ID: '97',
      NEXT_PUBLIC_ASM_TOKEN_ADDRESS: TESTNET_ASM,
      NEXT_PUBLIC_UKI_TOKEN_ADDRESS: TESTNET_UKI,
      NEXT_PUBLIC_UKI_STAKING_ADDRESS: TESTNET_STAKING,
      NEXT_PUBLIC_BSCSCAN_BASE_URL: 'https://testnet.bscscan.com',
    });

    expect(config.issues).toEqual([]);
    expect(config.chainId).toBe(97);
    expect(config.networkLabel).toBe('BSC Testnet');
    expect(config.swapUrl).toBeNull();
    expect(config.liquidityPairAddress).toBeNull();
    expect(config.liquidityLockerAddress).toBeNull();
    expect(getLandingExplorerUrl(config, 'token', config.ukiTokenAddress)).toBe(
      `https://testnet.bscscan.com/token/${TESTNET_UKI}`,
    );
    expect(getLandingExplorerUrl(config, 'address', config.stakingAddress)).toBe(
      `https://testnet.bscscan.com/address/${TESTNET_STAKING}`,
    );
  });

  it('falla cerrado si staging recibe chain 56, BscScan mainnet o chain=bsc', () => {
    const config = buildLandingNetworkConfig({
      APP_ENV: 'staging',
      NEXT_PUBLIC_UKI_CHAIN_ID: '56',
      NEXT_PUBLIC_ASM_TOKEN_ADDRESS: '0x707F0f4a39a4a26239F7D00463B15AB5656861f9',
      NEXT_PUBLIC_UKI_TOKEN_ADDRESS: '0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA',
      NEXT_PUBLIC_BSCSCAN_BASE_URL: 'https://bscscan.com',
      NEXT_PUBLIC_UKI_SWAP_URL: 'https://pancakeswap.finance/swap?chain=bsc',
    });

    expect(config.issues).toEqual(expect.arrayContaining([
      'staging requires BSC chain 97',
      'NEXT_PUBLIC_UKI_SWAP_URL does not match the configured BSC network',
    ]));
    expect(config.explorerBaseUrl).toBeNull();
    expect(config.swapUrl).toBeNull();
    expect(getLandingExplorerUrl(config, 'token', config.ukiTokenAddress)).toBeNull();
  });

  it('mantiene la configuración de producción separada y explícita', () => {
    const config = buildLandingNetworkConfig({
      APP_ENV: 'production',
      NEXT_PUBLIC_UKI_CHAIN_ID: '56',
      NEXT_PUBLIC_ASM_TOKEN_ADDRESS: '0x707F0f4a39a4a26239F7D00463B15AB5656861f9',
      NEXT_PUBLIC_UKI_TOKEN_ADDRESS: '0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA',
      NEXT_PUBLIC_UKI_LIQUIDITY_PAIR_ADDRESS: '0x40b315f31421b5D31DE018055Cb30f78265024Be',
      NEXT_PUBLIC_UKI_LIQUIDITY_LOCKER_ADDRESS: '0xb3E43944DF782EEeD9A99f0CFA4301c72b9629E6',
      NEXT_PUBLIC_BSCSCAN_BASE_URL: 'https://bscscan.com',
    });

    expect(config.issues).toEqual([]);
    expect(config.swapUrl).toContain('chain=bsc');
    expect(config.swapUrl).not.toContain('bscTestnet');
  });

  it('no habilita enlaces on-chain sin una identidad pública de entorno', () => {
    const config = buildLandingNetworkConfig({
      NEXT_PUBLIC_UKI_CHAIN_ID: '56',
      NEXT_PUBLIC_ASM_TOKEN_ADDRESS: '0x707F0f4a39a4a26239F7D00463B15AB5656861f9',
      NEXT_PUBLIC_UKI_TOKEN_ADDRESS: '0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA',
      NEXT_PUBLIC_BSCSCAN_BASE_URL: 'https://bscscan.com',
    });

    expect(config.appEnv).toBe('unknown');
    expect(config.explorerBaseUrl).toBeNull();
    expect(config.swapUrl).toBeNull();
  });
});
