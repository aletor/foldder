"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/logo-lab", label: "Visor" },
  { href: "/logo-lab/annotate", label: "Anotar" },
  { href: "/logo-lab/benchmark", label: "Benchmark" },
];

export function LogoLabNav() {
  const pathname = usePathname();
  return (
    <nav className="logo-lab-nav" aria-label="logo-lab secciones">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`logo-lab-nav__link${
            pathname === link.href ? " logo-lab-nav__link--active" : ""
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
