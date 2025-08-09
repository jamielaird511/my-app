import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Importium",
  description: "Friendly import duty estimator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <header className="bg-white shadow">
          <nav className="mx-auto max-w-5xl flex items-center gap-6 p-4">
            <Link href="/" className="text-lg font-semibold hover:text-blue-600">
              Home
            </Link>
            <Link href="/estimate" className="text-lg font-semibold hover:text-blue-600">
              Estimate
            </Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
