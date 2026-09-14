import { redirect } from 'next/navigation';

export default function WalletLegacyPage() {
  redirect('/dashboard');
  return null;
}
