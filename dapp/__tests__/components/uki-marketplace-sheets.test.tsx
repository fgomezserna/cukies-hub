import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockPurchaseClicks: string[] = [];

jest.mock('lucide-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return { X: Icon };
});
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('@/components/legacy-marketplace/cuki-image', () => ({
  CukiImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
jest.mock('@/components/uki-marketplace/buyer-checkout', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    UkiMarketplaceBuyerCheckout: ({
      order,
      onBusyChange,
      onActionChange,
    }: {
      order: { orderId: string; tokenId: string };
      onBusyChange?: (busy: boolean) => void;
      onActionChange?: (action: { disabled: boolean; label: string; onClick: () => void } | null) => void;
    }) => {
      React.useEffect(() => {
        onBusyChange?.(false);
        onActionChange?.({
          disabled: false,
          label: `Confirmar #${order.tokenId}`,
          onClick: () => mockPurchaseClicks.push(order.orderId),
        });
        return () => onActionChange?.(null);
      }, [onActionChange, onBusyChange, order.orderId, order.tokenId]);
      return <div data-testid="buyer-checkout" />;
    },
  };
});

import { UkiMarketplaceCancelSheet } from '@/components/uki-marketplace/cancel-sheet';
import { UkiMarketplacePurchaseSheet } from '@/components/uki-marketplace/purchase-sheet';
import type { UkiMarketplaceOrderView } from '@/lib/uki-marketplace/types';

const seller = '0x00000000000000000000000000000000000000aa' as `0x${string}`;
const collection = '0x00000000000000000000000000000000000000bb' as `0x${string}`;
const marketplace = '0x00000000000000000000000000000000000000cc' as `0x${string}`;

function order(tokenId: string, idDigit: string): UkiMarketplaceOrderView {
  return {
    orderId: `0x${idDigit.repeat(64)}` as `0x${string}`,
    chainId: 97,
    marketplaceAddress: marketplace,
    collectionAddress: collection,
    tokenId,
    seller,
    ukiPriceRaw: '1250000000000000000000',
    expiresAt: '2027-01-15T08:00:00.000Z',
    nonceRaw: '1',
    feeBps: 500,
    status: 'active',
    attentionReason: null,
    buyer: null,
    paymentToken: null,
    paymentAmountRaw: null,
    feeAmountRaw: null,
    listedAt: '2026-09-01T10:00:00.000Z',
    soldAt: null,
    cancelledAt: null,
    expiredAt: null,
    invalidatedAt: null,
    imageUrl: '/cuki/73.png',
    rarity: 'rare',
    generation: 'second_generation',
  };
}

describe('Sheets del marketplace UKI', () => {
  beforeEach(() => {
    mockPurchaseClicks = [];
  });

  it('mantiene la acción del footer ligada al anuncio actual al cerrar, reabrir y cambiar de orden', async () => {
    const first = order('73', '1');
    const second = order('74', '2');
    const onOpenChange = jest.fn();
    const view = render(
      <UkiMarketplacePurchaseSheet
        order={first}
        open
        onOpenChange={onOpenChange}
        onPurchased={jest.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Comprar Cukie #73' })).toBeInTheDocument();
    const firstAction = await screen.findByRole('button', { name: 'Confirmar #73' });
    fireEvent.click(firstAction);
    expect(mockPurchaseClicks).toEqual([first.orderId]);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    view.rerender(
      <UkiMarketplacePurchaseSheet
        order={second}
        open
        onOpenChange={onOpenChange}
        onPurchased={jest.fn()}
      />,
    );
    const secondAction = await screen.findByRole('button', { name: 'Confirmar #74' });
    fireEvent.click(secondAction);
    expect(mockPurchaseClicks).toEqual([first.orderId, second.orderId]);
    expect(screen.getByText('BSC Testnet')).toBeInTheDocument();
  });

  it('cierra solo cuando la cancelación devuelve confirmación y no expone el orderId en la fila principal', async () => {
    const activeOrder = order('73', '3');
    const onOpenChange = jest.fn();
    const onConfirm = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    render(
      <UkiMarketplaceCancelSheet
        order={activeOrder}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Cancelar anuncio de Cukie #73' })).toBeInTheDocument();
    expect(screen.queryByText(activeOrder.orderId)).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' });
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(confirm);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('permite cerrar un anuncio con transacción pendiente y comprobarla sin volver a firmar', async () => {
    const activeOrder = order('73', '4');
    const onOpenChange = jest.fn();
    const onRecheckPending = jest.fn().mockResolvedValue(false);
    render(
      <UkiMarketplaceCancelSheet
        order={activeOrder}
        open
        onOpenChange={onOpenChange}
        onConfirm={jest.fn()}
        pendingHash={`0x${'f'.repeat(64)}`}
        onRecheckPending={onRecheckPending}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Transacción pendiente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar transacción' }));
    await waitFor(() => expect(onRecheckPending).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
