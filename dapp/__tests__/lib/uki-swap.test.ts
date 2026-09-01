import type { Address } from 'viem';

import {
  BSC_MAINNET_SWAP_TOKENS,
  PANCAKE_V2_ROUTER_BY_CHAIN,
  applySlippageBps,
  buildUkiSwapConfig,
  createSwapDeadline,
  formatSwapAmount,
  routeLabel,
} from '@/lib/uki-swap';

const ASM = '0x707F0f4a39a4a26239F7D00463B15AB5656861f9' as Address;
const UKI = '0x51646bc7A6359f88A79FDC8d7ACB735f1AbF67fA' as Address;

describe('uki-swap', () => {
  it('fuerza las rutas V2 verificadas en BSC mainnet', () => {
    const config = buildUkiSwapConfig({ chainId: 56, asmAddress: ASM, ukiAddress: UKI });

    expect(config?.routerAddress).toBe(PANCAKE_V2_ROUTER_BY_CHAIN[56]);
    expect(config?.sources.map((source) => source.symbol)).toEqual(['BNB', 'USDT', 'ASM']);
    expect(config?.sources[0].path).toEqual([
      BSC_MAINNET_SWAP_TOKENS.wbnb,
      BSC_MAINNET_SWAP_TOKENS.usdt,
      ASM,
      UKI,
    ]);
    expect(config?.sources[1].path).toEqual([
      BSC_MAINNET_SWAP_TOKENS.usdt,
      ASM,
      UKI,
    ]);
    expect(config?.sources[2].path).toEqual([ASM, UKI]);
    expect(routeLabel(config!.sources[0])).toBe('BNB → USDT → ASM → UKI');
  });

  it('limita staging a la ruta de prueba ASM/UKI', () => {
    const config = buildUkiSwapConfig({ chainId: 97, asmAddress: ASM, ukiAddress: UKI });

    expect(config?.routerAddress).toBe(PANCAKE_V2_ROUTER_BY_CHAIN[97]);
    expect(config?.sources).toHaveLength(1);
    expect(config?.sources[0]).toMatchObject({ symbol: 'ASM', isNative: false });
    expect(config?.sources[0].path).toEqual([ASM, UKI]);
  });

  it('falla cerrado en redes sin configuración', () => {
    expect(buildUkiSwapConfig({ chainId: 1, asmAddress: ASM, ukiAddress: UKI })).toBeNull();
  });

  it('calcula mínimo recibido y deadline sin redondeos de coma flotante', () => {
    expect(applySlippageBps(BigInt(100_000), 50)).toBe(BigInt(99_500));
    expect(createSwapDeadline(1_000_000, 20)).toBe(BigInt(2_200));
    expect(formatSwapAmount(BigInt('44941404224589360000'))).toBe('44,941404');
  });

  it('rechaza tolerancias inválidas', () => {
    expect(() => applySlippageBps(BigInt(1), -1)).toThrow();
    expect(() => applySlippageBps(BigInt(1), 10_000)).toThrow();
  });
});
