import { cn } from "@/lib/format";

export function CodeBlock({
  code,
  className,
  startLine = 1,
  maxHeight,
}: {
  code: string;
  className?: string;
  startLine?: number;
  maxHeight?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <pre
      className={cn(
        "overflow-auto rounded-md border border-line bg-shell px-3 py-2.5 font-mono text-[0.8125rem] leading-[1.65] text-muted",
        className,
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <code>
        {lines.map((line, index) => (
          <span key={`${startLine + index}-${index}`} className="block whitespace-pre">
            <span aria-hidden="true" className="mr-3 inline-block w-8 select-none text-right text-faint/60">
              {startLine + index}
            </span>
            {line || " "}
          </span>
        ))}
      </code>
    </pre>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-line bg-raised px-1 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}
