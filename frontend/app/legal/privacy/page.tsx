import type { Metadata } from "next";
import Link from "next/link";
import { Cpu, Database, Eye, KeyRound, Mail, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What LeKnowde stores, where it is stored, and what leaves the deployment.",
};

const sections = [
  {
    icon: Database,
    title: "Data the platform stores",
    body: [
      "Account data: email address, display name, optional avatar URL, a bcrypt password hash, and account creation and update timestamps.",
      "Workspace data: workspace names and descriptions, membership rows with roles, and the repositories connected to each workspace.",
      "Repository data: the source files fetched for the branch you index, extracted symbols, graph edges, analysis findings, generated documents, conversations and messages.",
      "Operational data: indexing jobs and logs, notifications, audit events, provider account logins and token scopes.",
    ],
  },
  {
    icon: KeyRound,
    title: "Credentials",
    body: [
      "Provider access tokens are encrypted with AES-256-GCM before they are written to the database. The API never returns the stored secret.",
      "The session token is held in an httpOnly, same-site cookie by the Next.js frontend. It is not readable from client JavaScript and is not written to local storage.",
      "Password reset tokens are stored as hashes and expire after 45 minutes. No email transport is configured in this build, so development installs return the token in the response.",
    ],
  },
  {
    icon: Cpu,
    title: "When a model provider is used",
    body: [
      "Retrieval and deterministic analysis run inside your deployment. No repository content is sent anywhere for those steps.",
      "If you configure Groq, Gemini or a LiteLLM gateway, the assistant sends the question and a bounded set of retrieved file snippets, paths and line ranges to that provider to produce prose. The snippets may contain your source code.",
      "Without a configured provider, the assistant returns retrieved evidence and declines to generate an answer. Nothing is sent to a third party.",
      "Provider terms, retention and training policies are those of the provider you choose. Do not enable a provider for code you are not permitted to send to it.",
    ],
  },
  {
    icon: Server,
    title: "Where data lives",
    body: [
      "This is a self-hosted application. PostgreSQL (or the bundled SQLite mode) is the system of record. Neo4j and Redis are optional adapters and are not required for local operation.",
      "The operator of this installation — not LeKnowde as a hosted service — controls the database, backups, network access and retention.",
      "There is no product analytics, advertising pixel, session recording or third-party tracking script in the frontend. The only cookies are the session cookie and a browser-local theme preference.",
    ],
  },
  {
    icon: Eye,
    title: "Retention and deletion",
    body: [
      "Repositories, documents, conversations, jobs and notifications remain until the owning workspace member deletes them or the database is removed.",
      "Deleting an account is a soft delete: the account is anonymized, provider tokens and reset tokens are revoked, and sign-in stops. Audit rows remain so the organization keeps its operational history.",
      "Audit logs have no automatic expiry in this build. Configure a retention policy appropriate to your organization.",
      "Backups are entirely under the operator's control; the application does not manage them.",
    ],
  },
  {
    icon: Mail,
    title: "Your choices",
    body: [
      "You can export or erase installation data through the database operator. The application does not include a self-service data export.",
      "Workspace administrators can remove members. Account holders can delete their own account from Settings.",
      "Privacy requests should go to the operator of this deployment. Replace this template with contact details and a jurisdiction-specific policy before production use.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <article className="space-y-8">
      <header>
        <p className="eyebrow">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-ink">Privacy policy</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          A plain description of the data this self-hosted platform handles. It is written to match the implementation,
          not to describe a hypothetical hosted service.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>template · review before production</Badge>
          <Badge>last updated 14 November 2026</Badge>
        </div>
      </header>

      <div className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-[0.8125rem] leading-relaxed text-warning">
        This policy is a starting template. It is not legal advice. An operator deploying LeKnowde must add its legal
        entity, contact address, governing jurisdiction and any regional disclosures before relying on it.
      </div>

      <div className="space-y-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.title}>
              <CardHeader title={section.title} icon={<Icon className="h-4 w-4" aria-hidden="true" />} />
              <div className="space-y-2.5 px-5 py-4">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-[0.9375rem] leading-relaxed text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <footer className="border-t border-line pt-6 text-xs text-muted">
        <p>
          Questions about this deployment should go to its operator. See also the{" "}
          <Link href="/legal/terms" className="text-accent hover:underline">
            terms of use
          </Link>
          .
        </p>
      </footer>
    </article>
  );
}
