import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Loader2, PenTool, PoundSterling } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Pill, Section } from "@/components/app/ui-bits";
import { CaseError, completeFundingReview, confirmCosting } from "@/lib/cases";
import { describeError } from "@/lib/firebase";
import { formatDate, gbp } from "@/lib/domain";
import { fundingPosition } from "@/lib/engine";
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

  useEffect(() => {
    if (c.funding) setContribution(String(c.funding.applicantContribution));
  }, [c.funding?.applicantContribution]);

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

  const parsed = contribution.trim() === "" ? NaN : Number(contribution);
  const validContribution = Number.isFinite(parsed) && parsed >= 0 && parsed <= stored.total;
  // Preview the position for the contribution being typed; stored values once reviewed.
  const f =
    reviewed && !(validContribution && parsed !== c.funding!.applicantContribution)
      ? stored
      : fundingPosition(d.works, validContribution ? parsed : 0);
  const pct = Math.min(100, (f.dfg / f.ceiling) * 100);

  async function confirm() {
    setBusy("costing");
    setError("");
    try {
      await confirmCosting(session, id);
      toast.success("Schedule of works confirmed.");
    } catch (err) {
      setError(failMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function review() {
    if (!validContribution) return setError(`Enter an applicant contribution between £0 and ${gbp(stored!.total)}.`);
    setBusy("funding");
    setError("");
    try {
      await completeFundingReview(session, id, parsed);
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
                Lock the itemised builder quotation ({gbp(stored.total)}) based on the saved design.
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
                Enter means-test applicant contribution and check against statutory £30,000 ceiling.
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
        description={`Itemised line items generated from bathroom design (V${c.design.version}).`}
        action={<Pill t="info">Unit Rates Applied</Pill>}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Item</th>
              <th className="py-2">Source</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {d.works.map((w) => (
              <tr key={w.item} className="border-b border-border">
                <td className="py-2.5 font-medium">{w.item}</td>
                <td className="py-2.5">
                  {w.fromDesign ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                      <PenTool className="h-3 w-3" /> From design
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Associated works</span>
                  )}
                </td>
                <td className="tabular py-2.5 text-right">{w.qty ?? "—"}</td>
                <td className="tabular py-2.5 text-right font-medium">{gbp(w.cost)}</td>
              </tr>
            ))}
            {d.works.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  The assessment did not call for any works.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 font-semibold text-base">
                Total Estimated Cost
              </td>
              <td className="tabular pt-3 text-right text-lg font-bold text-primary">{gbp(stored.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {costed ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
              <CheckCircle2 className="h-4 w-4" /> Confirmed on {formatDate(c.costing!.confirmedAt)}
            </span>
          ) : (
            <>
              <Button onClick={confirm} disabled={busy !== null} className="cursor-pointer">
                {busy === "costing" && <Loader2 className="h-4 w-4 animate-spin" />} Confirm Schedule of Works
              </Button>
              {c.costing && <span className="text-sm text-warning">Costs changed since the last confirmation.</span>}
            </>
          )}
        </div>
      </Section>

      {/* DFG Grant & Means-test Assessment */}
      <Section title="DFG Funding Assessment" description="Statutory grant calculation against applicant means-test.">
        <div className="mb-5 max-w-xs space-y-1.5">
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Estimated Adaptation Cost", f.total],
            ["Applicant Contribution", f.applicant],
            ["Potential DFG Contribution", f.dfg],
            ["Maximum Grant Ceiling", f.ceiling],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-4 bg-card">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="tabular mt-1 text-xl font-bold">{gbp(v as number)}</p>
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
          ) : reviewed && !(validContribution && parsed !== c.funding!.applicantContribution) ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
              <CheckCircle2 className="h-4 w-4" /> Funding review completed on {formatDate(c.funding!.reviewedAt)}
            </span>
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
