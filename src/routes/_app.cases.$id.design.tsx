import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, ShowerHead, Toilet, Droplet, Grip, Armchair, DoorOpen, ChevronLeft, ChevronRight, RotateCcw, Printer, ArrowRight, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill, Section } from "@/components/app/ui-bits";
import { BathroomPlan } from "@/components/app/BathroomPlan";
import { CaseError, saveDesign } from "@/lib/cases";
import { describeError } from "@/lib/firebase";
import type { BathroomLayout, ComponentKey } from "@/lib/domain";
import { moveWc } from "@/lib/engine";
import { RULESET, runRules, suggestLayoutFix, wcSideClearance } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { useCase, useCurrentUser } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/design")({
  component: DesignStudio,
});

const icons: Record<ComponentKey, typeof Toilet> = { shower: ShowerHead, wc: Toilet, basin: Droplet, rail: Grip, seat: Armchair, door: DoorOpen };
const ORDER: ComponentKey[] = ["shower", "wc", "basin", "rail", "seat", "door"];

function DesignStudio() {
  const { id } = Route.useParams();
  const c = useCase(id)!;
  if (!c.derived.layout) {
    return (
      <Section>
        <EmptyState
          title="No design yet"
          body="The bathroom layout is generated from the room measurements and needs in the OT assessment."
          action={<Button asChild><Link to="/cases/$id/assessment" params={{ id }}>Go to OT Assessment</Link></Button>}
        />
      </Section>
    );
  }
  return <Studio id={id} saved={c.derived.layout} hasSavedDesign={c.design !== null} approved={c.derived.designApproved} />;
}

