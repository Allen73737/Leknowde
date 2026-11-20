import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email address on your account. The response is intentionally identical whether or not the account exists."
      footer={<span>Reset tokens expire after 45 minutes and can be used once.</span>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
