'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavBar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname?.startsWith(href));

  const linkClasses = (href: string) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      isActive(href) ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <nav className="bg-white shadow mb-6" aria-label="Main">
      <div className="mx-auto max-w-5xl px-4 flex gap-4">
        <Link
          href="/"
          className={linkClasses('/')}
          aria-current={isActive('/') ? 'page' : undefined}
        >
          Home
        </Link>
        <Link
          href="/estimate"
          className={linkClasses('/estimate')}
          aria-current={isActive('/estimate') ? 'page' : undefined}
        >
          Estimate
        </Link>
      </div>
    </nav>
  );
}
