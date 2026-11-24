import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { SymbolTable } from "@/components/repo/symbol-table";
import { SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { Symbol } from "@/lib/types";

export const metadata = { title: "Symbols" };

export default async function SymbolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/symbols`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<{ symbols: Symbol[]; count: number }>(`/repositories/${id}/symbols?limit=1000`);
  if (!result.data) {
    return <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/symbols`} title="Symbols unavailable" />;
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Symbols"
        description="Functions, classes, interfaces and components extracted by the parser. Names and line ranges are deterministic; doc comments come from source."
      />
      <SymbolTable repositoryID={id} symbols={result.data.symbols} total={result.data.count} />
    </div>
  );
}
