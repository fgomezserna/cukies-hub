import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyppie Road - Crypto Adventure Game",
  description: "Navigate the crypto road, avoid traps, and multiply your rewards!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}