import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthShell
      title="Sign in to LeKnowde"
      subtitle="Continue to your workspaces, repositories and system maps."
      footer={
        <span>
          Protected by a signed session cookie. The API token never reaches browser JavaScript.
        </span>
      }
    >
      <LoginForm nextPath={params.next ?? "/app"} />
    </AuthShell>
  );
}
