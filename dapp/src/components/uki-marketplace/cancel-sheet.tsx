'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle, WarningCircle, XCircle } from '@phosphor-icons/react';
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
  ukiGenerationLabel,
  ukiRarityLabel,
} from './metadata-labels';

export type UkiMarketplaceCancelSheetProps = {
  order: UkiMarketplaceOrderView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean> | boolean | void;
  busy?: boolean;
  /** A broadcast transaction that can be checked without signing again. */
  pendingHash?: string | null;
  onRecheckPending?: () => Promise<boolean> | boolean | void;
  notice?: string | null;
  error?: string | null;
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

export function UkiMarketplaceCancelSheet({
  order,
  open,
  onOpenChange,
  onConfirm,
  busy = false,
  pendingHash = null,
  onRecheckPending,
  notice = null,
  error = null,
}: UkiMarketplaceCancelSheetProps) {
  const isMobile = useIsMobile();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const handleConfirm = useCallback(async () => {
    if (submitting || busy) return;
    setSubmitting(true);
    try {
      const result = await onConfirm();
      if (result === true) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }, [busy, onConfirm, onOpenChange, submitting]);

  const handleRecheck = useCallback(async () => {
    if (checking || submitting || busy || !pendingHash || !onRecheckPending) return;
    setChecking(true);
    try {
      await onRecheckPending();
    } finally {
      setChecking(false);
    }
  }, [busy, checking, onRecheckPending, pendingHash, submitting]);

  if (!order) return null;

  // A broadcast transaction is deliberately not treated as an active write:
  // the seller may close this Sheet and return later to check the same hash.
  const dismissBlocked = submitting || busy;
  const confirmationBlocked = dismissBlocked || checking || Boolean(pendingHash);
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
          : 'h-full max-h-full rounded-l-2xl sm:max-w-[34rem]'
        }`}
      >
        <SheetHeader className="border-b border-white/10 px-5 py-5 pr-14 text-left sm:px-7 sm:py-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-rose-200">
            <XCircle aria-hidden="true" className="h-4 w-4" /> Gestionar anuncio
          </div>
          <SheetTitle className="mt-2 font-headline text-2xl font-black tracking-[-0.025em] text-[var(--uki-cream)] sm:text-3xl">
            Cancelar anuncio de Cukie #{order.tokenId}
          </SheetTitle>
          <SheetDescription className="mt-2 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            Esta acción libera el anuncio y deja el Cukie en tu wallet. Para venderlo después tendrás que crear un anuncio nuevo.
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
            <dl className="grid min-w-0 grid-cols-1 gap-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
              <dt className="break-words font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Precio fijado</dt>
              <dd className="break-words font-mono font-bold tabular-nums text-[var(--uki-gold)]">{formatUkiPrice(order.ukiPriceRaw)}</dd>
              {order.rarity ? (
                <>
                  <dt className="break-words font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Rareza</dt>
                  <dd className="break-words font-semibold text-[var(--uki-text)]">{ukiRarityLabel(order.rarity)}</dd>
                </>
              ) : null}
              {order.generation ? (
                <>
                  <dt className="break-words font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Generación</dt>
                  <dd className="break-words font-semibold text-[var(--uki-text)]">{ukiGenerationLabel(order.generation)}</dd>
                </>
              ) : null}
            </dl>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200/25 bg-amber-200/[0.07] p-4 text-sm text-amber-100">
            <WarningCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" weight="duotone" />
            <p>El anuncio dejará de estar disponible para compradores en cuanto la cancelación se confirme en la cadena.</p>
          </div>
          {error ? (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200/25 bg-rose-200/[0.07] p-3 text-sm font-semibold leading-6 text-rose-100">
              <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200/25 bg-emerald-200/[0.07] p-3 text-sm font-semibold leading-6 text-emerald-100">
              <CheckCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" weight="fill" /> {notice}
            </p>
          ) : null}
        </div>

        <SheetFooter className="flex-col border-t border-white/10 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-7">
          {pendingHash && onRecheckPending ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleRecheck()}
              disabled={checking || submitting || busy}
              className="min-h-10 w-full border-amber-200/30 bg-amber-200/[0.04] text-xs font-bold text-amber-100 hover:bg-amber-200/[0.09]"
            >
              {checking || busy ? 'Comprobando transacción…' : 'Comprobar transacción'}
            </Button>
          ) : null}
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
              onClick={() => void handleConfirm()}
              disabled={confirmationBlocked}
              className="min-h-11 min-w-0 h-auto flex-1 whitespace-normal break-words px-3 leading-snug bg-rose-300 text-[#18070d] hover:bg-rose-200"
            >
              <XCircle aria-hidden="true" className="h-4 w-4" />
              <span className="min-w-0 break-words text-center">
                {submitting || busy
                  ? 'Cancelando…'
                  : pendingHash
                    ? 'Transacción pendiente'
                    : 'Confirmar cancelación'}
              </span>
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
