import type { Metadata } from 'next';

import { MyCukiesPanel } from '@/components/cukies/my-cukies-panel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mis Cukies | Cukies World',
  description: 'Consulta los Cukies de tu wallet y las acciones disponibles para cada uno.',
};

export default function MyCukiesPage() {
  return (
    <div className="uki-landing mx-auto min-h-full w-full max-w-[1480px] bg-transparent text-[var(--uki-cream)]">
      <MyCukiesPanel />
    </div>
  );
}
