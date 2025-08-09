"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();

  const linkClasses = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      pathname === path
        ? "bg-blue-600 text-white"
        : "text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <nav className="bg-white shadow mb-6">
      <div className="mx-auto max-w-5xl px-4 flex gap-4">
        <Link href="/" className={linkClasses("/")}>
          Home
        </Link>
        <Link href="/estimate" className={linkClasses("/estimate")}>
          Estimate
        </Link>
      </div>
    </nav>
  );
}
