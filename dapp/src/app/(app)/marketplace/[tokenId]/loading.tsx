export default function MarketplaceDetailLoading() {
  return (
    <div role="status" aria-label="Cargando ficha del Cukie" className="grid gap-5 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
      <div className="aspect-[4/5] animate-pulse rounded-[12px] border border-white/10 bg-white/[0.04]" />
      <div className="grid content-start gap-4">
        <div className="h-40 animate-pulse rounded-[12px] border border-white/10 bg-white/[0.04]" />
        <div className="h-72 animate-pulse rounded-[12px] border border-white/10 bg-white/[0.04]" />
      </div>
    </div>
  );
}
