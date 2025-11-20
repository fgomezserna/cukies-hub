import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import PWASetup from '@/components/pwa-setup';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Treasure Hunt',
  description: '¡Esquiva duendes y recolecta puntos!',
  metadataBase: new URL('https://treasure-hunt.cukies.world'),
  manifest: '/manifest.json',
  themeColor: '#0f172a',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sybil Slayer',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  openGraph: {
    title: 'Treasure Hunt',
    description: '¡Esquiva duendes y recolecta puntos!',
    type: 'website',
    siteName: 'Treasure Hunt',
    url: 'https://treasure-hunt.cukies.world',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Treasure Hunt',
    description: '¡Esquiva duendes y recolecta puntos!',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Script 
          src="/joy.js" 
          strategy="afterInteractive"
        />
        <PWASetup />
        {children}
      </body>
    </html>
  );
}
