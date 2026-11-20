"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  Mail,
  Save,
  Settings2,
  Trash2,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, InlineNotice } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { apiClient, apiPatch } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import type { MeResponse, Workspace } from "@/lib/types";

type Feedback = { tone: "success" | "danger" | "neutral"; message: string } | null;

export function SettingsForms({ me, workspaces }: { me: MeResponse; workspaces: Workspace[] }) {
  const router = useRouter();

  const [name, setName] = useState(me.user.name);
  const [avatarURL, setAvatarURL] = useState(me.user.avatar_url);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);

  const [theme, setTheme] = useState<string>(me.preferences.theme || "dark");
  const [defaultWorkspace, setDefaultWorkspace] = useState(me.preferences.default_workspace_id || "");
  const [prefBusy, setPrefBusy] = useState(false);
  const [prefFeedback, setPrefFeedback] = useState<Feedback>(null);

  const [resetBusy, setResetBusy] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<Feedback>(null);
  const [devToken, setDevToken] = useState("");

  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback>(null);

  const org = "name" in me.organization ? me.organization.name : "No organization";

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileFeedback(null);
    try {
      await apiPatch("/users/me", { name: name.trim(), avatar_url: avatarURL.trim() });
      setProfileFeedback({ tone: "success", message: "Profile saved." });
      router.refresh();
    } catch (cause) {
      setProfileFeedback({
        tone: "danger",
        message: cause instanceof Error ? cause.message : "Could not save the profile.",
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    setPrefBusy(true);
    setPrefFeedback(null);
    try {
      await apiClient("/users/me/preferences", {
        method: "PUT",
        body: JSON.stringify({ theme, default_workspace_id: defaultWorkspace }),
      });
      if (theme === "light" || theme === "dark") {
        document.documentElement.setAttribute("data-theme", theme);
        window.localStorage.setItem("lk-theme", theme);
      } else {
        const resolved = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", resolved);
        window.localStorage.removeItem("lk-theme");
      }
      setPrefFeedback({ tone: "success", message: "Preferences saved. The header toggle still controls this browser." });
      router.refresh();
    } catch (cause) {
      setPrefFeedback({
        tone: "danger",
        message: cause instanceof Error ? cause.message : "Could not save preferences.",
      });
    } finally {
      setPrefBusy(false);
    }
  }

  async function sendReset() {
    setResetBusy(true);
    setResetFeedback(null);
    setDevToken("");
    try {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: me.user.email }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        dev_reset_token?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Could not start a password reset.");
      setDevToken(payload.dev_reset_token ?? "");
      setResetFeedback({
        tone: "success",
        message:
          payload.message ??
          "If the account exists, a reset token was generated. Email delivery is not configured in this build.",
      });
    } catch (cause) {
      setResetFeedback({
        tone: "danger",
        message: cause instanceof Error ? cause.message : "Could not start a password reset.",
      });
    } finally {
      setResetBusy(false);
    }
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    setDeleteBusy(true);
    setDeleteFeedback(null);
    try {
      await apiClient("/users/me", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: confirmText.trim(), password }),
      });
      await fetch("/api/session/logout", { method: "POST" }).catch(() => undefined);
      window.location.assign("/login?deleted=1");
    } catch (cause) {
      setDeleteFeedback({
        tone: "danger",
        message: cause instanceof Error ? cause.message : "Could not delete the account.",
      });
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Profile"
            description="Your display name and avatar. Email is the sign-in identity and cannot be changed here."
            icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
          />
          <form onSubmit={saveProfile} className="space-y-3 px-4 py-3.5">
            <Field label="Display name" htmlFor="profile-name">
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </Field>
            <Field
              label="Avatar URL"
              hint="Optional. Must be an absolute https URL; the image is not proxied or uploaded."
              htmlFor="profile-avatar"
            >
              <Input
                id="profile-avatar"
                value={avatarURL}
                onChange={(event) => setAvatarURL(event.target.value)}
                placeholder="https://…"
                className="font-mono text-xs"
              />
            </Field>
            <Field
              label="Email"
              htmlFor="profile-email"
              hint="The sign-in identity. It cannot be changed from this page."
            >
              <Input id="profile-email" value={me.user.email} readOnly disabled className="font-mono text-xs" />
            </Field>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="min-w-0 max-w-full truncate">
                <Badge>{org}</Badge>
              </span>
              <span className="font-mono text-[0.75rem] text-faint">
                member since {formatDateTime(me.user.created_at)}
              </span>
            </div>
            {profileFeedback ? (
              <InlineNotice tone={profileFeedback.tone === "success" ? "success" : "danger"}>
                {profileFeedback.message}
              </InlineNotice>
            ) : null}
            <Button type="submit" size="sm" loading={profileBusy} disabled={!name.trim()}>
              <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save profile
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Preferences"
            description="Stored on your account. The default workspace is a convenience selection, not an access grant."
            icon={<Settings2 className="h-4 w-4" aria-hidden="true" />}
          />
          <form onSubmit={savePreferences} className="space-y-3 px-4 py-3.5">
            <Field label="Preferred theme" htmlFor="pref-theme" hint="System follows this device's colour scheme.">
              <Select id="pref-theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </Select>
            </Field>
            <Field
              label="Default workspace"
              htmlFor="pref-workspace"
              hint="Used as the initial selection when browsing repositories."
            >
              <Select
                id="pref-workspace"
                value={defaultWorkspace}
                onChange={(event) => setDefaultWorkspace(event.target.value)}
              >
                <option value="">No default</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </Select>
            </Field>
            {prefFeedback ? (
              <InlineNotice tone={prefFeedback.tone === "success" ? "success" : "danger"}>
                {prefFeedback.message}
              </InlineNotice>
            ) : null}
            <Button type="submit" size="sm" loading={prefBusy}>
              <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save preferences
            </Button>
          </form>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Password"
            description="There is no authenticated password-change endpoint in this build. Use the reset flow."
            icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
          />
          <div className="space-y-3 px-4 py-3.5">
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              A reset token is generated for <span className="font-mono text-ink">{me.user.email}</span>. No email
              provider is configured, so development builds return the token here. In production, wire an email
              transport and remove the development-only response field.
            </p>
            {devToken ? (
              <InlineNotice tone="warning" title="Development reset token">
                <p className="break-all font-mono text-[0.75rem]">{devToken}</p>
                <Link
                  href={`/reset-password?token=${encodeURIComponent(devToken)}`}
                  className="mt-2 inline-block text-[0.8125rem] text-accent hover:underline"
                >
                  Continue to reset password →
                </Link>
              </InlineNotice>
            ) : null}
            {resetFeedback ? (
              <InlineNotice tone={resetFeedback.tone === "success" ? "success" : "danger"}>
                {resetFeedback.message}
              </InlineNotice>
            ) : null}
            <Button type="button" size="sm" variant="outline" loading={resetBusy} onClick={() => void sendReset()}>
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Generate reset token
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Session"
            description="Sessions are bearer tokens stored in an httpOnly cookie by the frontend."
            icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          />
          <div className="space-y-3 px-4 py-3.5">
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              Signing out clears the session cookie and records a logout in the audit log. Tokens are not refreshed
              automatically; when the session expires you are redirected to sign in again.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await fetch("/api/session/logout", { method: "POST" }).catch(() => undefined);
                window.location.assign("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </Card>
      </div>

      <Card className="border-danger/30">
        <CardHeader
          title="Delete account"
          description="Permanent. Provider tokens and reset tokens are revoked. Repositories in shared workspaces stay available to other members."
          icon={<Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />}
        />
        <form onSubmit={deleteAccount} className="space-y-3 px-4 py-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current password" htmlFor="delete-password">
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Field label="Type DELETE to confirm" htmlFor="delete-confirm">
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="DELETE"
                className="font-mono"
                required
              />
            </Field>
          </div>
          {deleteFeedback ? (
            <InlineNotice tone="danger">{deleteFeedback.message}</InlineNotice>
          ) : null}
          <Button
            type="submit"
            size="sm"
            variant="danger"
            loading={deleteBusy}
            disabled={confirmText.trim() !== "DELETE" || !password}
          >
            {deleteBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            Delete my account
          </Button>
        </form>
      </Card>
    </div>
  );
}
