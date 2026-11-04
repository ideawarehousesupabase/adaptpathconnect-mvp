import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EvidenceSection } from "@/components/app/EvidenceSection";
import { Section } from "@/components/app/ui-bits";
import { CaseError, saveAssessment } from "@/lib/cases";
import { formatDate, OPTIONS } from "@/lib/domain";
import { describeError } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { assessmentToForm, EMPTY_ASSESSMENT, validateAssessment } from "@/lib/validation";
import { useCase, useCurrentUser } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/assessment")({
  component: Assessment,
});

function Choice({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === o}
            key={o}
            onClick={() => onChange(o)}
            className={cn("rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors", value === o ? "border-primary bg-info-soft text-primary" : "border-input bg-card hover:bg-muted")}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Checks({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o} className="flex cursor-pointer items-center gap-3 rounded-lg border border-input px-3 py-2.5 text-sm hover:bg-muted">
          <Checkbox checked={value.includes(o)} onCheckedChange={(c) => onChange(c ? [...value, o] : value.filter((x) => x !== o))} />
          {o}
        </label>
      ))}
    </div>
  );
}

function Assessment() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const session = useCurrentUser();
  const c = useCase(id)!;
  const [a, setA] = useState(() => (c.assessment ? assessmentToForm(c.assessment) : EMPTY_ASSESSMENT));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const up = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => setA({ ...a, [k]: v });

  async function complete() {
    const res = validateAssessment(a);
    if (!res.ok) return setErrors(res.errors);
    setErrors([]);
    setBusy(true);
    try {
      await saveAssessment(session, id, res.value);
      toast.success(c.assessment ? "Assessment updated. Needs profile regenerated." : "Assessment completed. Needs profile generated.");
      nav({ to: "/cases/$id/needs", params: { id } });
    } catch (err) {
      console.error(err);
      setErrors([err instanceof CaseError ? err.message : describeError(err, "Could not save the assessment. Try again.")]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        OT Assessment Digitiser — capture the home-visit assessment in one structured record.
        {c.assessment && <> Last saved {formatDate(c.assessment.completedAt)}; saving again regenerates the needs profile, design and costs.</>}
      </p>
      {c.stage === "Approved" && (
        <p className="rounded-lg bg-warning-soft p-3 text-sm">This case is approved. Changes that affect the design or costs will re-open it for a new council decision.</p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Applicant Mobility & Transfer">
          <div className="space-y-5">
            <Choice label="Applicant Mobility" options={OPTIONS.mobility} value={a.mobility} onChange={(v) => up("mobility", v)} />
            <Choice label="Transfer Ability" options={OPTIONS.transfer} value={a.transfer} onChange={(v) => up("transfer", v)} />
            <Choice label="Carer Support" options={OPTIONS.carerSupport} value={a.carerSupport} onChange={(v) => up("carerSupport", v)} />
          </div>
        </Section>
        <Section title="Room Measurements" description="All values in millimetres.">
          <div className="grid gap-4 sm:grid-cols-3">
            {([["roomLength", "Room Length"], ["roomWidth", "Room Width"], ["doorWidth", "Door Width"]] as const).map(([k, l]) => (
              <div key={k} className="space-y-1.5"><Label htmlFor={k}>{l}</Label><Input id={k} inputMode="numeric" placeholder="mm" value={a[k]} onChange={(e) => up(k, e.target.value)} /></div>
            ))}
          </div>
          <p className="mb-2 mt-5 text-sm font-medium">Existing Bathroom</p>
          <Checks options={OPTIONS.existingBathroom} value={a.existingBathroom} onChange={(v) => up("existingBathroom", v)} />
        </Section>
      </div>
      <Section title="Bathing / Functional Needs">
        <Checks options={OPTIONS.needs} value={a.needs} onChange={(v) => up("needs", v)} />
      </Section>
      <Section title="Additional Assessment">
        <div className="grid gap-4 md:grid-cols-2">
          {([["rangeOfMovement", "Range of movement"], ["existingAdaptations", "Existing adaptations"], ["bathingRoutine", "Bathing routine"], ["prognosis", "Relevant prognosis notes"], ["otNotes", "OT notes"]] as const).map(([k, l]) => (
            <div key={k} className="space-y-1.5"><Label htmlFor={k}>{l}</Label><Textarea id={k} rows={3} value={a[k]} onChange={(e) => up(k, e.target.value)} /></div>
          ))}
        </div>
      </Section>
      <EvidenceSection caseId={id} />
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{errors.map((x) => <li key={x}>{x}</li>)}</ul>
      )}
      <Button size="lg" onClick={complete} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {c.assessment ? "Save Assessment" : "Complete Assessment"}
      </Button>
    </div>
  );
}
