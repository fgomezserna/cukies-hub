import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { useTronLink } from '@/hooks/use-tronlink';
import { TRON_MAINNET_CHAIN_ID, TRON_SHASTA_CHAIN_ID } from '@/lib/tronlink-provider';
import { WalletCoordinatorProvider } from '@/providers/wallet-coordinator-provider';
import { useWalletCoordinator, type WalletCoordinatorContextValue } from '@/providers/wallet-coordinator-context';

jest.mock('wagmi');
jest.mock('@/hooks/use-tronlink', () => ({ useTronLink: jest.fn() }));
jest.mock('@/components/landing/wallet-connector-dialog', () => ({
  WalletConnectorDialog: () => null,
}));

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseConnect = useConnect as jest.MockedFunction<typeof useConnect>;
const mockUseDisconnect = useDisconnect as jest.MockedFunction<typeof useDisconnect>;
const mockUseSwitchChain = useSwitchChain as jest.MockedFunction<typeof useSwitchChain>;
const mockUseTronLink = useTronLink as jest.MockedFunction<typeof useTronLink>;

const evmAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const changedEvmAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const tronAddress = 'TCoordinator1111111111111111111111111111';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Probe({ onApi }: { onApi: (value: WalletCoordinatorContextValue) => void }) {
  onApi(useWalletCoordinator());
  return null;
}

function renderCoordinator(onApi: (value: WalletCoordinatorContextValue) => void) {
  return render(
    <WalletCoordinatorProvider>
      <Probe onApi={onApi} />
    </WalletCoordinatorProvider>,
  );
}

