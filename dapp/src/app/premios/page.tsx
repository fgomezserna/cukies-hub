import type { Metadata } from 'next';
import { PremiosContent } from '@/components/premios/premios-content';

export const metadata: Metadata = {
  title: 'Premios de preventa | Cukies World',
  description: 'Sorteos de Cukies por compra de UKI y competición de referidos de la preventa.',
};

export default function PremiosPage() {
  return (
    <main className="uki-landing min-h-screen overflow-hidden bg-[var(--uki-bg)] text-[var(--uki-cream)]">
      <div className="uki-noise" />
      <div className="uki-grid-bg" />
      <PremiosContent />
    </main>
  );
}
