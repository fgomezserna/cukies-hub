import type { Metadata } from 'next';
import { PremiosContent } from '@/components/premios/premios-content';

export const metadata: Metadata = {
  title: 'Premios de preventa | Cukies World',
  description: 'Sorteos de Cukies por compra de UKI y competición de referidos de la preventa.',
};

export default function PremiosPage() {
  return (
    <div className="uki-landing min-h-full w-full overflow-hidden bg-transparent text-[var(--uki-cream)]">
      <PremiosContent />
    </div>
  );
}
