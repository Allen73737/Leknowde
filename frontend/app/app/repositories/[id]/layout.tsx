import type { Metadata } from "next";

import { ApiErrorNote } from "@/components/app/error-note";
import { RepoHeader } from "@/components/repo/repo-header";
import { getRepositoryBundle, getRepositoryJobs } from "@/lib/app-data";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);
  return {
    title: bundle.data?.repository.full_name ?? "Repository",
    robots: { index: false, follow: false },
  };
}

export default async function RepositoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [bundle, jobs] = await Promise.all([getRepositoryBundle(id), getRepositoryJobs(id)]);

  if (!bundle.data) {
    return (
      <ApiErrorNote
        error={bundle.error}
        retryHref="/app/repositories"
        title="Repository unavailable"
      />
    );
  }

  const { repository, stats } = bundle.data;
  const latestJob = jobs.data?.jobs[0] ?? bundle.data.jobs[0];

  return (
    <div className="space-y-6">
      <RepoHeader repository={repository} stats={stats} latestJob={latestJob} />
      {children}
    </div>
  );
}
