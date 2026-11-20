import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, FileCode2, Network, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-shell px-12 py-10 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid-backdrop opacity-40 [mask-image:radial-gradient(ellipse_at_left,black,transparent_75%)]"
        />
        <Link
          href="/"
          className="focus-ring relative w-fit rounded-lg"
          aria-label="LeKnowde home"
        >
          <Logo size={32} />
        </Link>

        <div className="relative max-w-md">
          <h1 className="font-display text-[1.875rem] font-semibold leading-[1.15] tracking-[-0.035em] text-ink">
            An unfamiliar repository should not feel like a black box.
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
            LeKnowde indexes structure, resolves dependencies and builds a system graph. Every
            generated answer points back to a file, a line range and a reason.
          </p>

          <div className="mt-8 space-y-3.5">
            {[
              { icon: FileCode2, text: "Deterministic parsing before any model is involved." },
              {
                icon: Network,
                text: "Architecture, dependencies and blast radius as first-class views.",
              },
              {
                icon: ShieldCheck,
                text: "Repository content is untrusted input, never executable instructions.",
              },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-accent">
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-[0.9375rem] leading-relaxed text-muted">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-card border border-line bg-canvas p-5 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[0.75rem] uppercase tracking-[0.16em] text-faint">
                Answer contract
              </p>
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            </div>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
              “Refresh rotation revokes the whole token family on reuse.”
            </p>
            <p className="mt-2.5 font-mono text-[0.8125rem] text-accent">
              server/src/auth/refresh.ts:55–59
            </p>
          </div>
        </div>

        <p className="relative font-mono text-[0.75rem] uppercase tracking-[0.18em] text-faint">
          Learn the Code. Know the System.
        </p>
      </aside>

      <main id="main" className="flex flex-col">
        <div className="flex h-16 items-center justify-between border-b border-line px-5 lg:hidden">
          <Link href="/" className="focus-ring rounded-lg" aria-label="LeKnowde home">
            <Logo size={28} />
          </Link>
          <Link
            href="/"
            className="text-[0.875rem] text-muted transition-colors hover:text-ink"
          >
            Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
          <div className="w-full max-w-[26rem]">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-ink">
              {title}
            </h2>
            <p className="mt-2.5 text-base leading-relaxed text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer ? (
              <div className="mt-7 text-center text-[0.8125rem] leading-relaxed text-faint">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
