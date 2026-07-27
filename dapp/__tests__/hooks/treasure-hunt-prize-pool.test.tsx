import { act, renderHook, waitFor } from '@testing-library/react';

import { useTreasureHuntPrizePool } from '@/hooks/use-treasure-hunt-prize-pool';

const CACHE_KEY = 'cukies:treasure-hunt:prize-pool:v1';

function statusResponse() {
  return new Response(JSON.stringify({
    price: { ukiPerAsmFormatted: '888' },
    totals: { totalAsmRaisedFormatted: '3822' },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useTreasureHuntPrizePool', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('conserva el último premio válido si falla una actualización posterior', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(statusResponse())
      .mockRejectedValueOnce(new Error('RPC temporalmente no disponible'));

    const { result } = renderHook(() => useTreasureHuntPrizePool());
    await waitFor(() => expect(result.current.value).toBe(71_484));

    await act(async () => {
      await result.current.reload();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.value).toBe(71_484);
    expect(result.current.error).toBe('RPC temporalmente no disponible');
  });

  it('recupera el valor cacheado al volver desde un navegador wallet', async () => {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({
      poolBps: 2_500,
      value: 71_484,
    }));
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Sin red'));

    const { result } = renderHook(() => useTreasureHuntPrizePool());

    await waitFor(() => expect(result.current.value).toBe(71_484));
    expect(result.current.isLoading).toBe(false);
  });
});
