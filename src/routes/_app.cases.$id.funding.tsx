import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Edit3,
  Info,
  Loader2,
  PenTool,
  Plus,
  PoundSterling,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Pill, Section } from "@/components/app/ui-bits";
import { CaseError, completeFundingReview, confirmCosting } from "@/lib/cases";
import { describeError } from "@/lib/firebase";
import { formatDate, gbp, type WorkItem } from "@/lib/domain";
import { buildScheduleOfWorks, fundingPosition } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { useCase, useCurrentUser } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/funding")({
  component: Funding,
});

const failMessage = (err: unknown) => {
  console.error(err);
  return err instanceof CaseError ? err.message : describeError(err, "Could not save to the database. Try again.");
};

function Funding() {
  const { id } = Route.useParams();
  const session = useCurrentUser();
  const c = useCase(id)!;
  const d = c.derived;
  const stored = d.funding;
  const costed = c.costing !== null && stored !== null && c.costing.confirmedTotal === stored.total;
  const reviewed = costed && c.funding !== null && c.funding.reviewedTotal === stored!.total;

  const [contribution, setContribution] = useState(String(c.funding?.applicantContribution ?? ""));
  const [busy, setBusy] = useState<"costing" | "funding" | null>(null);
  const [error, setError] = useState("");

  // Manual Costs State
  const [editingCosts, setEditingCosts] = useState(false);
  const [worksList, setWorksList] = useState<WorkItem[]>(() => c.costing?.customWorks ?? d.works);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemQty, setNewItemQty] = useState("");

  // Manual Funding Override State
  const [overrideGrant, setOverrideGrant] = useState(c.funding?.isManual ?? false);
  const [customGrantAmount, setCustomGrantAmount] = useState(String(c.funding?.customDfgGrant ?? ""));

  useEffect(() => {
    if (c.funding) {
      setContribution(String(c.funding.applicantContribution));
      if (c.funding.customDfgGrant !== undefined) {
        setCustomGrantAmount(String(c.funding.customDfgGrant));
        setOverrideGrant(true);
      }
    }
  }, [c.funding]);

  // Synchronize worksList when derived works change, unless user is actively editing
  useEffect(() => {
    if (!editingCosts) {
      setWorksList(c.costing?.customWorks ?? d.works);
    }
  }, [c.costing?.customWorks, d.works, editingCosts]);

  if (!c.design || !stored) {
    return (
      <Section>
        <EmptyState
          title="No costed design yet"
          body="Save a bathroom design first. The schedule of works and funding breakdown are generated automatically from the saved design."
          action={
            <Button asChild>
              <Link to={c.assessment ? "/cases/$id/design" : "/cases/$id/assessment"} params={{ id }}>
                {c.assessment ? "Go to Bathroom Design" : "Go to OT Assessment"}
              </Link>
            </Button>
          }
        />
      </Section>
    );
  }

  const activeWorks = editingCosts ? worksList : (c.costing?.customWorks ?? d.works);
  const activeTotal = activeWorks.reduce((acc, item) => acc + (Number(item.cost) || 0), 0);
  const isCustomCostSchedule = c.costing?.isManual ?? false;

  const parsed = contribution.trim() === "" ? NaN : Number(contribution);
  const validContribution = Number.isFinite(parsed) && parsed >= 0 && parsed <= stored.total;

  // Base funding preview
  const basePosition = fundingPosition(activeWorks, validContribution ? parsed : 0);
  const parsedCustomGrant = overrideGrant && customGrantAmount.trim() !== "" ? Number(customGrantAmount) : NaN;
  const isCustomGrantValid = Number.isFinite(parsedCustomGrant) && parsedCustomGrant >= 0;

  // Final funding position preview
  const f = {
    ...basePosition,
    dfg: isCustomGrantValid ? parsedCustomGrant : basePosition.dfg,
    withinLimit: isCustomGrantValid ? parsedCustomGrant <= basePosition.ceiling : basePosition.withinLimit,
  };
  const pct = Math.min(100, (f.dfg / f.ceiling) * 100);

  // Cost item manipulation handlers
  const handleUpdateItem = (index: number, field: keyof WorkItem, value: any) => {
    setWorksList((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setWorksList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    const cost = Number(newItemCost) || 0;
    setWorksList((prev) => [
      ...prev,
      {
        item: newItemName.trim(),
        qty: newItemQty.trim() || undefined,
        cost,
        fromDesign: false,
      },
    ]);
    setNewItemName("");
    setNewItemCost("");
    setNewItemQty("");
  };

  const handleResetToAutoCosts = () => {
    if (d.needs && d.layout) {
      const autoWorks = buildScheduleOfWorks(d.needs, d.layout);
      setWorksList(autoWorks);
      setEditingCosts(false);
      toast.info("Costs reset to auto-detected schedule of works.");
    }
  };

  async function confirm() {
    setBusy("costing");
    setError("");
    try {
      if (editingCosts || isCustomCostSchedule) {
        await confirmCosting(session, id, worksList, activeTotal);
        setEditingCosts(false);
      } else {
        await confirmCosting(session, id);
      }
      toast.success("Schedule of works confirmed.");
    } catch (err) {
      setError(failMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function review() {
    if (!validContribution) return setError(`Enter an applicant contribution between £0 and ${gbp(stored!.total)}.`);
    if (overrideGrant && !isCustomGrantValid) {
      return setError("Enter a valid custom DFG grant amount (£0 or more).");
    }
    setBusy("funding");
    setError("");
    try {
      const customGrant = overrideGrant ? parsedCustomGrant : undefined;
      await completeFundingReview(session, id, parsed, customGrant);
      toast.success("Funding assessment completed.");
    } catch (err) {
      setError(failMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* 2-Step Confirmation Guide Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="font-semibold text-sm mb-2">Costing & Grant Workflow</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              costed ? "border-success/40 bg-success-soft/30" : "border-primary/40 bg-info-soft/30"
            }`}
          >
            <div
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                costed ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              1
            </div>
            <div>
              <p className="text-sm font-semibold">
                Step 1: Confirm Schedule of Works
                {costed && <span className="ml-2 text-xs text-success font-medium">✓ Done</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lock the itemised builder quotation ({gbp(stored.total)}) based on the saved design or manual edits.
              </p>
            </div>
          </div>

          <div
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              reviewed ? "border-success/40 bg-success-soft/30" : "border-border bg-muted/40"
            }`}
          >
            <div
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                reviewed ? "bg-success text-success-foreground" : "bg-muted-foreground text-background"
              }`}
            >
              2
            </div>
            <div>
              <p className="text-sm font-semibold">
                Step 2: Complete Funding Review
                {reviewed && <span className="ml-2 text-xs text-success font-medium">✓ Done</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enter means-test applicant contribution and verify grant vs statutory £30,000 ceiling.
              </p>
            </div>
          </div>
        </div>
      </div>

      {!d.designApproved && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
          <Info className="h-4 w-4 shrink-0 text-warning" />
          <span>
            Note: The design includes accessibility items under review. Costs are calculated from the current specification and can be confirmed for council approval.
          </span>
        </div>
      )}

      {/* Schedule of Works Table */}
      <Section
        title="Schedule of Works"
        description={`Itemised line items generated from bathroom design (V${c.design.version}). You can use auto-detected rates or manually edit line items.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isCustomCostSchedule ? (
              <Pill t="warning">Manual Cost Schedule</Pill>
            ) : (
              <Pill t="info">Auto-detected Rates</Pill>
            )}
            {!editingCosts ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingCosts(true)}
                className="cursor-pointer text-xs"
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit Costs Manually
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleResetToAutoCosts}
                  className="cursor-pointer text-xs text-muted-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to Auto
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingCosts(false)}
                  className="cursor-pointer text-xs"
                >
                  Done Editing
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Item Description</th>
                <th className="py-2">Source</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Cost (£)</th>
                {editingCosts && <th className="py-2 text-right w-12">Action</th>}
              </tr>
            </thead>
            <tbody>
              {activeWorks.map((w, idx) => (
                <tr key={`${w.item}-${idx}`} className="border-b border-border">
                  <td className="py-2.5 font-medium">
                    {editingCosts ? (
                      <Input
                        value={w.item}
                        onChange={(e) => handleUpdateItem(idx, "item", e.target.value)}
                        className="h-8 text-xs font-medium"
                      />
                    ) : (
                      w.item
                    )}
                  </td>
                  <td className="py-2.5">
                    {w.fromDesign ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                        <PenTool className="h-3 w-3" /> From design
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Associated works</span>
                    )}
                  </td>
                  <td className="tabular py-2.5 text-right">
                    {editingCosts ? (
                      <Input
                        value={w.qty ?? ""}
                        onChange={(e) => handleUpdateItem(idx, "qty", e.target.value)}
                        placeholder="—"
                        className="h-8 w-20 ml-auto text-xs text-right"
                      />
                    ) : (
                      w.qty ?? "—"
                    )}
                  </td>
                  <td className="tabular py-2.5 text-right font-medium">
                    {editingCosts ? (
                      <Input
                        type="number"
                        value={w.cost}
                        onChange={(e) => handleUpdateItem(idx, "cost", Number(e.target.value) || 0)}
                        className="h-8 w-28 ml-auto text-xs text-right font-mono"
                      />
                    ) : (
                      gbp(w.cost)
                    )}
                  </td>
                  {editingCosts && (
                    <td className="py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveItem(idx)}
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}

              {/* Add Custom Item Row when editing */}
              {editingCosts && (
                <tr className="bg-muted/30 border-b border-border">
                  <td className="py-2.5">
                    <Input
                      placeholder="Add custom work item (e.g. Electrical repositioning)"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground">Custom addition</td>
                  <td className="py-2.5 text-right">
                    <Input
                      placeholder="Qty"
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(e.target.value)}
                      className="h-8 w-20 ml-auto text-xs text-right"
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <Input
                      type="number"
                      placeholder="Cost (£)"
                      value={newItemCost}
                      onChange={(e) => setNewItemCost(e.target.value)}
                      className="h-8 w-28 ml-auto text-xs text-right font-mono"
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddItem}
                      className="h-8 px-2.5 text-xs cursor-pointer gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </td>
                </tr>
              )}

              {activeWorks.length === 0 && (
                <tr>
                  <td colSpan={editingCosts ? 5 : 4} className="py-6 text-center text-muted-foreground">
                    No work items currently in the schedule.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={editingCosts ? 3 : 3} className="pt-3 font-semibold text-base">
                  Total Estimated Cost {editingCosts && <span className="text-xs font-normal text-muted-foreground">(calculated live)</span>}
                </td>
                <td className="tabular pt-3 text-right text-lg font-bold text-primary">
                  {gbp(activeTotal)}
                </td>
                {editingCosts && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {costed && !editingCosts ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
                <CheckCircle2 className="h-4 w-4" /> Confirmed on {formatDate(c.costing!.confirmedAt)} ({gbp(c.costing!.confirmedTotal)})
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingCosts(true)}
                className="cursor-pointer text-xs"
              >
                <Edit3 className="h-3.5 w-3.5" /> Change Costs
              </Button>
            </div>
          ) : (
            <>
              <Button onClick={confirm} disabled={busy !== null} className="cursor-pointer">
                {busy === "costing" && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingCosts ? "Save & Confirm Custom Schedule" : "Confirm Schedule of Works"}
              </Button>
              {editingCosts && (
                <Button
                  variant="ghost"
                  onClick={handleResetToAutoCosts}
                  className="cursor-pointer text-xs text-muted-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to Auto-detected Costs
                </Button>
              )}
              {c.costing && !editingCosts && (
                <span className="text-sm text-warning">Costs changed since the last confirmation.</span>
              )}
            </>
          )}
        </div>
      </Section>

      {/* DFG Grant & Means-test Assessment */}
      <Section
        title="DFG Funding Assessment"
        description="Statutory grant calculation against applicant means-test, with optional manual grant override."
      >
        <div className="mb-5 grid gap-4 sm:grid-cols-2 max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor="contribution">Applicant contribution (£, from means test)</Label>
            <Input
              id="contribution"
              inputMode="numeric"
              placeholder="0"
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              disabled={!costed}
            />
          </div>

          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <label className="flex items-center gap-2 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overrideGrant}
                onChange={(e) => setOverrideGrant(e.target.checked)}
                disabled={!costed}
                className="rounded border-border text-primary"
              />
              <span>Manual DFG Grant Override</span>
            </label>
            {overrideGrant && (
              <div className="mt-2 space-y-1">
                <Label htmlFor="custom-grant" className="text-[11px] text-muted-foreground">
                  Custom DFG Grant Amount (£)
                </Label>
                <Input
                  id="custom-grant"
                  type="number"
                  placeholder={String(basePosition.dfg)}
                  value={customGrantAmount}
                  onChange={(e) => setCustomGrantAmount(e.target.value)}
                  className="h-8 text-xs font-mono"
                  disabled={!costed}
                />
                <span className="text-[10px] text-muted-foreground">
                  Allows manual grant amount if bespoke local authority discretionary funding applies.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Estimated Adaptation Cost", f.total],
            ["Applicant Contribution", f.applicant],
            ["DFG Grant Allocation", f.dfg],
            ["Maximum Grant Ceiling", f.ceiling],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-4 bg-card">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="tabular mt-1 text-xl font-bold">{gbp(v as number)}</p>
              {k === "DFG Grant Allocation" && overrideGrant && (
                <span className="mt-1 inline-block text-[10px] font-semibold text-warning">
                  (Manual Override)
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>DFG contribution vs £30,000 ceiling</span>
            <span>{((f.dfg / f.ceiling) * 100).toFixed(0)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className={f.withinLimit ? "h-full rounded-full bg-success" : "h-full rounded-full bg-destructive"}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {f.withinLimit ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-success-soft p-4 text-success">
            <CheckCircle2 className="h-6 w-6" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider">Grant Status</p>
              <p className="font-bold">Within Statutory £30,000 Grant Limit</p>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-destructive-soft p-4 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider">Grant Status</p>
              <p className="font-bold">Exceeds Grant Ceiling — discretionary top-up needed</p>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!costed ? (
            <span className="text-sm text-muted-foreground">Confirm Step 1 (Schedule of Works) above to enable funding review.</span>
          ) : reviewed && !(validContribution && parsed !== c.funding!.applicantContribution) && !overrideGrant ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
                <CheckCircle2 className="h-4 w-4" /> Funding review completed on {formatDate(c.funding!.reviewedAt)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOverrideGrant(true)}
                className="cursor-pointer text-xs"
              >
                <Edit3 className="h-3.5 w-3.5" /> Override Grant
              </Button>
            </div>
          ) : (
            <Button onClick={review} disabled={busy !== null} className="cursor-pointer">
              {busy === "funding" && <Loader2 className="h-4 w-4 animate-spin" />}
              {reviewed ? "Update Funding Review" : "Complete Funding Review"}
            </Button>
          )}
        </div>
      </Section>

      {/* Navigation to Council Approval */}
      {reviewed && (
        <div className="pt-2">
          <Button asChild size="lg" className="cursor-pointer">
            <Link to="/cases/$id/approval" params={{ id }}>
              Continue to Council Approval <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
