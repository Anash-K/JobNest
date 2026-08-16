import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AppProviders } from '@/providers/AppProviders';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants/app';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: 'Multi-tenant job outreach CRM for leads, email drafts, and pipeline tracking',
  verification: {
    google: 'QueE5utnXCDsb82NnvkhcQuCcwBwG3g_PZKqiNWuPmc',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
