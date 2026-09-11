'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle, ShoppingCart, Tag } from '@phosphor-icons/react';
import { formatUnits } from 'viem';

import { CukiImage } from '@/components/legacy-marketplace/cuki-image';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { UkiMarketplaceOrderView } from '@/lib/uki-marketplace/types';

import {
  UkiMarketplaceBuyerCheckout,
  type UkiMarketplaceCheckoutAction,
} from './buyer-checkout';
import {
  ukiGenerationLabel,
  ukiRarityLabel,
} from './metadata-labels';

type UkiMarketplacePurchaseSheetProps = {
  order: UkiMarketplaceOrderView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchased: () => void;
};

function formatUkiPrice(raw: string) {
  if (!/^\d+$/.test(raw)) return 'Precio no disponible';
  try {
    const [integer, fraction = ''] = formatUnits(BigInt(raw), 18).split('.');
    const compactFraction = fraction.slice(0, 4).replace(/0+$/, '');
    const grouped = BigInt(integer || '0').toLocaleString('es-ES');
    return `${grouped}${compactFraction ? `,${compactFraction}` : ''} UKI`;
  } catch {
    return 'Precio no disponible';
  }
}

export function UkiMarketplacePurchaseSheet({
  order,
  open,
  onOpenChange,
  onPurchased,
}: UkiMarketplacePurchaseSheetProps) {
  const isMobile = useIsMobile();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<UkiMarketplaceCheckoutAction | null>(null);
  const handleBusyChange = useCallback((nextBusy: boolean) => {
    setBusy(nextBusy);
  }, []);
  const handleActionChange = useCallback((nextAction: UkiMarketplaceCheckoutAction | null) => {
    setAction(nextAction);
  }, []);

  if (!order) return null;

  const dismissBlocked = busy;
  const rarity = order.rarity?.trim();
  const generation = order.generation?.trim();

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && dismissBlocked) return;
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        onOpenAutoFocus={() => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef.current?.isConnected) {
            event.preventDefault();
            returnFocusRef.current.focus({ preventScroll: true });
          }
        }}
        onEscapeKeyDown={(event) => {
          if (dismissBlocked) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (dismissBlocked) event.preventDefault();
        }}
        className={`uki-theme grid w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-[var(--uki-lilac-border)] bg-[var(--uki-bg)] p-0 text-[var(--uki-cream)] shadow-[0_0_80px_rgba(228,92,255,0.18)] motion-reduce:animate-none motion-reduce:transition-none [&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:grid [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:place-items-center ${isMobile
          ? 'max-h-[calc(100dvh-0.5rem)] max-w-none rounded-t-2xl sm:max-w-none'
          : 'h-full max-h-full rounded-l-2xl sm:max-w-[38rem]'
        }`}
      >
        <SheetHeader className="border-b border-white/10 px-5 py-5 pr-14 text-left sm:px-7 sm:py-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">
            <ShoppingCart aria-hidden="true" className="h-4 w-4" /> Comprar Cukie
          </div>
          <SheetTitle className="mt-2 font-headline text-2xl font-black tracking-[-0.025em] text-[var(--uki-cream)] sm:text-3xl">
            Comprar Cukie #{order.tokenId}
          </SheetTitle>
          <SheetDescription className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            Revisa el precio fijado por el vendedor y el total de tu moneda antes de confirmar.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5">
            <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--uki-lilac-border)] bg-[var(--uki-bg-2)]">
              <CukiImage
                src={order.imageUrl ?? null}
                alt={`Cukie #${order.tokenId}`}
                sizes="112px"
                className="object-contain p-2"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] px-2.5 py-1 text-xs font-black text-[var(--uki-lilac)]">
                  <Tag aria-hidden="true" className="h-3.5 w-3.5" /> V2 · UKI
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/25 bg-emerald-200/[0.08] px-2.5 py-1 text-xs font-bold text-emerald-100">
                  <CheckCircle aria-hidden="true" className="h-3.5 w-3.5" weight="fill" /> Anuncio activo
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
                <dt className="break-words font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Precio vendedor</dt>
                <dd className="break-words font-mono font-bold tabular-nums text-[var(--uki-gold)]">{formatUkiPrice(order.ukiPriceRaw)}</dd>
                <dt className="break-words font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Red</dt>
                <dd className="break-words font-semibold text-[var(--uki-text)]">{order.chainId === 97 ? 'BSC Testnet' : 'BSC'}</dd>
                {rarity ? (
                  <>
                    <dt className="break-words font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Rareza</dt>
                    <dd className="break-words font-semibold text-[var(--uki-text)]">{ukiRarityLabel(rarity)}</dd>
                  </>
                ) : null}
                {generation ? (
                  <>
                    <dt className="break-words font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Generación</dt>
                    <dd className="break-words font-semibold text-[var(--uki-text)]">{ukiGenerationLabel(generation)}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <UkiMarketplaceBuyerCheckout
              order={order}
              onPurchased={onPurchased}
              onBusyChange={handleBusyChange}
              onActionChange={handleActionChange}
            />
          </div>
        </div>

        <SheetFooter className="flex-col border-t border-white/10 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-7">
          <div className="flex w-full items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={dismissBlocked}
              className="min-h-11 shrink-0 border-white/15 bg-white/[0.03] px-3 text-xs text-[var(--uki-cream)] sm:mr-auto"
            >
              Cerrar
            </Button>
            <Button
              type="button"
              onClick={() => action?.onClick()}
              disabled={!action || action.disabled}
              className="min-h-11 min-w-0 h-auto flex-1 whitespace-normal break-words px-3 leading-snug bg-[var(--uki-lilac)] text-[#100516] hover:bg-[#f19bff]"
            >
              <ShoppingCart aria-hidden="true" className="h-4 w-4" />
              <span className="min-w-0 break-words text-center">{action?.label ?? 'Preparando compra…'}</span>
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
