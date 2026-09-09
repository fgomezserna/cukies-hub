jest.mock('@/lib/auth-utils', () => ({
  verifyWalletAuth: jest.fn(),
}));
jest.mock('@/lib/app-runtime/server', () => ({
  getAppRuntimeStatus: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/economy/v1/runtime-status/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { getAppRuntimeStatus } from '@/lib/app-runtime/server';

const wallet = '0x1111111111111111111111111111111111111111';
const data = {
  checkedAt: '2026-09-09T10:00:00.000Z',
  services: {
    indexer: { status: 'ready', checkedAt: '2026-09-09T10:00:00.000Z', lastSuccessAt: '2026-09-09T09:59:00.000Z', code: 'indexer_ready' },
    master: { status: 'syncing', checkedAt: '2026-09-09T10:00:00.000Z', lastSuccessAt: null, code: 'heartbeat_stale' },
    credits: { status: 'unavailable', checkedAt: '2026-09-09T10:00:00.000Z', lastSuccessAt: null, code: 'credits_source_unavailable' },
  },
};

describe('GET /api/economy/v1/runtime-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyWalletAuth as jest.Mock).mockResolvedValue({ id: 'user-1' });
    (getAppRuntimeStatus as jest.Mock).mockResolvedValue(data);
  });

  it('valida input y no abre el servicio sin wallet', async () => {
    const missing = await GET(new NextRequest('http://localhost/api/economy/v1/runtime-status'));
    expect(missing.status).toBe(400);
    expect(missing.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(verifyWalletAuth).not.toHaveBeenCalled();
    expect(getAppRuntimeStatus).not.toHaveBeenCalled();
  });

  it('autentica antes de leer y conserva no-store en respuesta y auth failure', async () => {
    (verifyWalletAuth as jest.Mock).mockRejectedValueOnce(new Error('secret auth detail'));
    const unauthorized = await GET(new NextRequest(
      `http://localhost/api/economy/v1/runtime-status?walletAddress=${wallet}`,
    ));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(await unauthorized.json()).toEqual({ status: 'error', code: 'WALLET_SESSION_REQUIRED' });
    expect(getAppRuntimeStatus).not.toHaveBeenCalled();

    (verifyWalletAuth as jest.Mock).mockResolvedValueOnce({ id: 'user-1' });
    const response = await GET(new NextRequest(
      `http://localhost/api/economy/v1/runtime-status?walletAddress=${wallet}`,
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(await response.json()).toEqual({ status: 'ok', data });
    expect(getAppRuntimeStatus).toHaveBeenCalledWith(wallet);
  });

  it('oculta errores internos aunque falle la lectura agregada', async () => {
    (getAppRuntimeStatus as jest.Mock).mockRejectedValueOnce(new Error('mongo uri and identity detail'));
    const response = await GET(new NextRequest(
      `http://localhost/api/economy/v1/runtime-status?walletAddress=${wallet}`,
    ));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    const body = await response.clone().json();
    expect(body).toEqual({ status: 'error', code: 'RUNTIME_STATUS_UNAVAILABLE' });
    expect(JSON.stringify(body)).not.toContain('mongo uri');
  });
});
