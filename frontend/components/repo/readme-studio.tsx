"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileText,
  Info,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { apiClient, apiPost, apiPut } from "@/lib/client-api";
import { isApiError } from "@/lib/api-error";
import { cn } from "@/lib/format";
import type { AboutMetadata, ReadmeResponse, SaveAboutResponse, SaveReadmeResponse } from "@/lib/types";

const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Mirror of the server's GitHub topic rules so the editor fails fast. */
function normaliseTopic(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned;
}

function topicProblem(topic: string, existing: string[]): string {
  if (!topic) return "Topics need at least two letters or numbers.";
  if (topic.length > 35) return "GitHub topics are capped at 35 characters here.";
  if (!TOPIC_PATTERN.test(topic)) return "Use lowercase letters, numbers and hyphens only.";
  if (existing.includes(topic)) return "That topic is already in the list.";
  return "";
}

export function ReadmeStudio({ repositoryID, initial }: { repositoryID: string; initial: ReadmeResponse }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [description, setDescription] = useState(initial.about.description);
  const [topics, setTopics] = useState(initial.about.topics);
  const [draftTopic, setDraftTopic] = useState("");
  const [topicError, setTopicError] = useState("");
  const [view, setView] = useState<"preview" | "raw">("preview");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [conflict, setConflict] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const aboutDirty =
    description !== data.about.description ||
    topics.length !== data.about.topics.length ||
    topics.some((topic, index) => topic !== data.about.topics[index]);

  function adoptAbout(about: AboutMetadata) {
    setData((current) => ({ ...current, about }));
    setDescription(about.description);
    setTopics(about.topics);
  }

  async function reload(silent = false, generatedOnly = false) {
    if (!silent && aboutDirty && !window.confirm("Regenerating replaces the unsaved About edits with saved values. Continue?")) {
      return;
    }
    setBusy("reload");
    if (!silent) {
      setError("");
      setNotice("");
    }
    try {
      const fresh = await apiClient<ReadmeResponse>(
        `/repositories/${repositoryID}/readme${generatedOnly ? "?source=generated" : ""}`,
      );
      setData(fresh);
      adoptAbout(fresh.about);
      if (!silent) {
        setNotice(
          generatedOnly
            ? "Restored the generated About panel in this draft. Save About to persist it."
            : "Draft regenerated from the current index.",
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not regenerate the draft.");
    } finally {
      setBusy("");
    }
  }

  async function saveAbout() {
    setBusy("about");
    setError("");
    setNotice("");
    if (description.length > data.max_description) {
      setError(`The description is ${description.length} characters. GitHub allows ${data.max_description}.`);
      setBusy("");
      return;
    }
    try {
      const saved = await apiPut<SaveAboutResponse>(`/repositories/${repositoryID}/about`, {
        description,
        topics,
      });
      setData((current) => ({
        ...current,
        about: { ...current.about, description: saved.description, topics: saved.topics, source: "saved" },
      }));
      setNotice("About metadata saved and the README draft was refreshed with it.");
      await reload(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the About metadata.");
    } finally {
      setBusy("");
    }
  }

  async function saveReadme(overwrite = false) {
    setBusy("readme");
    setError("");
    setNotice("");
    try {
      const result = await apiPost<SaveReadmeResponse>(`/repositories/${repositoryID}/readme`, {
        overwrite,
        markdown: data.markdown,
      });
      setConflict(false);
      setData((current) => ({ ...current, saved_document_id: result.document.id }));
      setNotice(
        `README saved to Documentation as "${result.document.title}" (status: ${result.document.status}). Review and publish it there.`,
      );
      router.refresh();
    } catch (cause) {
      if (isApiError(cause) && cause.status === 409) {
        setConflict(true);
        setError(cause.message);
      } else {
        setError(cause instanceof Error ? cause.message : "Could not save the README.");
      }
    } finally {
      setBusy("");
    }
  }

  function addTopic() {
    const topic = normaliseTopic(draftTopic);
    const problem = topicProblem(topic, topics);
    if (problem) {
      setTopicError(problem);
      return;
    }
    if (topics.length >= data.max_topics) {
      setTopicError(`GitHub allows at most ${data.max_topics} topics. Remove one first.`);
      return;
    }
    setTopics([...topics, topic]);
    setDraftTopic("");
    setTopicError("");
  }

  function removeTopic(topic: string) {
    setTopics(topics.filter((item) => item !== topic));
    setTopicError("");
  }

  async function copyMarkdown() {
    const text = data.markdown;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  function downloadMarkdown() {
    const blob = new Blob([data.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "README.md";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="GitHub About"
            description="Description and topics for the repository sidebar."
            icon={<Info className="h-3.5 w-3.5" aria-hidden="true" />}
            action={
              <Badge tone={data.about.source === "saved" ? "accent" : "neutral"}>
                {data.about.source === "saved" ? "saved" : "generated"}
              </Badge>
            }
          />
          <div className="space-y-4 px-4 py-4">
            <label className="block">
              <span className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[0.8125rem] font-medium text-ink">Description</span>
                <span
                  className={cn(
                    "tabular text-[0.75rem]",
                    description.length > data.max_description ? "text-danger" : "text-faint",
                  )}
                >
                  {description.length}/{data.max_description}
                </span>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                spellCheck
                className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-[0.8125rem] leading-relaxed text-ink focus:border-accent focus:outline-none"
                placeholder="One sentence describing what the repository does."
              />
            </label>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[0.8125rem] font-medium text-ink">Topics</span>
                <span className="tabular text-[0.75rem] text-faint">
                  {topics.length}/{data.max_topics}
                </span>
              </div>
              {topics.length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-3 py-3 text-[0.75rem] leading-relaxed text-faint">
                  No topics yet. Add up to {data.max_topics} lowercase topics so the repository is discoverable.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {topics.map((topic) => (
                    <li key={topic}>
                      <span className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-raised pl-2.5 pr-1 text-[0.75rem] font-medium text-ink">
                        {topic}
                        <button
                          type="button"
                          onClick={() => removeTopic(topic)}
                          aria-label={`Remove topic ${topic}`}
                          className="grid h-5 w-5 place-items-center rounded text-faint transition-colors duration-150 hover:bg-surface hover:text-danger"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex gap-1.5">
                <input
                  value={draftTopic}
                  onChange={(event) => {
                    setDraftTopic(event.target.value);
                    setTopicError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTopic();
                    }
                  }}
                  placeholder="add-topic"
                  aria-label="Add a topic"
                  className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 font-mono text-[0.75rem] text-ink focus:border-accent focus:outline-none"
                />
                <Button type="button" size="sm" variant="secondary" onClick={addTopic} disabled={!draftTopic.trim()}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                </Button>
              </div>
              {topicError ? <p className="mt-1.5 text-[0.75rem] text-danger">{topicError}</p> : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={saveAbout}
                loading={busy === "about"}
                disabled={Boolean(busy) || !aboutDirty}
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save About
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => reload()}
                loading={busy === "reload"}
                disabled={Boolean(busy)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Regenerate
              </Button>
              {data.about.source === "saved" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => reload(false, true)}
                  disabled={Boolean(busy)}
                >
                  Reset to generated
                </Button>
              ) : null}
            </div>
            {aboutDirty ? (
              <p className="text-[0.75rem] leading-relaxed text-warning">
                Unsaved edits. The README draft keeps the last saved About panel until you save and regenerate.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Evidence used" description="Read from the index for this branch." />
          <dl className="divide-y divide-line text-[0.75rem]">
            <div className="flex items-start justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted">Source fingerprint</dt>
              <dd className="font-mono text-ink">
                {data.source_fingerprint ? data.source_fingerprint.slice(0, 12) : "none"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted">Existing README</dt>
              <dd className="font-mono text-ink">{data.has_readme ? "found" : "not found"}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted">Licence file</dt>
              <dd className="max-w-[60%] break-all text-right font-mono text-ink">
                {data.license_file || "not found"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted">Manifests</dt>
              <dd className="max-w-[60%] break-all text-right font-mono text-ink">
                {data.manifests.length > 0 ? data.manifests.join(", ") : "none"}
              </dd>
            </div>
          </dl>
          {data.about.limits.length > 0 ? (
            <div className="border-t border-line px-4 py-3">
              <p className="text-[0.75rem] font-medium text-ink">Limits and caveats</p>
              <ul className="mt-1.5 space-y-1.5">
                {data.about.limits.map((limit) => (
                  <li key={limit} className="flex gap-1.5 text-[0.75rem] leading-relaxed text-muted">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
                    <span>{limit}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader
          title="README.md"
          description="Deterministic draft assembled from indexed structure. No model provider is contacted."
          icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
          action={
            <div
              role="group"
              aria-label="README view"
              className="flex items-center gap-0.5 rounded-md border border-line bg-shell p-0.5"
            >
              {(["preview", "raw"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  className={cn(
                    "h-7 rounded px-2.5 font-mono text-[0.75rem] capitalize transition-colors duration-150",
                    view === mode ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
          <Button type="button" size="sm" onClick={() => saveReadme()} loading={busy === "readme"} disabled={Boolean(busy)}>
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {data.saved_document_id ? "Update stored README" : "Save to Documentation"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={copyMarkdown}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={downloadMarkdown}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download .md
          </Button>
          <span className="ml-auto tabular text-[0.75rem] text-faint">
            {data.markdown.split("\n").length} lines · {data.markdown.length.toLocaleString()} chars
          </span>
        </div>

        {error ? (
          <div className="mx-4 mt-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2">
            <p className="text-[0.8125rem] text-danger">{error}</p>
            {conflict ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                className="mt-2"
                loading={busy === "readme"}
                onClick={() => saveReadme(true)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Overwrite stored README
              </Button>
            ) : null}
          </div>
        ) : null}
        {notice ? (
          <p className="mx-4 mt-3 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-[0.8125rem] leading-relaxed text-success">
            {notice}
          </p>
        ) : null}

        <div className="max-h-[calc(100vh-14rem)] min-h-[440px] overflow-y-auto overscroll-contain px-4 py-5">
          {view === "preview" ? (
            <Markdown content={data.markdown} />
          ) : (
            <pre className="overflow-x-auto rounded-md border border-line bg-shell p-3 font-mono text-[0.75rem] leading-relaxed text-ink">
              {data.markdown}
            </pre>
          )}
        </div>
      </Card>
    </div>
  );
}
