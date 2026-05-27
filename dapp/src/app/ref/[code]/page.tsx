import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

interface PresaleReferralPageProps {
  params: Promise<{ code: string }>;
}

export default async function PresaleReferralPage({ params }: PresaleReferralPageProps) {
  const { code } = await params;
  const cookieStore = await cookies();

  cookieStore.set('ukiReferralCode', code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  redirect('/#presale-console');
}
