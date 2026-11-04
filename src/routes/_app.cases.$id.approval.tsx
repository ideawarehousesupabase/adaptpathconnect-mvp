import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, FileText, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KV, Section, StatusPill, Timeline } from "@/components/app/ui-bits";
import { CaseError, recordDecision } from "@/lib/cases";
import { describeError } from "@/lib/firebase";
import { formatDate, formatDateTime, gbp } from "@/lib/domain";
import { RULESET } from "@/lib/rules";
import { caseRecords, workflowSteps } from "@/lib/workflow";
import { useCase, useCaseEvents, useCurrentUser } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/approval")({
  component: Approval,
});

function Approval() {
  const { id } = Route.useParams();
  const session = useCurrentUser();
  const c = useCase(id)!;
  const events = useCaseEvents(id);
  const d = c.derived;
  const a = c.assessment;
  const f = d.funding;
  const reviewed = c.funding !== null && f !== null && c.funding.reviewedTotal === f.total;
  const issuesResolved = events.filter((e) => e.type === "accessibility_issue").length > 0 && d.designApproved;
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = c.stage === "Council Approval";
  const canRevise = c.stage !== "Assessment";

  async function decide(outcome: "Approved" | "Revision Requested") {
    if (outcome === "Revision Requested" && !note.trim()) { toast.error("Please add a note explaining the revision."); return; }
    setBusy(true);
    try {
      await recordDecision(session, id, outcome, note);
      if (outcome === "Approved") toast.success("Case approved successfully.");
      else { toast.info("Revision requested."); setRevising(false); setNote(""); }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof CaseError ? err.message : describeError(err, "Could not record the decision. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Section title="Case Workflow"><Timeline steps={workflowSteps(c)} /></Section>
      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Applicant Summary">
          <KV k="Name" v={c.applicant} /><KV k="Date of birth" v={c.dateOfBirth ? formatDate(c.dateOfBirth) : "—"} /><KV k="Address" v={c.address} /><KV k="Local authority" v={c.localAuthority} />
        </Section>
        <Section title="OT Assessment Summary">
          <KV k="Assessor" v={c.assignedOt} />
          <KV k="Mobility" v={a?.mobility ?? "—"} />
          <KV k="Transfer" v={d.needs?.transfer ?? "—"} />
          <KV k="Carer support" v={a?.carerSupport ?? "—"} />
        </Section>
        <Section title="Needs Profile">
          {d.needs && d.needs.features.length > 0 ? (
            <ul className="space-y-1.5 text-sm">{d.needs.features.map((x) => <li key={x.id} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-success" />{x.name}</li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">{a ? "No features recommended." : "Assessment not completed."}</p>}
        </Section>
        <Section title="Bathroom Design Summary">
          <KV k="Version" v={c.design ? `V${c.design.version}` : "Not saved"} />
          <KV k="Room" v={d.layout ? `${d.layout.roomW} × ${d.layout.roomD} mm` : "—"} />
          <KV k="WC side clearance" v={d.rules.find((r) => r.id === "wc")?.measured ?? "—"} />
        </Section>
        <Section title="Accessibility Check Status">
          <KV k="Ruleset" v={RULESET.version} />
          <KV k="Result" v={d.layout ? <span className={d.rulesReview ? "text-warning" : "text-success"}>{d.rulesPassed} Passed{d.rulesReview > 0 && ` · ${d.rulesReview} Review`}</span> : "—"} />
          <KV k="Issues resolved" v={issuesResolved ? "Yes" : events.some((e) => e.type === "accessibility_issue") ? "Outstanding" : "None raised"} />
        </Section>
        <Section title="Estimated Cost & Funding">
          <KV k="Estimated cost" v={f ? gbp(f.total) : "—"} />
          <KV k="DFG contribution" v={reviewed ? gbp(f!.dfg) : "—"} />
          <KV k="Applicant contribution" v={reviewed ? gbp(f!.applicant) : "—"} />
          <KV k="Position" v={reviewed ? <span className={f!.withinLimit ? "text-success" : "text-destructive"}>{f!.withinLimit ? "Within limit" : "Exceeds ceiling"}</span> : "Not reviewed"} />
        </Section>
        <Section title="Case Records">
          <ul className="space-y-2 text-sm">
            {caseRecords(c).map((r) => <li key={r.name} className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />{r.name}<span className="ml-auto text-xs text-muted-foreground">{formatDate(r.at)}</span></li>)}
          </ul>
        </Section>
        <Section title="Case History" className="lg:col-span-2">
          <ul className="space-y-2 text-sm">
            {events.slice(-6).map((e) => {
              const t = formatDateTime(e.at);
              return <li key={e.id} className="flex gap-3"><span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">{t.date} {t.time}</span>{e.action}</li>;
            })}
            {events.length === 0 && <li className="text-muted-foreground">No history recorded.</li>}
          </ul>
        </Section>
      </div>

      <Section title="Council Decision" action={<StatusPill status={c.status} />}>
        {c.stage === "Approved" ? (
          <p className="flex items-center gap-2 rounded-lg bg-success-soft p-4 font-semibold text-success">
            <CheckCircle2 className="h-5 w-5" /> Case approved{c.decision ? ` by ${c.decision.by} on ${formatDate(c.decision.at)}` : ""}.
          </p>
        ) : (
          <>
            {c.decision?.outcome === "Revision Requested" && <p className="mb-4 rounded-lg bg-destructive-soft p-3 text-sm"><span className="font-semibold">Revision note:</span> {c.decision.note}</p>}
            {!ready && <p className="mb-4 text-sm text-muted-foreground">The case can be approved once the design, schedule of works and funding review are complete. Current stage: {c.stage}.</p>}
            {revising && (
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="note">Revision note</Label>
                <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe what needs to change…" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide("Approved")} disabled={!ready || busy}>{busy && !revising ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve Case</Button>
              {revising
                ? <Button variant="outline" onClick={() => decide("Revision Requested")} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit Revision Request</Button>
                : <Button variant="outline" onClick={() => setRevising(true)} disabled={!canRevise}><RotateCcw className="h-4 w-4" /> Request Revision</Button>}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
