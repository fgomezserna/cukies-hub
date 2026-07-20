import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
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

const alumniSans = localFont({
  src: '../../public/assets/ui/fonts/AlumniSans-Variable.ttf',
  variable: '--font-alumni-sans',
  display: 'swap',
  style: 'normal',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Treasure Hunt',
  description: '¡Esquiva duendes y recolecta puntos!',
  metadataBase: new URL('https://treasure-hunt.cukies.world'),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Treasure Hunt',
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

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <head>
        <link
          rel="preload"
          as="image"
          href="/assets/ui/game-container/treasure-vault-background.webp"
          type="image/webp"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${alumniSans.variable} antialiased`}>
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
