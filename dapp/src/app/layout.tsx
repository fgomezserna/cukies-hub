import type {Metadata} from 'next';
import { Inter, Lilita_One, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AppProviders } from '@/providers/app-providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const lilita = Lilita_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://cukies.world'),
  title: 'Cukies World | Preventa UKI',
  description:
    'UKI es el token que conecta la nueva economía de juegos de Cukies World en BNB Smart Chain.',
  openGraph: {
    title: 'Cukies World | Preventa UKI',
    description:
      'Entra en la preventa UKI y sigue la nueva economía de juegos de Cukies World en BNB Smart Chain.',
    images: ['/brand/uki-sale-landing-reference.png'],
  },
  icons: {
    icon: '/Powered_up_2.png',
    shortcut: '/Powered_up_2.png',
    apple: '/Powered_up_2.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable} ${lilita.variable} dark`} suppressHydrationWarning>
      <body className="font-body antialiased">
        <AppProviders>{children}</AppProviders>
        <Toaster />
      </body>
    </html>
  );
}
