import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ClipboardCheck, ListChecks, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/app/ui-bits";
import { useCase } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/needs")({
  component: Needs,
});

function Needs() {
  const { id } = Route.useParams();
  const n = useCase(id)!.derived.needs;
  if (!n) {
    return (
      <Section>
        <EmptyState
          title="No needs profile yet"
          body="The needs profile is generated from the OT assessment. Complete the assessment to see the recommended adaptation features."
          action={<Button asChild><Link to="/cases/$id/assessment" params={{ id }}>Go to OT Assessment</Link></Button>}
        />
      </Section>
    );
  }
  return (
    <div className="space-y-5">
      <div className="card-surface flex flex-wrap items-center justify-center gap-3 p-4 text-sm font-semibold">
        <span className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2"><ClipboardCheck className="h-4 w-4 text-primary" /> OT Assessment</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-primary ring-1 ring-primary/30"><ListChecks className="h-4 w-4" /> Needs Profile</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2"><PenTool className="h-4 w-4 text-primary" /> Bathroom Design</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Mobility", n.mobility], ["Transfer Requirement", n.transfer], ["Carer Support", n.carer], ["Bathroom Priority", n.priority]].map(([k, v]) => (
          <div key={k} className="card-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className="mt-1.5 text-lg font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <Section title="Recommended Adaptation Features" description="Derived from the OT assessment using predefined mapping rules.">
        {n.features.length === 0 && <p className="text-sm text-muted-foreground">No adaptation features were triggered by this assessment.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {n.features.map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>
                <p className="font-semibold">{f.name}</p>
                <p className="text-xs text-muted-foreground">From: {f.source}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Button asChild size="lg"><Link to="/cases/$id/design" params={{ id }}>Continue to Bathroom Design <ArrowRight className="h-4 w-4" /></Link></Button>
    </div>
  );
}
