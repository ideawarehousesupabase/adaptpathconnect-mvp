import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ShowerHead,
  Toilet,
  Droplet,
  Grip,
  Armchair,
  DoorOpen,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Printer,
  ArrowRight,
  Save,
  Loader2,
  Move,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Pill, Section } from "@/components/app/ui-bits";
import { BathroomPlan } from "@/components/app/BathroomPlan";
import { CaseError, saveDesign } from "@/lib/cases";
import { describeError } from "@/lib/firebase";
import type { BathroomLayout, ComponentKey } from "@/lib/domain";
import { moveComponent, moveWc } from "@/lib/engine";
import { RULESET, runRules, suggestLayoutFix, wcSideClearance } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { useCase, useCurrentUser } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/design")({
  component: DesignStudio,
});

const icons: Record<ComponentKey, typeof Toilet> = {
  shower: ShowerHead,
  wc: Toilet,
  basin: Droplet,
  rail: Grip,
  seat: Armchair,
  door: DoorOpen,
};
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
  const nav = useNavigate();
  const session = useCurrentUser();
  const [layout, setLayout] = useState<BathroomLayout>(saved);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<ComponentKey | null>("wc");
  const [stepSize, setStepSize] = useState<number>(50);
  const savedKey = JSON.stringify(saved);
  const rules = useMemo(() => runRules(layout), [layout]);
  const suggestion = useMemo(() => suggestLayoutFix(layout, rules), [layout, rules]);
  const passed = rules.filter((r) => r.status === "passed").length;
  const review = rules.length - passed;
  const selected = layout.components.find((c) => c.key === sel);
  const comp = (k: ComponentKey) => layout.components.find((c) => c.key === k);

  // Follow the stored design unless there are unsaved edits
  useEffect(() => {
    if (!dirty) setLayout(saved);
  }, [savedKey, dirty]);

  const edit = (next: BathroomLayout) => {
    setLayout(next);
    setDirty(true);
  };

  const handleMove = (key: ComponentKey, x: number, y: number) => {
    edit(moveComponent(layout, key, x, y));
  };

  const nudge = (key: ComponentKey, dx: number, dy: number) => {
    const target = comp(key);
    if (!target) return;
    edit(moveComponent(layout, key, target.x + dx, target.y + dy));
  };

  async function save() {
    setBusy(true);
    try {
      const positions: Partial<Record<ComponentKey, { x: number; y: number }>> = {};
      for (const item of layout.components) {
        positions[item.key] = { x: item.x, y: item.y };
      }
      await saveDesign(session, id, {
        wcX: comp("wc")?.x ?? 800,
        positions,
      });
      setDirty(false);
      if (review > 0) {
        toast.info("Design saved. Note: Accessibility variance is under review.");
      } else {
        toast.success("Design saved. All accessibility checks passed.");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof CaseError ? err.message : describeError(err, "Could not save the design. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleContinue() {
    if (dirty || !hasSavedDesign) {
      await save();
    }
    nav({ to: "/cases/$id/preview", params: { id } });
  }

  const shower = comp("shower")!;
  const door = comp("door")!;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[250px_1fr_320px]">
        {/* Component Selector & Manual Movement Panel */}
        <Section title="Fixtures & Placement" className="h-fit">
          <p className="mb-2 text-xs text-muted-foreground">Select a fixture to move or drag directly on the plan:</p>
          <ul className="space-y-1">
            {ORDER.filter((k) => comp(k)).map((k) => {
              const I = icons[k];
              const isSelected = sel === k;
              return (
                <li key={k}>
                  <button
                    onClick={() => setSel(k)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer",
                      isSelected ? "bg-info-soft text-primary font-semibold ring-1 ring-primary/40" : "hover:bg-muted"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <I className="h-4 w-4" /> {comp(k)!.label}
                    </span>
                    <Move className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <div className="mt-4 rounded-lg border border-border bg-muted/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{selected.label}</p>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {selected.w} × {selected.d} mm
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{selected.detail}</p>

              {/* Exact coordinate inputs */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <Label htmlFor="comp-x" className="text-[11px] text-muted-foreground">X (mm)</Label>
                  <Input
                    id="comp-x"
                    type="number"
                    className="h-7 text-xs font-mono"
                    value={selected.x}
                    onChange={(e) => handleMove(selected.key, Number(e.target.value) || 0, selected.y)}
                  />
                </div>
                <div>
                  <Label htmlFor="comp-y" className="text-[11px] text-muted-foreground">Y (mm)</Label>
                  <Input
                    id="comp-y"
                    type="number"
                    className="h-7 text-xs font-mono"
                    value={selected.y}
                    onChange={(e) => handleMove(selected.key, selected.x, Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Nudge controller */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Nudge Position:</span>
                  <div className="flex gap-1">
                    {[25, 50, 100].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setStepSize(size)}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer",
                          stepSize === size ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 pt-1">
                  <div />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 p-0 cursor-pointer"
                    onClick={() => nudge(selected.key, 0, -stepSize)}
                    aria-label="Move Up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <div />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 p-0 cursor-pointer"
                    onClick={() => nudge(selected.key, -stepSize, 0)}
                    aria-label="Move Left"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center justify-center text-[10px] font-mono text-muted-foreground">
                    {stepSize}mm
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 p-0 cursor-pointer"
                    onClick={() => nudge(selected.key, stepSize, 0)}
                    aria-label="Move Right"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 p-0 cursor-pointer"
                    onClick={() => nudge(selected.key, 0, stepSize)}
                    aria-label="Move Down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <div />
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* 2D Interactive Canvas */}
        <Section
          title="2D Bathroom Canvas"
          description={`${layout.name}${dirty ? " · unsaved changes" : ""} · ${layout.roomW} × ${layout.roomD} mm`}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLayout(saved);
                setDirty(false);
              }}
              disabled={!dirty}
              className="cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          }
        >
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <BathroomPlan
              layout={layout}
              selected={sel}
              onSelect={setSel}
              onMove={handleMove}
              highlightClearance={sel === "wc" || sel === "basin"}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Drag any fixture directly on the floor plan or use the nudge buttons on the left.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={busy || (hasSavedDesign && !dirty)} className="cursor-pointer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {hasSavedDesign ? "Save New Version" : "Save Design"}
            </Button>
            {!hasSavedDesign && !dirty && (
              <span className="text-xs text-muted-foreground">Generated from OT assessment — click save to confirm.</span>
            )}
            {hasSavedDesign && !dirty && (
              <span className="text-xs text-success flex items-center gap-1 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Design layout is saved
              </span>
            )}
          </div>
        </Section>

        {/* Accessibility Rules Check */}
        <div className="space-y-5">
          <Section title="Accessibility Rules Check">
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-xs">
              <span className="text-muted-foreground">Rule Source</span>
              <span className="font-semibold">{RULESET.source}</span>
              <span className="text-muted-foreground">Rule Version</span>
              <span className="font-semibold">{RULESET.version}</span>
              <span className="text-muted-foreground">Status</span>
              <span className="font-semibold">
                {passed} Passed{review > 0 && <span className="text-warning"> · {review} Review Required</span>}
              </span>
            </div>
            <ul className="space-y-2">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    r.status === "passed" ? "border-border" : "border-warning/50 bg-warning-soft"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {r.status === "passed" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{r.name}</p>
                        <Pill t={r.status === "passed" ? "success" : "warning"}>
                          {r.status === "passed" ? "Passed" : "Review Required"}
                        </Pill>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.measured} · required {r.required}</p>
                      {r.status === "review" && (
                        <>
                          <p className="mt-2 text-xs font-medium text-warning-foreground">{r.message}</p>
                          {r.id === "wc" && suggestion && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 text-xs cursor-pointer"
                              onClick={() => {
                                edit(moveWc(layout, suggestion.wcX, "Suggested"));
                                setSel("wc");
                                toast.success(`Suggested layout applied. ${suggestion.message}`);
                              }}
                            >
                              Apply Suggested Clearance
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Deterministic UK guidance rules. If a small room requires variance, you can still proceed to 3D Preview and Costing.
            </p>
          </Section>
        </div>
      </div>

      {/* Dimensioned Drawing */}
      <Section
        title="Dimensioned Drawing"
        description="Technical specification for contractor and schedule of works."
        action={
          <Button variant="outline" size="sm" onClick={() => window.print()} className="cursor-pointer">
            <Printer className="h-4 w-4" /> Export Drawing
          </Button>
        }
      >
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <div className="mx-auto w-full max-w-xl">
            <BathroomPlan layout={layout} dimensions interactive={false} />
          </div>
          <dl className="space-y-2 font-mono text-sm">
            {[
              ["Room", `${layout.roomW} mm × ${layout.roomD} mm`],
              ["Door", `${door ? door.w : layout.requirements.minDoorWidth} mm`],
              ["Shower", `${shower ? `${shower.w} × ${shower.d}` : "—"} mm`],
              ["WC Side Clearance", `${wcSideClearance(layout)} mm`],
              ["Turning Circle", `${layout.turningDiameter} mm Ø`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border pb-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {/* Continue Action Button - Always allows progression */}
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <Button size="lg" onClick={handleContinue} disabled={busy} className="cursor-pointer">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Continue to 3D Preview <ArrowRight className="h-4 w-4" />
        </Button>
        {dirty && (
          <span className="text-xs text-muted-foreground">
            Changes will be saved automatically upon continuing.
          </span>
        )}
        {!dirty && review > 0 && (
          <span className="text-xs font-medium text-warning flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Proceeding with {review} accessibility check{review === 1 ? "" : "s"} under review
          </span>
        )}
        {!dirty && review === 0 && (
          <span className="text-xs font-medium text-success flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> All accessibility checks passed
          </span>
        )}
      </div>
    </div>
  );
}
