import Link from 'next/link';

export default function MarketplaceDetailNotFound() {
  return (
    <div className="rounded-[12px] border border-white/10 bg-black/30 p-8 text-center">
      <h1 className="font-headline text-3xl font-black text-[var(--uki-cream)]">Cukie no encontrado</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-[var(--uki-muted)]">
        No existe una ficha Legacy con esa combinación de red, colección y token.
      </p>
      <Link href="/marketplace" className="mt-6 inline-flex rounded-[9px] bg-[var(--uki-lilac)] px-5 py-3 text-sm font-black text-[#09060f]">
        Volver al marketplace
      </Link>
    </div>
  );
}
