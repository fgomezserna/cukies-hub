'use client';

import Link from 'next/link';

export default function MarketplaceDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="rounded-[12px] border border-amber-300/25 bg-amber-300/10 p-6 text-amber-50">
      <h1 className="font-headline text-2xl font-black">No pudimos cargar esta ficha</h1>
      <p className="mt-2 text-sm text-amber-100/80">
        El Cukie existe, pero sus datos no están disponibles ahora. Esto no significa que haya desaparecido.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="rounded-[9px] bg-amber-100 px-4 py-2 text-sm font-black text-amber-950">
          Reintentar
        </button>
        <Link href="/marketplace" className="rounded-[9px] border border-amber-100/25 px-4 py-2 text-sm font-black">
          Volver al marketplace
        </Link>
      </div>
    </div>
  );
}
