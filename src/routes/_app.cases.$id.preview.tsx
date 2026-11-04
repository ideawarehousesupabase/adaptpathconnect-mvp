import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import preview from "@/assets/bathroom-preview.jpg";
import { Button } from "@/components/ui/button";
import { EmptyState, KV, Pill, Section } from "@/components/app/ui-bits";
import { describeForApplicant } from "@/lib/engine";
import { useCase } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/preview")({
  component: Preview,
});

function Preview() {
  const { id } = Route.useParams();
  const c = useCase(id)!;
  const { needs, designApproved } = c.derived;
  if (!needs || !c.design) {
    return (
      <Section>
        <EmptyState
          title="No saved design to preview"
          body="Save a bathroom design first. The preview summarises the features chosen for the applicant."
          action={<Button asChild><Link to={c.assessment ? "/cases/$id/design" : "/cases/$id/assessment"} params={{ id }}>{c.assessment ? "Go to Bathroom Design" : "Go to OT Assessment"}</Link></Button>}
        />
      </Section>
    );
  }
  const status = designApproved
    ? <Pill t="success"><CheckCircle2 className="h-3.5 w-3.5" /> Accessibility Checks Passed</Pill>
    : <Pill t="warning"><AlertTriangle className="h-3.5 w-3.5" /> Accessibility Review Required</Pill>;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Section className="overflow-hidden p-0!">
        <div className="relative">
          <img src={preview} alt="Illustrative visual of an accessible bathroom" width={1408} height={960} className="w-full" />
          <div className="absolute left-4 top-4">{status}</div>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {needs.features.map((f) => <Pill key={f.id} t="info">{f.name}</Pill>)}
        </div>
      </Section>
      <div className="space-y-5">
        <Section title="Applicant Design Preview">
          <KV k="Applicant" v={c.applicant} />
          <KV k="Design" v={c.adaptation} />
          <KV k="Version" v={`V${c.design.version}`} />
          <KV k="Design Status" v={<span className={designApproved ? "text-success" : "text-warning"}>{designApproved ? "Accessibility Checks Passed" : `${c.derived.rulesReview} check${c.derived.rulesReview === 1 ? "" : "s"} need review`}</span>} />
          <KV k="OT Review" v={c.assessment ? "Completed" : "Not started"} />
        </Section>
        <Section title="For the applicant & family">
          <p className="text-sm text-muted-foreground">{describeForApplicant(needs)}</p>
          <p className="mt-2 text-xs text-muted-foreground">The image is illustrative; the dimensioned plan on the Bathroom Design tab is the specification.</p>
        </Section>
      </div>
    </div>
  );
}
