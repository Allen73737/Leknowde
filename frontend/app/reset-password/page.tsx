import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Reset tokens are single-use and expire after 45 minutes."
      footer={<span>All existing sessions remain valid until they expire.</span>}
    >
      <ResetForm initialToken={params.token ?? ""} />
    </AuthShell>
  );
}
