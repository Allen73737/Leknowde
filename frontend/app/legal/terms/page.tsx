import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Bot, Copyright, Scale, Server, ShieldAlert, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for this LeKnowde deployment.",
};

const sections = [
  {
    icon: BookOpen,
    title: "1. Agreement",
    body: [
      "These terms govern use of this LeKnowde installation. By creating an account or using the interface you agree to them. If you use LeKnowde on behalf of an organization, you confirm you are authorized to do so.",
      "The operator of this deployment may replace these terms. Continued use after a change means you accept the updated version.",
    ],
  },
  {
    icon: Server,
    title: "2. What the service is",
    body: [
      "LeKnowde indexes a repository you are authorized to access, derives deterministic structural facts, and presents them through exploration, graphs, impact analysis, health findings, documentation generation and a retrieval-grounded assistant.",
      "It does not execute repository code, run tests, deploy software or guarantee that an analysis is complete. It is a reading and analysis aid.",
      "This build has no billing, no hosted multi-tenant service, and no email delivery. Features described on the marketing pages remain subject to what is actually implemented in the running version.",
    ],
  },
  {
    icon: UserRound,
    title: "3. Accounts and access",
    body: [
      "You must provide a valid email address and keep your password confidential. You are responsible for activity under your account.",
      "Workspace roles control access. Do not share credentials or attempt to reach a workspace, repository or audit record you have not been granted.",
      "The operator may suspend an account that threatens the security or availability of the deployment.",
    ],
  },
  {
    icon: ShieldAlert,
    title: "4. Acceptable use",
    body: [
      "Connect only repositories you own or are permitted to analyze. Do not index code you have no right to process.",
      "Do not use the platform to distribute malware, attempt to escape the analysis sandbox, attack the host, overload the API, or probe other tenants.",
      "Do not attempt to extract provider tokens, password hashes or other users' data. Report a suspected vulnerability to the operator rather than exploiting it.",
    ],
  },
  {
    icon: Copyright,
    title: "5. Your code and content",
    body: [
      "You retain all rights to the repositories and content you connect. You grant the operator only the permission needed to fetch, store and analyze that content for your workspace.",
      "Generated documents and analysis reports are derived from your code. You are responsible for reviewing them before relying on or publishing them.",
      "The LeKnowde name, interface and original source code remain the property of their respective authors. Third-party dependencies keep their own licences.",
    ],
  },
  {
    icon: Bot,
    title: "6. AI output is not guaranteed",
    body: [
      "When a model provider is configured, assistant answers are probabilistic prose grounded in retrieved snippets. Citations can be incomplete, and prose can still be wrong even when the cited lines are real.",
      "Risk scores, health grades and impact estimates are transparent heuristics, not professional security, legal, financial or architectural advice.",
      "You must review important decisions yourself. Do not treat an answer, score or generated document as a verification result.",
    ],
  },
  {
    icon: Scale,
    title: "7. Availability, warranty and liability",
    body: [
      "This is self-hosted software provided as-is, without a service-level agreement, uptime commitment or support obligation unless the operator has agreed otherwise in writing.",
      "To the maximum extent permitted by law, the operator disclaims implied warranties of merchantability, fitness for a particular purpose and non-infringement.",
      "To the maximum extent permitted by law, the operator is not liable for indirect, incidental or consequential loss, loss of data, loss of profit, or decisions made from generated analysis.",
      "Nothing here limits liability that cannot lawfully be limited. Replace this section with terms reviewed for your jurisdiction before production use.",
    ],
  },
  {
    icon: ShieldAlert,
    title: "8. Termination and changes",
    body: [
      "You may stop using the service and delete your account at any time from Settings. The operator may remove content or suspend access for a material breach of these terms.",
      "On termination, access ends. Repositories in shared workspaces may remain available to other members. Audit rows may be retained as described in the privacy policy.",
      "The operator may change, pause or remove features. Material changes should be communicated through the deployment's normal channel.",
    ],
  },
];

export default function TermsPage() {
  return (
    <article className="space-y-8">
      <header>
        <p className="eyebrow">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-ink">Terms of use</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The rules for using this LeKnowde deployment, including its limits. Written to be read alongside the actual
          behaviour of the software.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>template · review before production</Badge>
          <Badge>last updated 14 November 2026</Badge>
        </div>
      </header>

      <div className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-[0.8125rem] leading-relaxed text-warning">
        This document is a template, not legal advice. The operator must insert its legal entity, governing law,
        contact details and any mandatory consumer disclosures before production use.
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
          See the{" "}
          <Link href="/legal/privacy" className="text-accent hover:underline">
            privacy policy
          </Link>{" "}
          for what the platform stores and when repository content leaves the deployment.
        </p>
      </footer>
    </article>
  );
}
