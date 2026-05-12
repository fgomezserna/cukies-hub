import type {Metadata} from 'next';
import { Inter, Lilita_One, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Web3Provider } from '@/providers/web3-provider';
import { AuthProvider } from '@/providers/auth-provider';

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
  title: 'Cukies World | UKI Presale',
  description:
    'UKI is the token powering the next Cukies game economy on BNB Smart Chain.',
  openGraph: {
    title: 'Cukies World | UKI Presale',
    description:
      'Join the UKI presale and follow the next Cukies game economy on BNB Smart Chain.',
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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${lilita.variable} dark`} suppressHydrationWarning>
      <body className="font-body antialiased">
        <Web3Provider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </Web3Provider>
        <Toaster />
      </body>
    </html>
  );
}
