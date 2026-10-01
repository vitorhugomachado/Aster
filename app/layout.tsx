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

const siteUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'aster — Inteligência comercial em cada endereço',
  description: 'CRM geográfico para mapear clientes, priorizar oportunidades e planejar visitas comerciais.',
  applicationName: 'aster',
  icons: {
    icon: '/brand/aster-client-pin.png',
    apple: '/brand/aster-client-pin.png',
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: 'aster',
    description: 'Clientes, oportunidades e rotas comerciais em um único mapa.',
    type: 'website',
    url: siteUrl,
    images: [{
      url: new URL('/og.png', siteUrl).toString(),
      width: 1200,
      height: 630,
      alt: 'aster — Inteligência comercial em cada endereço',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'aster',
    description: 'Clientes, oportunidades e rotas comerciais em um único mapa.',
    images: [new URL('/og.png', siteUrl).toString()],
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
