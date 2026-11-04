import type { ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Circle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tone = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-destructive-soft text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;
export type Tone = keyof typeof tone;

export function Pill({ children, t = "neutral", className }: { children: ReactNode; t?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tone[t], className)}>
      {children}
    </span>
  );
}

export function statusTone(s: string): Tone {
  if (s === "Approved") return "success";
  if (s === "Pending") return "warning";
  if (s === "Revision Requested") return "danger";
  return "info";
}

export function StatusPill({ status }: { status: string }) {
  return <Pill t={statusTone(status)}>{status}</Pill>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, children, className, action, description }: { title?: string; children: ReactNode; className?: string; action?: ReactNode; description?: string }) {
  return (
    <section className={cn("card-surface p-5", className)}>
      {title && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium text-foreground">{v}</span>
    </div>
  );
}

export type StepState = "done" | "current" | "pending" | "future";

export function StepIcon({ s }: { s: StepState }) {
  if (s === "done") return <CheckCircle2 className="h-5 w-5 text-success" />;
  if (s === "current") return <Clock className="h-5 w-5 text-primary" />;
  if (s === "pending") return <AlertTriangle className="h-5 w-5 text-warning" />;
  return <Circle className="h-5 w-5 text-muted-foreground/50" />;
}

export function Timeline({ steps }: { steps: { label: string; state: StepState }[] }) {
  const lbl: Record<StepState, string> = { done: "Complete", current: "Current", pending: "Pending", future: "Future" };
  return (
    <ol className="flex flex-wrap gap-y-4">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-[110px] flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <div className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : s.state === "done" || s.state === "current" ? "bg-success" : "bg-border")} />
            <div className={cn("rounded-full p-1.5", s.state === "current" ? "bg-info-soft ring-2 ring-primary/30" : "bg-card")}>
              <StepIcon s={s.state} />
            </div>
            <div className={cn("h-0.5 flex-1", i === steps.length - 1 ? "bg-transparent" : s.state === "done" ? "bg-success" : "bg-border")} />
          </div>
          <p className="mt-2 text-xs font-semibold text-foreground">{s.label}</p>
          <p className={cn("text-[11px]", s.state === "current" ? "text-primary font-semibold" : "text-muted-foreground")}>{lbl[s.state]}</p>
        </li>
      ))}
    </ol>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card-surface flex flex-col items-center gap-3 p-10 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="max-w-md text-sm font-medium">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 py-10 text-center", className)}>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
