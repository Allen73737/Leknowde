"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { DemoConnectButton } from "@/components/repo/demo-connect-button";
import { StatusBadge } from "@/components/repo/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { apiDelete, apiPatch, apiPost } from "@/lib/client-api";
import { formatDate, plural } from "@/lib/format";
import type { Member, Repository, Workspace } from "@/lib/types";

export interface WorkspaceBundle {
  workspace: Workspace;
  repositories: Repository[];
  members: Member[];
  error?: string;
}

export function WorkspaceManager({ initial }: { initial: WorkspaceBundle[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(initial.length === 0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setNotice("");
    try {
      await apiPost<Workspace>("/workspaces", { name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      setNotice("Workspace created.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the workspace.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted">
          {initial.length === 0
            ? "No workspaces yet."
            : `${plural(initial.length, "workspace")} in this organization.`}
        </p>
        <Button
          type="button"
          size="sm"
          variant={showCreate ? "ghost" : "secondary"}
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          {showCreate ? "Close" : "New workspace"}
        </Button>
      </div>

      {showCreate ? (
        <Card>
          <form onSubmit={createWorkspace} className="p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-shell text-accent">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">
                Create a workspace
              </h2>
            </div>
            <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
              Workspaces isolate repositories and members. Repository access is checked against membership on every
              request, including graph and chat endpoints.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
              <Field label="Name" htmlFor="workspace-name">
                <Input
                  id="workspace-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Platform engineering"
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="Description" htmlFor="workspace-description" hint="Optional. Describe the system boundary.">
                <Input
                  id="workspace-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Services powering the customer console"
                  maxLength={240}
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              <Button type="submit" loading={creating} disabled={!name.trim()}>
                Create workspace
              </Button>
            </div>
            {error ? <p className="mt-3 text-[0.8125rem] text-danger">{error}</p> : null}
            {notice ? <p className="mt-3 text-[0.8125rem] text-success">{notice}</p> : null}
          </form>
        </Card>
      ) : null}

      {initial.length === 0 ? (
        <Card className="px-5 py-14 text-center">
          <Boxes className="mx-auto h-6 w-6 text-faint" aria-hidden="true" />
          <h2 className="mt-3 font-display text-xl font-semibold text-ink">No workspaces yet</h2>
          <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
            Create a workspace above. Your account normally starts with one; if it is missing, this form recreates the
            boundary before you connect a repository.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {initial.map((bundle) => (
            <WorkspaceCard key={bundle.workspace.id} bundle={bundle} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceCard({ bundle }: { bundle: WorkspaceBundle }) {
  const router = useRouter();
  const { workspace, repositories, members } = bundle;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManage = workspace.role === "owner" || workspace.role === "admin";

  async function saveWorkspace() {
    setBusy("save");
    setError("");
    try {
      await apiPatch(`/workspaces/${workspace.id}`, { name: name.trim(), description: description.trim() });
      setEditing(false);
      setNotice("Workspace updated.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the workspace.");
    } finally {
      setBusy("");
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy("invite");
    setError("");
    setNotice("");
    try {
      await apiPost(`/workspaces/${workspace.id}/members`, { email: email.trim(), role });
      setEmail("");
      setNotice("Member added. They must already have a LeKnowde account.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the member.");
    } finally {
      setBusy("");
    }
  }

  async function removeMember(member: Member) {
    setBusy(member.user_id);
    setError("");
    try {
      await apiDelete(`/workspaces/${workspace.id}/members/${member.user_id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the member.");
    } finally {
      setBusy("");
    }
  }

  async function deleteWorkspace() {
    if (!window.confirm(`Delete "${workspace.name}"? Repositories in this workspace will no longer be accessible.`)) return;
    setBusy("delete");
    setError("");
    try {
      await apiDelete(`/workspaces/${workspace.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the workspace.");
      setBusy("");
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-xl font-semibold tracking-[-0.01em] text-ink">
              {workspace.name}
            </h2>
            <Badge tone={workspace.role === "owner" ? "accent" : "neutral"}>{workspace.role}</Badge>
          </div>
          <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
            {workspace.description || "No description provided."}
          </p>
          <p className="mt-2 text-[0.75rem] text-faint">
            {plural(workspace.repository_count, "repository", "repositories")} ·{" "}
            {plural(workspace.member_count, "member")} · created {formatDate(workspace.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/app/repositories?workspace=${workspace.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-raised px-3.5 text-[0.875rem] text-ink transition-colors hover:border-line-strong"
          >
            <FileCode2 className="h-4 w-4" aria-hidden="true" /> Repositories
          </Link>
          {canManage ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing((value) => !value)}>
              Edit
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Members
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="border-b border-line bg-canvas px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <Field label="Name" htmlFor={`name-${workspace.id}`}>
              <Input id={`name-${workspace.id}`} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Description" htmlFor={`description-${workspace.id}`}>
              <Input
                id={`description-${workspace.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Button type="button" size="sm" loading={busy === "save"} onClick={saveWorkspace} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-faint" aria-hidden="true" />
            <h3 className="text-[0.9375rem] font-semibold text-ink">Members</h3>
            <Badge>{members.length}</Badge>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {members.map((member) => (
              <li key={member.user_id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.9375rem] text-ink">{member.name}</p>
                  <p className="truncate font-mono text-[0.75rem] text-faint">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={member.role === "owner" ? "accent" : "neutral"}>{member.role}</Badge>
                  {canManage && member.role !== "owner" ? (
                    <button
                      type="button"
                      onClick={() => removeMember(member)}
                      disabled={busy === member.user_id}
                      className="rounded p-1 text-faint hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      aria-label={`Remove ${member.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {canManage ? (
            <form onSubmit={invite} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Field label="Add existing account" htmlFor={`invite-${workspace.id}`}>
                <Input
                  id={`invite-${workspace.id}`}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="teammate@example.com"
                  required
                />
              </Field>
              <Field label="Role" htmlFor={`role-${workspace.id}`}>
                <Select id={`role-${workspace.id}`} value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </Select>
              </Field>
              <Button type="submit" size="sm" variant="secondary" loading={busy === "invite"} disabled={!email.trim()}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add
              </Button>
            </form>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-[0.8125rem] text-faint">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Only owners and admins can manage members.
            </p>
          )}
        </div>
      ) : null}

      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[0.9375rem] font-semibold text-ink">Repositories</h3>
          <Link
            href={`/app/repositories?workspace=${workspace.id}`}
            className="inline-flex items-center gap-1.5 text-[0.875rem] font-medium text-accent transition-colors hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Connect
          </Link>
        </div>
        {repositories.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-line px-4 py-8 text-center">
            <p className="text-[0.875rem] text-muted">No repositories in this workspace.</p>
            <div className="mt-3 flex justify-center">
              <DemoConnectButton workspaceID={workspace.id} size="sm" label="Connect demo" />
            </div>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {repositories.map((repo) => (
              <li key={repo.id}>
                <Link
                  href={`/app/repositories/${repo.id}`}
                  className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-ink"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[0.875rem] text-ink">{repo.full_name}</span>
                    <span className="mt-1 block text-[0.8125rem] text-faint">
                      {plural(repo.file_count, "file")} · {plural(repo.symbol_count, "symbol")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {repo.is_demo ? <Badge tone="warning">demo</Badge> : null}
                    <StatusBadge status={repo.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error || notice ? (
        <div className="border-t border-line px-5 py-3">
          {error ? <p className="text-[0.8125rem] text-danger">{error}</p> : <p className="text-[0.8125rem] text-success">{notice}</p>}
        </div>
      ) : null}

      {workspace.role === "owner" ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[0.75rem] leading-relaxed text-faint">
            Deleting a workspace soft-deletes it and hides its repositories for every member.
          </p>
          <Button
            type="button"
            size="sm"
            variant="danger"
            loading={busy === "delete"}
            onClick={deleteWorkspace}
            disabled={busy !== ""}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
