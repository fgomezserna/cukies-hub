import { notFound } from "next/navigation";

interface ReferralPageProps {
  params: Promise<{ code: string }>;
}

export default async function ReferralPage({ params }: ReferralPageProps) {
  await params;
  notFound();
}
