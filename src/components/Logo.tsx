'use client';
import Link from 'next/link';

export default function Logo({ large = false }: { large?: boolean }) {
  return (
    <Link href="/" aria-label="Importium home" className="inline-flex items-center gap-2">
      {/* Monogram block */}
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-white font-bold"
      >
        I
      </span>
      {/* Wordmark */}
      <span
        className={[
          'font-extrabold tracking-tight text-gray-900',
          large ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl',
        ].join(' ')}
      >
        Importium
      </span>
    </Link>
  );
}
