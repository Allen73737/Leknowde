import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start with the bundled demo repository or connect a GitHub or GitLab project."
      footer={<span>Every account starts with a private default workspace.</span>}
    >
      <RegisterForm />
    </AuthShell>
  );
}
