import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { UserRound, ClipboardCheck, PenTool, PoundSterling, Landmark, BadgeCheck, ArrowRight, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { KV, Section, StatusPill, Timeline } from "@/components/app/ui-bits";
import { referralFields, type ReferralForm } from "@/components/app/referral-fields";
import { CaseError, deleteCase, updateReferral } from "@/lib/cases";
import { describeError } from "@/lib/firebase";
import { formatDate, gbp, type DfgCase } from "@/lib/domain";
import { validateReferral } from "@/lib/validation";
import { progressSteps } from "@/lib/workflow";
import { useCase, useCurrentUser, useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/")({
  component: Overview,
});

type CaseTab = "/cases/$id" | "/cases/$id/assessment" | "/cases/$id/design" | "/cases/$id/funding" | "/cases/$id/approval";

/** What the case needs next, derived from its stage. */
function nextStep(c: DfgCase): { label: string; to: CaseTab } | null {
  switch (c.stage) {
    case "Assessment": return { label: "Complete the OT assessment", to: "/cases/$id/assessment" };
    case "Design": return { label: c.design ? "Resolve accessibility issues in the design" : "Create the bathroom design", to: "/cases/$id/design" };
    case "Costing": return { label: "Confirm the schedule of works", to: "/cases/$id/funding" };
    case "Funding Review": return { label: "Complete the funding review", to: "/cases/$id/funding" };
    case "Council Approval": return { label: "Record the council decision", to: "/cases/$id/approval" };
    default: return null;
  }
}

function Overview() {
  const { id } = Route.useParams();
  const c = useCase(id)!;
  const d = c.derived;
  const reviewed = c.funding !== null && d.funding !== null && c.funding.reviewedTotal === d.funding.total;
  const next = nextStep(c);
  const cards: { icon: typeof UserRound; title: string; to: CaseTab; rows: [string, string][] }[] = [
    { icon: UserRound, title: "Applicant", to: "/cases/$id", rows: [["Name", c.applicant], ["Address", c.address], ["Referral", formatDate(c.referralDate)]] },
    { icon: ClipboardCheck, title: "Assessment", to: "/cases/$id/assessment", rows: [["Assigned OT", c.assignedOt], ["Mobility", c.assessment?.mobility ?? "—"], ["Status", c.assessment ? "Completed" : "Not started"]] },
    {
      icon: PenTool, title: "Design", to: "/cases/$id/design",
      rows: [
        ["Version", c.design ? `V${c.design.version}` : "Not saved"],
        ["Room", c.assessment ? `${c.assessment.roomLength} × ${c.assessment.roomWidth} mm` : "—"],
        ["Rules check", d.layout ? `${d.rulesPassed} / ${d.rules.length} passed` : "—"],
      ],
    },
    { icon: PoundSterling, title: "Estimated Cost", to: "/cases/$id/funding", rows: [["Schedule of works", d.funding ? gbp(d.funding.total) : "—"], ["Line items", d.works.length ? String(d.works.length) : "—"]] },
    {
      icon: Landmark, title: "Funding Position", to: "/cases/$id/funding",
      rows: [
        ["DFG contribution", reviewed ? gbp(d.funding!.dfg) : "—"],
        ["Applicant", reviewed ? gbp(d.funding!.applicant) : "—"],
        ["Status", reviewed ? (d.funding!.withinLimit ? "Within limit" : "Exceeds ceiling") : "Not reviewed"],
      ],
    },
    { icon: BadgeCheck, title: "Approval Status", to: "/cases/$id/approval", rows: [["Local authority", c.localAuthority], ["Decision", c.stage === "Approved" ? "Approved" : c.decision?.outcome ?? "Pending"]] },
  ];
  return (
    <div className="space-y-6">
      <Section
        title="Case Progress"
        action={next && <Button asChild size="sm"><Link to={next.to} params={{ id }}>{next.label} <ArrowRight className="h-4 w-4" /></Link></Button>}
      >
        <Timeline steps={progressSteps(c)} />
      </Section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ icon: Icon, title, rows, to }) => (
          <Link key={title} to={to} params={{ id }} className="card-surface block p-5 transition-shadow hover:shadow-md">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-primary"><Icon className="h-4 w-4" /></div>
              <h3 className="font-semibold">{title}</h3>
              {title === "Approval Status" && <span className="ml-auto"><StatusPill status={c.status} /></span>}
            </div>
            {rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <EditDetails c={c} />
        <DeleteCase c={c} />
      </div>
    </div>
  );
}

function EditDetails({ c }: { c: DfgCase }) {
  const session = useCurrentUser();
  const { cases } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const initial: ReferralForm = {
    applicant: c.applicant, dateOfBirth: c.dateOfBirth, address: c.address, phone: c.phone, id: c.id,
    referralDate: c.referralDate, assignedOt: c.assignedOt, localAuthority: c.localAuthority,
  };
  const [f, setF] = useState(initial);
  const groups = referralFields({ f, set: (k, v) => setF({ ...f, [k]: v }), otSuggestions: [...new Set(cases.map((x) => x.assignedOt))], showId: false });

  async function save() {
    const res = validateReferral({ ...f, id: undefined });
    if (!res.ok) return setErrors(res.errors);
    setBusy(true);
    try {
      await updateReferral(session, c.id, res.value);
      toast.success("Case details updated.");
      setOpen(false);
    } catch (err) {
      console.error(err);
      setErrors([err instanceof CaseError ? err.message : describeError(err, "Could not save to the database. Try again.")]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setF(initial); setErrors([]); } }}>
      <Button variant="outline" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /> Edit Details</Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit case details</DialogTitle>
          <DialogDescription>{c.id} · referral and applicant information.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {groups.applicant}
          {groups.caseDetails}
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{errors.map((x) => <li key={x}>{x}</li>)}</ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCase({ c }: { c: DfgCase }) {
  const session = useCurrentUser();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await deleteCase(session, c.id);
      toast.success(`Case ${c.id} deleted.`);
      nav({ to: "/cases" });
    } catch (err) {
      console.error(err);
      toast.error(describeError(err, "Could not delete the case. Try again."));
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> Delete Case</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete case {c.id}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the case for {c.applicant}, including its assessment, design, costs, decision and audit trail. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void remove(); }} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
