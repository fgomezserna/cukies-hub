import type { Metadata } from 'next';
import { PremiosContent } from '@/components/premios/premios-content';

export const metadata: Metadata = {
  title: 'Mis premios | Cukies World',
  description: 'Consulta tus recompensas, revisa cuándo están disponibles y cobra tus premios en UKI.',
};

export default function PremiosPage() {
  return (
    <div className="uki-landing min-h-full w-full overflow-hidden bg-transparent text-[var(--uki-cream)]">
      <PremiosContent />
    </div>
  );
}
