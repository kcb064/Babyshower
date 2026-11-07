"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ label, links }: { label: string; links: { href: string; text: string; testId: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mt-3 flex flex-wrap gap-2 text-sm">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="chip" aria-current={pathname === l.href ? "true" : undefined} data-testid={l.testId}>
          {l.text}
        </Link>
      ))}
    </nav>
  );
}
