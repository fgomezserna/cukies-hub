import AppLayout from '@/components/layout/app-layout';

export default function PremiosLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppLayout>{children}</AppLayout>;
}
