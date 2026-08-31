import AppLayout from '@/components/layout/app-layout';

export default function VestingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppLayout>{children}</AppLayout>;
}
