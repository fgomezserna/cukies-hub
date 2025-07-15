import { redirect } from "next/navigation";

interface ReferralPageProps {
  params: Promise<{ code: string }>;
}

export default async function ReferralPage({ params }: ReferralPageProps) {
  const { code } = await params;
  // Redirect to the API route that handles cookie setting
  redirect(`/api/referral/${code}`);
}