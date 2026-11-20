"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineNotice } from "@/components/ui/card";
import { cn } from "@/lib/format";

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  return payload?.message ?? payload?.error ?? "The request could not be completed.";
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder = "At least 8 characters",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={8}
        required
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-faint transition-colors hover:bg-raised hover:text-ink"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      router.push(nextPath.startsWith("/app") ? nextPath : "/app");
      router.refresh();
    } catch {
      setError("The API is unreachable. Start the Go service on port 8080 and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <Field label="Email address" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@company.com"
          required
        />
      </Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="text-xs font-medium text-muted">
            Password
          </label>
          <Link href="/forgot-password" className="text-[0.8125rem] text-faint hover:text-accent">
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Your password"
        />
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <p className="text-center text-xs text-muted">
        New to LeKnowde?{" "}
        <Link href="/register" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accepted) {
      setError("Accept the terms and privacy notice to create an account.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/session/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("The API is unreachable. Start the Go service on port 8080 and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <Field label="Display name" htmlFor="name">
        <Input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          placeholder="Ada Lovelace"
        />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@company.com"
          required
        />
      </Field>
      <Field label="Password" htmlFor="password" hint="Minimum 8 characters. Hashed with bcrypt before storage.">
        <PasswordInput
          id="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
      </Field>
      <label className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-muted">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-line bg-surface accent-[var(--accent)]"
        />
        <span>
          I agree to the{" "}
          <Link href="/legal/terms" className="text-accent hover:underline">
            terms of service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-accent hover:underline">
            privacy notice
          </Link>
          .
        </span>
      </label>
      <Button type="submit" loading={loading} className={cn("w-full")}>
        Create account <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <p className="text-center text-xs text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [devToken, setDevToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setDevToken("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        dev_reset_token?: string;
        dev_note?: string;
      };
      if (!response.ok) {
        setError(payload.message ?? "The request could not be completed.");
        return;
      }
      setMessage(
        payload.message ??
          "If an account exists for that address, a reset link has been generated.",
      );
      if (payload.dev_reset_token) setDevToken(payload.dev_reset_token);
    } catch {
      setError("The API is unreachable. Start the Go service on port 8080 and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
      {devToken ? (
        <InlineNotice tone="warning" title="Development mode">
          Email delivery is not configured, so the API returned a reset token directly. It is shown only in
          development. Continue to{" "}
          <Link href={`/reset-password?token=${encodeURIComponent(devToken)}`} className="underline">
            reset your password
          </Link>
          .
        </InlineNotice>
      ) : null}
      <Field label="Email address" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        Send reset instructions
      </Button>
      <p className="text-center text-xs text-muted">
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetForm({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch {
      setError("The API is unreachable. Start the Go service on port 8080 and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <InlineNotice tone="success" title="Password updated">
        Your password has been changed. Redirecting to sign in…
      </InlineNotice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <Field label="Reset token" htmlFor="token" hint="Paste the token from the reset link or development notice.">
        <Input
          id="token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="one-time-code"
          required
        />
      </Field>
      <Field label="New password" htmlFor="password">
        <PasswordInput
          id="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <PasswordInput
          id="confirm"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          placeholder="Repeat the password"
        />
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        Set new password
      </Button>
    </form>
  );
}
