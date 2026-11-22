"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  MessageSquare,
  MessageSquarePlus,
  ShieldQuestion,
} from "lucide-react";

import { LogoLoader } from "@/components/brand/logo-loader";
import { EvidencePanel } from "@/components/evidence/evidence-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/field";
import { apiClient, apiPost } from "@/lib/client-api";
import { cn, relativeTime } from "@/lib/format";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import type { ChatResponse, Conversation, Evidence, MessagesResponse, Symbol } from "@/lib/types";

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence: Evidence[];
  symbols?: Symbol[];
  uncertainty?: string;
  notice?: string;
  confidence?: string;
  model?: string;
  provider?: string;
  strategy?: string;
  candidates?: number;
  created_at: string;
}

const confidenceTone: Record<string, "success" | "accent" | "warning" | "danger"> = {
  high: "success",
  medium: "accent",
  low: "warning",
  insufficient: "danger",
};

export function Assistant({
  repositoryID,
  repositoryName,
  suggestions,
  initialQuestion = "",
}: {
  repositoryID: string;
  repositoryName: string;
  suggestions: string[];
  initialQuestion?: string;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationID, setConversationID] = useState<string>("");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [question, setQuestion] = useState(initialQuestion);
  const [asking, setAsking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    void refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryID]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [messages, asking, reduce]);

  async function refreshConversations() {
    try {
      const result = await apiClient<{ conversations: Conversation[] }>(`/repositories/${repositoryID}/conversations`);
      setConversations(result.conversations ?? []);
    } catch {
      // Conversation history is optional; the chat endpoint can start a new one.
    }
  }

  async function openConversation(conversation: Conversation) {
    setConversationID(conversation.id);
    setLoadingHistory(true);
    setError("");
    try {
      const result = await apiClient<MessagesResponse>(`/conversations/${conversation.id}/messages`);
      setMessages(
        (result.messages ?? []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          evidence: message.evidence ?? [],
          uncertainty: message.uncertainty,
          model: message.model,
          created_at: message.created_at,
        })),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this conversation.");
    } finally {
      setLoadingHistory(false);
    }
  }

  function newConversation() {
    setConversationID("");
    setMessages([]);
    setError("");
    setQuestion("");
  }

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || asking) return;

    const optimistic: LocalMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      evidence: [],
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setQuestion("");
    setAsking(true);
    setError("");

    try {
      const response = await apiPost<ChatResponse>(`/repositories/${repositoryID}/chat`, {
        question: text,
        conversation_id: conversationID || undefined,
      });
      setConversationID(response.conversation_id);
      const assistant: LocalMessage = {
        id: `answer-${Date.now()}`,
        role: "assistant",
        content: response.answer || "",
        evidence: response.evidence ?? [],
        symbols: response.symbols ?? [],
        uncertainty: response.uncertainty,
        notice: response.notice,
        confidence: response.confidence,
        model: response.model,
        provider: response.provider,
        strategy: response.strategy,
        candidates: response.candidates,
        created_at: new Date().toISOString(),
      };
      setMessages((current) => [...current, assistant]);
      void refreshConversations();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assistant request failed.");
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setQuestion(text);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-card border border-line bg-surface shadow-card lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100vh-7rem)] lg:flex-col lg:self-start">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-3.5 py-2.5">
          <p className="text-[0.75rem] font-medium text-faint">
            Conversations
          </p>
          <button
            type="button"
            onClick={newConversation}
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-raised hover:text-ink"
            aria-label="New conversation"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-1.5 lg:max-h-none lg:min-h-0 lg:flex-1">
          <button
            type="button"
            onClick={newConversation}
            className={cn(
              "mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] font-medium transition-colors",
              conversationID === "" ? "bg-raised text-ink" : "text-muted hover:bg-raised/60 hover:text-ink",
            )}
          >
            <MessageSquarePlus className="h-3.5 w-3.5 text-faint" aria-hidden="true" /> New question
          </button>
          {conversations.length === 0 ? (
            <p className="px-2.5 py-4 text-[0.8125rem] text-faint">No saved conversations yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(conversation)}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-2.5 text-left transition-colors",
                      conversationID === conversation.id ? "bg-raised" : "hover:bg-raised/60",
                    )}
                  >
                    <span className="line-clamp-2 text-[0.875rem] leading-snug text-ink">
                      {conversation.title}
                    </span>
                    <span className="mt-1 block font-mono text-[0.75rem] text-faint">
                      {relativeTime(conversation.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold text-ink">Ask about {repositoryName}</p>
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-faint">
              Citations are limited to retrieved files. The model receives fenced evidence, never repository
              instructions.
            </p>
          </div>
          <Badge>retrieval</Badge>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {loadingHistory ? (
            <p className="flex items-center gap-2.5 text-[0.875rem] text-faint">
              <LogoLoader size={18} decorative /> Loading conversation…
            </p>
          ) : messages.length === 0 ? (
            <div className="mx-auto max-w-xl py-3 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-canvas text-faint">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
              </div>
              <h2 className="mt-3 font-display text-base font-semibold tracking-[-0.01em] text-ink">
                Ask about this repository
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-[0.875rem] leading-relaxed text-muted">
                Answers cite indexed files and line ranges. With no provider configured, retrieval still returns
                evidence and the assistant declines to generate prose.
              </p>
              {suggestions.length > 0 ? (
                <div className="mt-5 grid gap-1.5 text-left sm:grid-cols-2">
                  {suggestions.slice(0, 4).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setQuestion(suggestion)}
                      className="flex items-start gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-left text-[0.8125rem] leading-snug text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
                    >
                      <MessageSquare
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint"
                        aria-hidden="true"
                      />
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg border border-line bg-raised px-4 py-3">
                    <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">{message.content}</p>
                  </div>
                </div>
              ) : (
                <div key={message.id} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={message.notice ? "warning" : "accent"}>
                      {message.notice ? "evidence only" : "assistant"}
                    </Badge>
                    {message.confidence ? (
                      <Badge tone={confidenceTone[message.confidence] ?? "neutral"}>
                        confidence: {message.confidence}
                      </Badge>
                    ) : null}
                    {message.model ? <Badge>{message.model}</Badge> : null}
                    {message.strategy ? <Badge>{message.strategy}</Badge> : null}
                  </div>

                  {message.notice ? (
                    <div className="rounded-md border border-warning/40 bg-warning/5 px-3.5 py-3">
                      <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-warning">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {message.notice}
                      </p>
                    </div>
                  ) : message.content ? (
                    <Markdown content={message.content} />
                  ) : null}

                  {message.uncertainty ? (
                    <p className="flex items-start gap-2 rounded border border-line bg-canvas px-3 py-2 text-[0.75rem] leading-relaxed text-muted">
                      <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                      {message.uncertainty}
                    </p>
                  ) : null}

                  <EvidencePanel evidence={message.evidence} repositoryID={repositoryID} />
                  {message.symbols && message.symbols.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {message.symbols.slice(0, 8).map((symbol) => (
                        <Badge key={symbol.id}>{symbol.qualified_name || symbol.name}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            )
          )}

          {asking ? (
            <div className="flex items-center gap-2.5 rounded-md border border-line bg-canvas px-3 py-2 text-[0.8125rem] text-faint">
              <LogoLoader size={18} decorative /> Retrieving evidence, then asking the configured provider…
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="border-t border-line px-4 py-2.5 text-[0.8125rem] text-danger">{error}</p>
        ) : null}

        <form onSubmit={ask} className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              placeholder="Where is refresh-token rotation implemented, and what could break?"
              className="min-h-[56px] flex-1 resize-none text-[0.9375rem]"
              aria-label="Question about this repository"
            />
            <Button type="submit" size="md" loading={asking} disabled={!question.trim() || asking} aria-label="Send question">
              <ArrowUp className="h-4 w-4" aria-hidden="true" /> Ask
            </Button>
          </div>
          <p className="mt-2 text-[0.75rem] text-faint">
            Enter sends · Shift+Enter adds a line · answers are not guaranteed to be correct
          </p>
        </form>
      </div>
    </div>
  );
}
