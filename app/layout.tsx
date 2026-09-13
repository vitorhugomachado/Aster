import type { Metadata } from 'next';
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
  metadataBase: new URL('https://fibra-mapa-guaporema.vitorhugomateo.chatgpt.site'),
  title: 'FibraMapa — Mapa comercial de clientes',
  description: 'Visualize clientes de fibra por endereço, cidade e status operacional.',
  alternates: {
    canonical: 'https://fibra-mapa-guaporema.vitorhugomateo.chatgpt.site',
  },
  openGraph: {
    title: 'FibraMapa',
    description: 'Clientes de fibra no mapa.',
    type: 'website',
    url: 'https://fibra-mapa-guaporema.vitorhugomateo.chatgpt.site',
    images: [{
      url: 'https://fibra-mapa-guaporema.vitorhugomateo.chatgpt.site/og.png',
      width: 1200,
      height: 630,
      alt: 'FibraMapa — Clientes de fibra no mapa',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FibraMapa',
    description: 'Clientes de fibra no mapa.',
    images: ['https://fibra-mapa-guaporema.vitorhugomateo.chatgpt.site/og.png'],
  },
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
