import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type MeasurementUnit = "mm" | "cm" | "m";

function mmToUnit(mm: number, unit: MeasurementUnit): string {
  if (!Number.isFinite(mm) || mm === 0) return "";
  if (unit === "m") return String(Math.round((mm / 1000) * 100) / 100);
  if (unit === "cm") return String(Math.round((mm / 10) * 10) / 10);
  return String(Math.round(mm));
}

function unitToMm(val: number, unit: MeasurementUnit): number {
  if (unit === "m") return Math.round(val * 1000);
  if (unit === "cm") return Math.round(val * 10);
  return Math.round(val);
}

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
            className={cn(
              "rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
              value === o ? "border-primary bg-info-soft text-primary" : "border-input bg-card hover:bg-muted"
            )}
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
        <label key={o} className="flex cursor-pointer items-center gap-3 rounded-lg border border-input px-3 py-2.5 text-sm hover:bg-muted transition-colors">
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
  const [unit, setUnit] = useState<MeasurementUnit>("mm");
  const [displayVals, setDisplayVals] = useState(() => ({
    roomLength: c.assessment ? String(c.assessment.roomLength) : a.roomLength,
    roomWidth: c.assessment ? String(c.assessment.roomWidth) : a.roomWidth,
    doorWidth: c.assessment ? String(c.assessment.doorWidth) : a.doorWidth,
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const up = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => setA((prev) => ({ ...prev, [k]: v }));

  function handleUnitChange(newUnit: MeasurementUnit) {
    if (newUnit === unit) return;
    const nextDisplay = { ...displayVals };
    (["roomLength", "roomWidth", "doorWidth"] as const).forEach((key) => {
      const currentMm = Number(a[key]);
      if (Number.isFinite(currentMm) && currentMm > 0) {
        nextDisplay[key] = mmToUnit(currentMm, newUnit);
      }
    });
    setUnit(newUnit);
    setDisplayVals(nextDisplay);
  }

  function handleMeasureChange(key: "roomLength" | "roomWidth" | "doorWidth", inputVal: string) {
    setDisplayVals((prev) => ({ ...prev, [key]: inputVal }));
    const trimmed = inputVal.trim();
    if (!trimmed) {
      up(key, "");
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      const mm = unitToMm(parsed, unit);
      up(key, String(mm));
    } else {
      up(key, trimmed);
    }
  }

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

  const measureFields = [
    { key: "roomLength" as const, label: "Room Length", placeholder: unit === "m" ? "e.g. 2.4" : unit === "cm" ? "e.g. 240" : "e.g. 2400" },
    { key: "roomWidth" as const, label: "Room Width", placeholder: unit === "m" ? "e.g. 1.8" : unit === "cm" ? "e.g. 180" : "e.g. 1800" },
    { key: "doorWidth" as const, label: "Door Width", placeholder: unit === "m" ? "e.g. 0.85" : unit === "cm" ? "e.g. 85" : "e.g. 850" },
  ];

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
        <Section
          title="Room Measurements"
          description="Enter room dimensions in your preferred unit."
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Unit:</span>
              <Select value={unit} onValueChange={(v) => handleUnitChange(v as MeasurementUnit)}>
                <SelectTrigger className="h-8 w-24 text-xs font-semibold" aria-label="Measurement unit selector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mm">mm</SelectItem>
                  <SelectItem value="cm">cm</SelectItem>
                  <SelectItem value="m">m</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {measureFields.map(({ key, label, placeholder }) => {
              const mmValue = Number(a[key]);
              const showMmConversion = unit !== "mm" && Number.isFinite(mmValue) && mmValue > 0;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={key}>{label}</Label>
                    <span className="text-xs text-muted-foreground font-mono">({unit})</span>
                  </div>
                  <Input
                    id={key}
                    inputMode="decimal"
                    placeholder={placeholder}
                    value={displayVals[key]}
                    onChange={(e) => handleMeasureChange(key, e.target.value)}
                  />
                  {showMmConversion && (
                    <p className="text-[11px] text-muted-foreground font-mono">
                      = {mmValue.toLocaleString()} mm
                    </p>
                  )}
                </div>
              );
            })}
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
