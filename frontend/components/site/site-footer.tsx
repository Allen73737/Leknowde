import Link from "next/link";

import { Logo } from "@/components/brand/logo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Architecture", href: "/architecture" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/register" },
      { label: "Reset password", href: "/forgot-password" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-shell">
      <div className="container-wide grid gap-12 py-16 md:grid-cols-[1.6fr_repeat(3,1fr)] md:gap-16 lg:py-20">
        <div className="min-w-0">
          <Logo size={30} />
          <p className="mt-5 max-w-sm text-base leading-relaxed text-muted">
            Learn the Code. Know the System. Evidence-backed software intelligence for repositories
            you did not write.
          </p>
          <p className="mt-6 font-mono text-[0.75rem] uppercase leading-relaxed tracking-[0.16em] text-faint">
            Deterministic facts · Grounded AI · No code execution
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title} className="min-w-0">
            <h3 className="font-mono text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-faint">
              {column.title}
            </h3>
            <ul className="mt-5 space-y-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group inline-flex items-center text-base text-muted transition-colors duration-200 hover:text-ink"
                  >
                    <span className="relative">
                      {link.label}
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-300 ease-smooth group-hover:scale-x-100"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="container-wide flex flex-col gap-4 py-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-faint">
            © {new Date().getFullYear()} LeKnowde. Platform build 1.0.
          </p>
          <p className="font-mono text-[0.75rem] uppercase tracking-[0.14em] text-faint">
            PostgreSQL / SQLite · SQL graph traversal · Self-hostable
          </p>
        </div>
      </div>

      <div aria-hidden="true" className="overflow-hidden border-t border-line">
        <div className="container-wide">
          <p className="select-none whitespace-nowrap py-6 font-display text-[clamp(3.5rem,12vw,11rem)] font-semibold leading-[0.82] tracking-[-0.05em] text-line/60">
            LeKnowde
          </p>
        </div>
      </div>
    </footer>
  );
}
