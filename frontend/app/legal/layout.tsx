import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
