import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/app/ui-bits";
import { computeMetrics } from "@/lib/engine";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_app/pilot-metrics")({
  head: () => ({
    meta: [
      { title: "Pilot Metrics — AdaptPath OS" },
      { name: "description", content: "Pilot KPIs for the DFG accessible bathroom pathway, measured from case records." },
      { property: "og:title", content: "Pilot Metrics — AdaptPath OS" },
      { property: "og:description", content: "Pilot KPIs for the DFG accessible bathroom pathway, measured from case records." },
    ],
  }),
  component: Pilot,
});

function Pilot() {
  const { cases, events, loading, error, retry } = useWorkspace();
  const { metrics, trend } = useMemo(() => computeMetrics(cases, events), [cases, events]);
  const max = Math.max(1, ...trend.map((p) => p.days));
  return (
    <>
      <PageHeader eyebrow="Pilot" title="Pilot Metrics" subtitle="Measured from your case records and audit trail." />
      {error ? <ErrorState message={error} onRetry={retry} /> : loading ? <LoadingState label="Calculating metrics…" /> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map((m) => (
              <div key={m.label} className="card-surface p-5">
                <p className="text-sm text-muted-foreground">{m.label}</p>
                <p className="tabular mt-1 text-3xl font-bold text-primary">{m.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
              </div>
            ))}
          </div>
          <Section title="Average days: assessment → approved design" description="By month the design passed all accessibility checks.">
            {trend.length === 0 ? (
              <EmptyState title="No approved designs yet" body="The trend appears once a case has a completed assessment and a saved design that passes every check." />
            ) : (
              <div className="flex h-56 items-end gap-6 px-2">
                {trend.map((p) => (
                  <div key={p.month} className="flex flex-1 flex-col items-center gap-2">
                    <span className="tabular text-xs font-semibold">{p.days}</span>
                    <div className="w-full max-w-16 rounded-t-md bg-chart-1" style={{ height: `${Math.max(4, (p.days / max) * 170)}px` }} />
                    <span className="text-xs text-muted-foreground">{p.month}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}
