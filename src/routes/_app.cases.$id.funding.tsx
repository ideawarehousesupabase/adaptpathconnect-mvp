import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PenTool } from "lucide-react";
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
  }, [c.funding?.applicantContribution]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d.designApproved || !stored) {
    return (
      <Section>
        <EmptyState
          title="No costed design yet"
          body="The schedule of works is generated from a saved bathroom design that passes every accessibility check."
          action={<Button asChild><Link to={c.assessment ? "/cases/$id/design" : "/cases/$id/assessment"} params={{ id }}>{c.assessment ? "Go to Bathroom Design" : "Go to OT Assessment"}</Link></Button>}
        />
      </Section>
    );
  }

  const parsed = contribution.trim() === "" ? NaN : Number(contribution);
  const validContribution = Number.isFinite(parsed) && parsed >= 0 && parsed <= stored.total;
  // Preview the position for the contribution being typed; stored values once reviewed.
  const f = reviewed && !(validContribution && parsed !== c.funding!.applicantContribution)
    ? stored
    : fundingPosition(d.works, validContribution ? parsed : 0);
  const pct = Math.min(100, (f.dfg / f.ceiling) * 100);

  async function confirm() {
    setBusy("costing"); setError("");
    try {
      await confirmCosting(session, id);
      toast.success("Schedule of works confirmed.");
    } catch (err) { setError(failMessage(err)); } finally { setBusy(null); }
  }

  async function review() {
    if (!validContribution) return setError(`Enter an applicant contribution between £0 and ${gbp(stored!.total)}.`);
    setBusy("funding"); setError("");
    try {
      await completeFundingReview(session, id, parsed);
      toast.success("Funding assessment completed.");
    } catch (err) { setError(failMessage(err)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <Section title="Schedule of Works" description={`Line items generated from the bathroom design (V${c.design!.version}).`} action={<Pill t="warning">Illustrative costs</Pill>}>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2">Item</th><th className="py-2">Source</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Cost</th></tr></thead>
          <tbody>
            {d.works.map((w) => (
              <tr key={w.item} className="border-b border-border">
                <td className="py-2.5 font-medium">{w.item}</td>
                <td className="py-2.5">{w.fromDesign ? <span className="inline-flex items-center gap-1 text-xs text-primary"><PenTool className="h-3 w-3" /> From design</span> : <span className="text-xs text-muted-foreground">Associated works</span>}</td>
                <td className="tabular py-2.5 text-right">{w.qty ?? "—"}</td>
                <td className="tabular py-2.5 text-right">{gbp(w.cost)}</td>
              </tr>
            ))}
            {d.works.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">The assessment did not call for any works.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={3} className="pt-3 font-semibold">Total Estimated Cost</td><td className="tabular pt-3 text-right text-lg font-bold">{gbp(stored.total)}</td></tr></tfoot>
        </table>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {costed ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Confirmed {formatDate(c.costing!.confirmedAt)}</span>
          ) : (
            <>
              <Button onClick={confirm} disabled={busy !== null}>{busy === "costing" && <Loader2 className="h-4 w-4 animate-spin" />} Confirm Schedule of Works</Button>
              {c.costing && <span className="text-sm text-warning">Costs changed since the last confirmation.</span>}
            </>
          )}
        </div>
      </Section>
      <Section title="DFG Funding Assessment" description="Illustrative values — not a statutory means test.">
        <div className="mb-5 max-w-xs space-y-1.5">
          <Label htmlFor="contribution">Applicant contribution (£, from the means test)</Label>
          <Input id="contribution" inputMode="numeric" placeholder="0" value={contribution} onChange={(e) => setContribution(e.target.value)} disabled={!costed} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[["Estimated Adaptation Cost", f.total], ["Applicant Contribution", f.applicant], ["Potential DFG Contribution", f.dfg], ["Maximum Grant Ceiling", f.ceiling]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="tabular mt-1 text-xl font-bold">{gbp(v as number)}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>DFG contribution vs grant ceiling</span><span>{((f.dfg / f.ceiling) * 100).toFixed(0)}%</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-muted"><div className={f.withinLimit ? "h-full rounded-full bg-success" : "h-full rounded-full bg-destructive"} style={{ width: `${pct}%` }} /></div>
        </div>
        {f.withinLimit ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-success-soft p-4 text-success">
            <CheckCircle2 className="h-6 w-6" />
            <div><p className="text-xs font-semibold uppercase tracking-wider">Funding Status</p><p className="font-bold">Within Available Grant Limit</p></div>
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-destructive-soft p-4 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <div><p className="text-xs font-semibold uppercase tracking-wider">Funding Status</p><p className="font-bold">Exceeds Grant Ceiling — discretionary top-up needed</p></div>
          </div>
        )}
        {error && <p role="alert" className="mt-4 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!costed ? (
            <span className="text-sm text-muted-foreground">Confirm the schedule of works to complete the funding review.</span>
          ) : reviewed && !(validContribution && parsed !== c.funding!.applicantContribution) ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Funding review completed {formatDate(c.funding!.reviewedAt)}</span>
          ) : (
            <Button onClick={review} disabled={busy !== null}>{busy === "funding" && <Loader2 className="h-4 w-4 animate-spin" />} {reviewed ? "Update Funding Review" : "Complete Funding Review"}</Button>
          )}
        </div>
      </Section>
    </div>
  );
}
