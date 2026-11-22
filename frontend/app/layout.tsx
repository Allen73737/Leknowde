import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope, Sora } from "next/font/google";

import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
  weight: ["300", "400", "500", "600", "700"],
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "LeKnowde — Learn the Code. Know the System.",
    template: "%s · LeKnowde",
  },
  description:
    "LeKnowde turns a repository into a navigable system map: evidence-backed answers, architecture graphs, change-impact analysis and living documentation.",
  applicationName: "LeKnowde",
  keywords: [
    "software intelligence",
    "codebase understanding",
    "architecture graph",
    "change impact analysis",
    "living documentation",
    "developer onboarding",
  ],
  authors: [{ name: "LeKnowde" }],
  openGraph: {
    title: "LeKnowde — Learn the Code. Know the System.",
    description:
      "Evidence-backed AI for understanding unfamiliar codebases. Every answer points back to a file and line.",
    type: "website",
    siteName: "LeKnowde",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeKnowde — Learn the Code. Know the System.",
    description: "Evidence-backed software intelligence for real repositories.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141918" },
    { media: "(prefers-color-scheme: light)", color: "#EAEDE7" },
  ],
  width: "device-width",
  initialScale: 1,
};

const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('lk-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${sora.variable} ${manrope.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
