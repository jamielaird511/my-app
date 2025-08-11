import './globals.css';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Importium',
  description: 'Instant U.S. import duty estimates from keywords or HS codes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Match your hero background */}
      <body className="min-h-screen bg-indigo-50">
        <SiteHeader />
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </body>
    </html>
  );
}
