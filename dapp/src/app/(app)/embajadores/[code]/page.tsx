import type { Metadata } from 'next';

import { AmbassadorProgram } from '@/components/ambassadors/ambassador-program';

export const metadata: Metadata = {
  title: 'Invitación de embajador | Cukies World',
  description: 'Confirma quién te invitó a Cukies World.',
};

export const dynamic = 'force-dynamic';

export default async function AmbassadorInvitationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return <AmbassadorProgram initialInvitationCode={(await params).code} />;
}