describe('WalletCoordinatorProvider pending request fencing', () => {
  let switchEvm: jest.Mock;
  let switchTron: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    switchEvm = jest.fn();
    switchTron = jest.fn();
    mockUseAccount.mockReturnValue({
      address: evmAddress,
      chainId: 97,
      isConnected: true,
    } as never);
    mockUseConnect.mockReturnValue({
      connectAsync: jest.fn(),
      connectors: [],
      isPending: false,
    } as never);
    mockUseDisconnect.mockReturnValue({ disconnect: jest.fn() } as never);
    mockUseSwitchChain.mockReturnValue({
      switchChainAsync: switchEvm,
      isPending: false,
    } as never);
    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      chainId: TRON_SHASTA_CHAIN_ID,
      network: 'shasta',
      rpcHost: 'api.shasta.trongrid.io',
      isInstalled: true,
      isConnected: true,
      isConnecting: false,
      error: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as never);
    Object.defineProperty(window, 'tron', {
      configurable: true,
      value: { request: switchTron },
    });
  });

  afterEach(() => {
    delete window.tron;
  });

  it('no permite que el switch tardío de A resuelva o rechace la solicitud B de otra familia', async () => {
    const evmSwitch = deferred<unknown>();
    const tronSwitch = deferred<unknown>();
    switchEvm.mockReturnValue(evmSwitch.promise);
    switchTron.mockReturnValue(tronSwitch.promise);
    let api!: WalletCoordinatorContextValue;
    const view = renderCoordinator((value) => { api = value; });

    let requestA!: Promise<unknown>;
    await act(async () => {
      requestA = api.requestWallet({
        kind: 'evm',
        targetChainId: 56,
        reason: 'EVM A',
      });
      await Promise.resolve();
    });
    const requestAResult = requestA.then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );

    let requestB!: Promise<unknown>;
    await act(async () => {
      requestB = api.requestWallet({
        kind: 'tron',
        targetTronNetwork: 'mainnet',
        reason: 'TRON B',
      });
      await Promise.resolve();
    });
    await expect(requestAResult).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ message: 'WALLET_REQUEST_REPLACED' }),
    }));

    let bSettled = false;
    void requestB.then(() => { bSettled = true; }, () => { bSettled = true; });
    await act(async () => {
      evmSwitch.resolve(undefined);
      await Promise.resolve();
    });
    expect(bSettled).toBe(false);

    await act(async () => {
      tronSwitch.resolve(undefined);
      await Promise.resolve();
    });
    expect(bSettled).toBe(false);

    mockUseTronLink.mockReturnValue({
      address: tronAddress,
      chainId: TRON_MAINNET_CHAIN_ID,
      network: 'mainnet',
      rpcHost: 'api.trongrid.io',
      isInstalled: true,
      isConnected: true,
      isConnecting: false,
      error: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as never);
    await act(async () => {
      view.rerender(
        <WalletCoordinatorProvider>
          <Probe onApi={(value) => { api = value; }} />
        </WalletCoordinatorProvider>,
      );
      await Promise.resolve();
    });

    await expect(requestB).resolves.toEqual(expect.objectContaining({
      kind: 'tron',
      address: tronAddress,
      tronChainId: TRON_MAINNET_CHAIN_ID,
      network: 'mainnet',
    }));
    view.unmount();
  });

  it('cancela la solicitud si cambia la cuenta mientras espera el switch', async () => {
    const evmSwitch = deferred<unknown>();
    switchEvm.mockReturnValue(evmSwitch.promise);
    let api!: WalletCoordinatorContextValue;
    const view = renderCoordinator((value) => { api = value; });

    let request!: Promise<unknown>;
    await act(async () => {
      request = api.requestWallet({
        kind: 'evm',
        targetChainId: 56,
        reason: 'Cambio de cuenta',
      });
      await Promise.resolve();
    });
    const requestResult = request.then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );

    mockUseAccount.mockReturnValue({
      address: changedEvmAddress,
      chainId: 97,
      isConnected: true,
    } as never);
    await act(async () => {
      view.rerender(
        <WalletCoordinatorProvider>
          <Probe onApi={(value) => { api = value; }} />
        </WalletCoordinatorProvider>,
      );
      await Promise.resolve();
    });

    await expect(requestResult).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ message: 'WALLET_ACCOUNT_CHANGED' }),
    }));
    await act(async () => {
      evmSwitch.resolve(undefined);
      await Promise.resolve();
    });
    view.unmount();
  });

  it('ignora el rechazo tardío de A mientras B sigue pendiente', async () => {
    const evmSwitch = deferred<unknown>();
    const tronSwitch = deferred<unknown>();
    switchEvm.mockReturnValue(evmSwitch.promise);
    switchTron.mockReturnValue(tronSwitch.promise);
    let api!: WalletCoordinatorContextValue;
    const view = renderCoordinator((value) => { api = value; });

    let requestA!: Promise<unknown>;
    let requestB!: Promise<unknown>;
    await act(async () => {
      requestA = api.requestWallet({
        kind: 'evm',
        targetChainId: 56,
        reason: 'EVM A',
      });
      requestB = api.requestWallet({
        kind: 'tron',
        targetTronNetwork: 'mainnet',
        reason: 'TRON B',
      });
      await Promise.resolve();
    });
    const requestAResult = requestA.then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );
    let bSettled = false;
    void requestB.then(() => { bSettled = true; }, () => { bSettled = true; });

    await expect(requestAResult).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ message: 'WALLET_REQUEST_REPLACED' }),
    }));
    await act(async () => {
      evmSwitch.reject(new Error('late A failure'));
      await Promise.resolve();
    });
    expect(bSettled).toBe(false);
    view.unmount();
  });

  it('rechaza el pending al desmontar y la respuesta posterior no deja readiness', async () => {
    const evmSwitch = deferred<unknown>();
    switchEvm.mockReturnValue(evmSwitch.promise);
    let api!: WalletCoordinatorContextValue;
    const view = renderCoordinator((value) => { api = value; });

    let request!: Promise<unknown>;
    await act(async () => {
      request = api.requestWallet({
        kind: 'evm',
        targetChainId: 56,
        reason: 'Desmontaje',
      });
      await Promise.resolve();
    });
    const requestResult = request.then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );
    view.unmount();

    await expect(requestResult).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ message: 'WALLET_REQUEST_CANCELLED' }),
    }));
    evmSwitch.resolve(undefined);
  });
});
