import type { Metadata } from 'next';

import { CukieMasterFaq } from '@/components/cukie-master/faq';
import { CukieMasterWorkspace } from '@/components/cukie-master/workspace';

export const metadata: Metadata = {
  title: 'Cukie Master | Cukies World',
  description: 'Consulta tus cupos Cukie Master, descubre tu siguiente paso y gestiona el staking de UKI y Cukies Originales.',
};

export const dynamic = 'force-dynamic';

export default function CukieMasterPage() {
  const isStaging = process.env.APP_ENV?.trim().toLowerCase() === 'staging';

  return (
    <div className="uki-theme min-h-full w-full overflow-x-clip text-[var(--uki-cream)]">
      <CukieMasterWorkspace testnetOnly={isStaging} />
      <CukieMasterFaq />
    </div>
  );
}
