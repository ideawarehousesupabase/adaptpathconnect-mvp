import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, FileText, Loader2, RotateCcw, Wrench, ShieldCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KV, Pill, Section, StatusPill, Timeline } from "@/components/app/ui-bits";
import { CaseError, recordDecision, acceptInstallation, acceptCompletion } from "@/lib/cases";
import { describeError } from "@/lib/firebase";
import { formatDate, formatDateTime, gbp } from "@/lib/domain";
import { RULESET } from "@/lib/rules";
import { caseRecords, workflowSteps } from "@/lib/workflow";
import { useCase, useCaseEvents, useCurrentUser } from "@/lib/workspace";
import { cn } from "@/lib/utils";

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
  const [busyMilestone, setBusyMilestone] = useState<"installation" | "completion" | null>(null);
  const ready = c.stage === "Council Approval";
  const canRevise = c.stage !== "Assessment";

  async function decide(outcome: "Approved" | "Revision Requested") {
    if (outcome === "Revision Requested" && !note.trim()) {
      toast.error("Please add a note explaining the revision.");
      return;
    }
    setBusy(true);
    try {
      await recordDecision(session, id, outcome, note);
      if (outcome === "Approved") toast.success("Case approved successfully.");
      else {
        toast.info("Revision requested.");
        setRevising(false);
        setNote("");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof CaseError ? err.message : describeError(err, "Could not record the decision. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptInstallation() {
    setBusyMilestone("installation");
    try {
      await acceptInstallation(session, id);
      toast.success("Installation stage accepted and confirmed.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof CaseError ? err.message : describeError(err, "Could not accept installation."));
    } finally {
      setBusyMilestone(null);
    }
  }

  async function handleAcceptCompletion() {
    setBusyMilestone("completion");
    try {
      await acceptCompletion(session, id);
      toast.success("Final completion accepted and signed off.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof CaseError ? err.message : describeError(err, "Could not accept completion."));
    } finally {
      setBusyMilestone(null);
    }
  }

  function handleTimelineStepClick(label: string) {
    if (label === "Installation") {
      if (c.stage !== "Approved") {
        toast.warning("The case must be approved by the council before installation can be accepted.");
        return;
      }
      if (c.installation) {
        toast.info(`Installation was already accepted on ${formatDate(c.installation.at)}.`);
        return;
      }
      handleAcceptInstallation();
    } else if (label === "Completion") {
      if (c.stage !== "Approved") {
        toast.warning("The case must be approved by the council first.");
        return;
      }
      if (!c.installation) {
        toast.warning("Installation must be accepted before final completion can be signed off.");
        return;
      }
      if (c.completion) {
        toast.info(`Final completion was signed off on ${formatDate(c.completion.at)}.`);
        return;
      }
      handleAcceptCompletion();
    }
  }

  return (
    <div className="space-y-5">
      <Section
        title="Case Workflow"
        description="Click on any post-approval step (Installation / Completion) to manually accept it."
      >
        <Timeline steps={workflowSteps(c)} onStepClick={handleTimelineStepClick} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Applicant Summary">
          <KV k="Name" v={c.applicant} />
          <KV k="Date of birth" v={c.dateOfBirth ? formatDate(c.dateOfBirth) : "—"} />
          <KV k="Address" v={c.address} />
          <KV k="Local authority" v={c.localAuthority} />
        </Section>
        <Section title="OT Assessment Summary">
          <KV k="Assessor" v={c.assignedOt} />
          <KV k="Mobility" v={a?.mobility ?? "—"} />
          <KV k="Transfer" v={d.needs?.transfer ?? "—"} />
          <KV k="Carer support" v={a?.carerSupport ?? "—"} />
        </Section>
        <Section title="Needs Profile">
          {d.needs && d.needs.features.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {d.needs.features.map((x) => (
                <li key={x.id} className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  {x.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{a ? "No features recommended." : "Assessment not completed."}</p>
          )}
        </Section>
        <Section title="Bathroom Design Summary">
          <KV k="Version" v={c.design ? `V${c.design.version}` : "Not saved"} />
          <KV k="Room" v={d.layout ? `${d.layout.roomW} × ${d.layout.roomD} mm` : "—"} />
          <KV k="WC side clearance" v={d.rules.find((r) => r.id === "wc")?.measured ?? "—"} />
        </Section>
        <Section title="Accessibility Check Status">
          <KV k="Ruleset" v={RULESET.version} />
          <KV
            k="Result"
            v={
              d.layout ? (
                <span className={d.rulesReview ? "text-warning" : "text-success"}>
                  {d.rulesPassed} Passed{d.rulesReview > 0 && ` · ${d.rulesReview} Review`}
                </span>
              ) : (
                "—"
              )
            }
          />
          <KV
            k="Issues resolved"
            v={issuesResolved ? "Yes" : events.some((e) => e.type === "accessibility_issue") ? "Outstanding" : "None raised"}
          />
        </Section>
        <Section title="Estimated Cost & Funding">
          <KV k="Estimated cost" v={f ? gbp(f.total) : "—"} />
          <KV k="DFG contribution" v={reviewed ? gbp(f!.dfg) : "—"} />
          <KV k="Applicant contribution" v={reviewed ? gbp(f!.applicant) : "—"} />
          <KV
            k="Position"
            v={
              reviewed ? (
                <span className={f!.withinLimit ? "text-success" : "text-destructive"}>
                  {f!.withinLimit ? "Within limit" : "Exceeds ceiling"}
                </span>
              ) : (
                "Not reviewed"
              )
            }
          />
        </Section>
        <Section title="Case Records">
          <ul className="space-y-2 text-sm">
            {caseRecords(c).map((r) => (
              <li key={r.name} className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {r.name}
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(r.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Case History" className="lg:col-span-2">
          <ul className="space-y-2 text-sm">
            {events.slice(-6).map((e) => {
              const t = formatDateTime(e.at);
              return (
                <li key={e.id} className="flex gap-3">
                  <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                    {t.date} {t.time}
                  </span>
                  {e.action}
                </li>
              );
            })}
            {events.length === 0 && <li className="text-muted-foreground">No history recorded.</li>}
          </ul>
        </Section>
      </div>

      {/* Council Decision Section */}
      <Section title="Council Decision" action={<StatusPill status={c.status} />}>
        {c.stage === "Approved" ? (
          <p className="flex items-center gap-2 rounded-lg bg-success-soft p-4 font-semibold text-success">
            <CheckCircle2 className="h-5 w-5" /> Case approved{c.decision ? ` by ${c.decision.by} on ${formatDate(c.decision.at)}` : ""}.
          </p>
        ) : (
          <>
            {c.decision?.outcome === "Revision Requested" && (
              <p className="mb-4 rounded-lg bg-destructive-soft p-3 text-sm">
                <span className="font-semibold">Revision note:</span> {c.decision.note}
              </p>
            )}
            {!ready && (
              <p className="mb-4 text-sm text-muted-foreground">
                The case can be approved once the design, schedule of works and funding review are complete. Current stage: {c.stage}.
              </p>
            )}
            {revising && (
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="note">Revision note</Label>
                <Textarea
                  id="note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Describe what needs to change…"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide("Approved")} disabled={!ready || busy}>
                {busy && !revising ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve Case
              </Button>
              {revising ? (
                <Button variant="outline" onClick={() => decide("Revision Requested")} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit Revision Request
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setRevising(true)} disabled={!canRevise}>
                  <RotateCcw className="h-4 w-4" /> Request Revision
                </Button>
              )}
            </div>
          </>
        )}
      </Section>

      {/* Manual Acceptance for Installation & Completion (Requirement 4) */}
      <Section
        title="Post-Approval Milestones: Installation & Completion"
        description="Manually accept installation and final completion by clicking the cards or buttons below."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {/* Step 7: Installation */}
          <div
            className={cn(
              "rounded-xl border p-5 transition-all",
              c.installation
                ? "border-success/40 bg-success-soft/20 shadow-sm"
                : c.stage === "Approved"
                  ? "border-primary/40 bg-card shadow-sm"
                  : "border-border bg-muted/40 opacity-75"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-xs font-bold",
                    c.installation
                      ? "bg-success text-success-foreground"
                      : c.stage === "Approved"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground text-background"
                  )}
                >
                  <Wrench className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Step 7: Installation</h4>
                  <p className="text-xs text-muted-foreground">Contractor bathroom adaptation works</p>
                </div>
              </div>
              {c.installation ? (
                <Pill t="success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
                </Pill>
              ) : c.stage === "Approved" ? (
                <Pill t="info">Awaiting Acceptance</Pill>
              ) : (
                <Pill>Locked</Pill>
              )}
            </div>

            {c.installation ? (
              <div className="mt-4 rounded-lg bg-card border border-border p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">✓ Installation accepted and confirmed</p>
                <p className="text-muted-foreground font-mono">Date: {formatDate(c.installation.at)}</p>
                <p className="text-muted-foreground">Accepted by: {c.installation.by}</p>
              </div>
            ) : c.stage === "Approved" ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Council approval has been granted. Click below to manually accept and confirm contractor installation.
                </p>
                <Button
                  size="sm"
                  onClick={handleAcceptInstallation}
                  disabled={busyMilestone !== null}
                  className="cursor-pointer"
                >
                  {busyMilestone === "installation" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Accept Installation
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                Unlocks once council grant approval is granted.
              </p>
            )}
          </div>

          {/* Step 8: Completion */}
          <div
            className={cn(
              "rounded-xl border p-5 transition-all",
              c.completion
                ? "border-success/40 bg-success-soft/20 shadow-sm"
                : c.installation
                  ? "border-primary/40 bg-card shadow-sm"
                  : "border-border bg-muted/40 opacity-75"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-xs font-bold",
                    c.completion
                      ? "bg-success text-success-foreground"
                      : c.installation
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground text-background"
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Step 8: Completion</h4>
                  <p className="text-xs text-muted-foreground">Final inspection and resident handover</p>
                </div>
              </div>
              {c.completion ? (
                <Pill t="success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Fully Signed Off
                </Pill>
              ) : c.installation ? (
                <Pill t="info">Ready for Sign-Off</Pill>
              ) : (
                <Pill>Locked</Pill>
              )}
            </div>

            {c.completion ? (
              <div className="mt-4 rounded-lg bg-card border border-border p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">✓ Project fully completed and signed off</p>
                <p className="text-muted-foreground font-mono">Date: {formatDate(c.completion.at)}</p>
                <p className="text-muted-foreground">Signed off by: {c.completion.by}</p>
              </div>
            ) : c.installation ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Installation is complete. Click below to manually accept and sign off final completion.
                </p>
                <Button
                  size="sm"
                  onClick={handleAcceptCompletion}
                  disabled={busyMilestone !== null}
                  className="cursor-pointer"
                >
                  {busyMilestone === "completion" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Accept & Sign Off Completion
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                Accept Installation (Step 7) first before signing off final completion.
              </p>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
