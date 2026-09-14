import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://web-production-684d7.up.railway.app'),
  title: 'aster — Inteligência comercial em cada endereço',
  description: 'CRM geográfico para mapear clientes, priorizar oportunidades e planejar visitas comerciais.',
  applicationName: 'aster',
  icons: {
    icon: '/brand/aster-client-pin.png',
    apple: '/brand/aster-client-pin.png',
  },
  alternates: {
    canonical: 'https://web-production-684d7.up.railway.app',
  },
  openGraph: {
    title: 'aster',
    description: 'Clientes, oportunidades e rotas comerciais em um único mapa.',
    type: 'website',
    url: 'https://web-production-684d7.up.railway.app',
    images: [{
      url: 'https://web-production-684d7.up.railway.app/og.png',
      width: 1200,
      height: 630,
      alt: 'aster — Inteligência comercial em cada endereço',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'aster',
    description: 'Clientes, oportunidades e rotas comerciais em um único mapa.',
    images: ['https://web-production-684d7.up.railway.app/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