function Studio({ id, saved, hasSavedDesign, approved }: { id: string; saved: BathroomLayout; hasSavedDesign: boolean; approved: boolean }) {
  const session = useCurrentUser();
  const [layout, setLayout] = useState<BathroomLayout>(saved);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<ComponentKey | null>("wc");
  const savedKey = JSON.stringify(saved);
  const rules = useMemo(() => runRules(layout), [layout]);
  const suggestion = useMemo(() => suggestLayoutFix(layout, rules), [layout, rules]);
  const passed = rules.filter((r) => r.status === "passed").length;
  const review = rules.length - passed;
  const selected = layout.components.find((c) => c.key === sel);
  const comp = (k: ComponentKey) => layout.components.find((c) => c.key === k);

  // Follow the stored design (e.g. after an assessment change) unless there are unsaved edits.
  useEffect(() => {
    if (!dirty) setLayout(saved);
  }, [savedKey, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (next: BathroomLayout) => { setLayout(next); setDirty(true); };
  const nudgeWc = (dx: number) => edit(moveWc(layout, comp("wc")!.x + dx));

  async function save() {
    setBusy(true);
    try {
      await saveDesign(session, id, comp("wc")!.x);
      setDirty(false);
      if (review > 0) toast.warning("Design saved. Accessibility issues still need to be resolved.");
      else toast.success("Design saved. All accessibility checks passed.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof CaseError ? err.message : describeError(err, "Could not save the design. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const canContinue = approved && !dirty;
  const shower = comp("shower")!;
  const door = comp("door")!;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[220px_1fr_320px]">
        <Section title="Bathroom Components" className="h-fit">
          <ul className="space-y-1.5">
            {ORDER.filter((k) => comp(k)).map((k) => {
              const I = icons[k];
              return (
                <li key={k}>
                  <button onClick={() => setSel(k)} className={cn("flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors", sel === k ? "bg-info-soft text-primary" : "hover:bg-muted")}>
                    <I className="h-4 w-4" /> {comp(k)!.label}
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && (
            <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">{selected.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{selected.detail}</p>
              <p className="mt-2 font-mono text-xs">x {selected.x} · y {selected.y} mm</p>
              {sel === "wc" && (
                <div className="mt-3 flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => nudgeWc(-50)} disabled={selected.x <= layout.wcRange.min} aria-label="Move WC left"><ChevronLeft className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => nudgeWc(50)} disabled={selected.x >= layout.wcRange.max} aria-label="Move WC right"><ChevronRight className="h-4 w-4" /></Button>
                  <span className="self-center text-xs text-muted-foreground">50 mm steps</span>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="2D Bathroom Canvas" description={`${layout.name}${dirty ? " · unsaved changes" : ""} · ${layout.roomW} × ${layout.roomD} mm`}
          action={<Button size="sm" variant="ghost" onClick={() => { setLayout(saved); setDirty(false); }} disabled={!dirty}><RotateCcw className="h-4 w-4" /> Reset</Button>}>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <BathroomPlan layout={layout} selected={sel} onSelect={setSel} highlightClearance={sel === "wc"} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Click a fixture to inspect it. The shaded zone beside the WC is the side-transfer space.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={busy || (hasSavedDesign && !dirty)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {hasSavedDesign ? "Save New Version" : "Save Design"}
            </Button>
            {!hasSavedDesign && !dirty && <span className="text-xs text-muted-foreground">Generated from the OT assessment — save it to start costing.</span>}
          </div>
        </Section>

        <div className="space-y-5">
          <Section title="Accessibility Rules Check">
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-xs">
              <span className="text-muted-foreground">Rule Source</span><span className="font-semibold">{RULESET.source}</span>
              <span className="text-muted-foreground">Rule Version</span><span className="font-semibold">{RULESET.version}</span>
              <span className="text-muted-foreground">Status</span>
              <span className="font-semibold">{passed} Passed{review > 0 && <span className="text-warning"> · {review} Review Required</span>}</span>
            </div>
            <ul className="space-y-2">
              {rules.map((r) => (
                <li key={r.id} className={cn("rounded-lg border p-3 transition-colors", r.status === "passed" ? "border-border" : "border-warning/50 bg-warning-soft")}>
                  <div className="flex items-start gap-2">
                    {r.status === "passed" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{r.name}</p>
                        <Pill t={r.status === "passed" ? "success" : "warning"}>{r.status === "passed" ? "Passed" : "Review Required"}</Pill>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.measured} · required {r.required}</p>
                      {r.status === "review" && (
                        <>
                          <p className="mt-2 text-xs font-medium">{r.message}</p>
                          {r.id === "wc" && suggestion && (
                            <Button size="sm" className="mt-2" onClick={() => { edit(moveWc(layout, suggestion.wcX, "Suggested")); setSel("wc"); toast.success(`Suggested layout applied. ${suggestion.message}`); }}>
                              View Suggested Layout
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">Rules-based validation · deterministic, versioned checks selected from the applicant's assessed needs: turning circles, transfer spaces, door clearances, reach zones and wet-room access.</p>
          </Section>
        </div>
      </div>

      <Section title="Dimensioned Drawing" description="Technical plan for the schedule of works." action={<Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Export Drawing</Button>}>
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <div className="mx-auto w-full max-w-xl"><BathroomPlan layout={layout} dimensions /></div>
          <dl className="space-y-2 font-mono text-sm">
            {[
              ["Room", `${layout.roomW} mm × ${layout.roomD} mm`],
              ["Door", `${door.w} mm`],
              ["Shower", `${shower.w} mm × ${shower.d} mm`],
              ["WC Side Clearance", `${wcSideClearance(layout)} mm`],
              ["Turning Circle", `${layout.turningDiameter} mm Ø`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>
            ))}
          </dl>
        </div>
      </Section>

      {canContinue ? (
        <Button asChild size="lg"><Link to="/cases/$id/preview" params={{ id }}>Continue to 3D Preview <ArrowRight className="h-4 w-4" /></Link></Button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled>Continue to 3D Preview <ArrowRight className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">{dirty || !hasSavedDesign ? "Save the design first." : "Resolve every accessibility check and save to continue."}</span>
        </div>
      )}
    </div>
  );
}
