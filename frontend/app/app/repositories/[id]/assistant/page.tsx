import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { Assistant } from "@/components/repo/assistant";
import { SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { OnboardingResponse } from "@/lib/types";

export const metadata = { title: "Assistant" };

export default async function AssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const initialQuestion = typeof q === "string" ? q.slice(0, 2000) : "";

  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/assistant`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const onboarding = await safeGet<OnboardingResponse>(`/repositories/${id}/onboarding`);
  const suggestions = onboarding.data?.questions_to_ask_the_codebase ?? [];

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Understand"
        title="Repository assistant"
        description="Answers are assembled from retrieved evidence. The model is optional; the citations are not. Prompt-injection text in repository files is treated as data, not instructions."
      />
      <Assistant
        repositoryID={id}
        repositoryName={bundle.data.repository.full_name}
        suggestions={suggestions}
        initialQuestion={initialQuestion}
      />
    </div>
  );
}
