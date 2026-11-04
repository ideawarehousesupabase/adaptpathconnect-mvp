import type { StepState } from "@/components/app/ui-bits";
import type { DfgCase } from "@/lib/domain";

const ORDER = ["Referral", "OT Assessment", "Needs Profile", "Bathroom Design", "Costing", "Funding Review", "Council Approval"];
const stageIndex: Record<string, number> = {
  Assessment: 1, Design: 3, Costing: 4, "Funding Review": 5, "Council Approval": 6, Approved: 7,
};

export function progressSteps(c: DfgCase): { label: string; state: StepState }[] {
  const cur = stageIndex[c.stage] ?? 0;
  return ORDER.map((label, i) => ({
    label,
    state: i < cur ? "done" : i === cur ? "current" : "pending",
  }));
}

const DECISION_ORDER = ["Referral", "OT Assessment", "Needs Profile", "Bathroom Design", "Funding Review", "Council Approval"];
const decisionIndex: Record<string, number> = {
  Assessment: 1, Design: 3, Costing: 4, "Funding Review": 4, "Council Approval": 5, Approved: 6,
};

export function workflowSteps(c: DfgCase): { label: string; state: StepState }[] {
  const cur = decisionIndex[c.stage] ?? 0;
  return [
    ...DECISION_ORDER.map((label, i) => ({ label, state: (i < cur ? "done" : i === cur ? "current" : "future") as StepState })),
    { label: "Installation", state: "future" },
    { label: "Completion", state: "future" },
  ];
}

/** Records that exist for the case, in the order they were produced. */
export function caseRecords(c: DfgCase): { name: string; at: string }[] {
  const d = c.derived;
  const out = [{ name: `Referral ${c.id}`, at: c.createdAt }];
  if (c.assessment) out.push({ name: "OT Assessment", at: c.assessment.completedAt });
  if (c.design) out.push({ name: `Bathroom Design V${c.design.version}`, at: c.design.savedAt });
  if (c.costing && d.funding && c.costing.confirmedTotal === d.funding.total) out.push({ name: "Schedule of Works", at: c.costing.confirmedAt });
  if (c.funding && d.funding && c.funding.reviewedTotal === d.funding.total) out.push({ name: "Funding Assessment", at: c.funding.reviewedAt });
  return out;
}
