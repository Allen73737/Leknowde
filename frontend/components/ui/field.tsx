import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/format";

const fieldBase =
  "w-full rounded-lg border border-line bg-surface px-3.5 text-base text-ink placeholder:text-faint transition-all duration-200 ease-smooth hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(fieldBase, "min-h-28 resize-y py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "h-12 cursor-pointer pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-2 block text-sm font-semibold tracking-[-0.005em] text-ink", className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-faint">{hint}</p>
      ) : null}
      {error ? <p className="mt-2 text-[0.8125rem] font-medium text-danger">{error}</p> : null}
    </div>
  );
}
