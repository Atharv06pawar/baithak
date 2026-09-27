import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ShopProvider } from '@/contexts/ShopContext';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'BaithakOS — Shop Operating System',
  description: 'Free, reliable offline-first operating system for neighborhood retail shops',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BaithakOS',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f2b48',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

import PWAInstallBanner from '@/components/PWAInstallBanner';
import { ThemeProvider } from '@/contexts/ThemeContext';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 dark:bg-slate-950 min-h-screen text-gray-900 dark:text-slate-100 select-none transition-colors duration-150`}>
        <ThemeProvider>
          <ShopProvider>
            <PWAInstallBanner />
            {children}
          </ShopProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
