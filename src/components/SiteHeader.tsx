'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
        active
          ? 'text-indigo-700 bg-indigo-50'
          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <Logo large />

          <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/estimate">Estimate</NavLink>
            {/* HS Lookup removed */}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/estimate"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
