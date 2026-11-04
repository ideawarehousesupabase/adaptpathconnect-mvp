import type { AuditEvent, DfgCase, EventType } from "@/lib/domain";

export interface Metric {
  label: string;
  value: string;
  hint: string;
}

export interface TrendPoint {
  month: string;
  days: number;
}

const DAY = 86_400_000;
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;

/** Pilot indicators measured from the account's own case records and audit events. */
export function computeMetrics(cases: DfgCase[], events: AuditEvent[]): { metrics: Metric[]; trend: TrendPoint[] } {
  const ids = new Set(cases.map((c) => c.id));
  const byCase = new Map<string, AuditEvent[]>();
  for (const e of events) {
    if (!ids.has(e.caseId)) continue;
    const list = byCase.get(e.caseId) ?? [];
    list.push(e);
    byCase.set(e.caseId, list);
  }
  const of = (id: string, type: EventType) =>
    (byCase.get(id) ?? []).filter((e) => e.type === type).map((e) => Date.parse(e.at)).sort((a, b) => a - b);

  const assessToDesign: { days: number; at: number }[] = [];
  const referralToApproval: number[] = [];
  let designed = 0, reworked = 0, decided = 0, revised = 0, issues = 0, resolved = 0;

  for (const c of cases) {
    const assessed = of(c.id, "assessment_completed")[0];
    const approvedDesign = of(c.id, "design_approved").find((t) => assessed !== undefined && t >= assessed);
    if (assessed !== undefined && approvedDesign !== undefined) {
      assessToDesign.push({ days: (approvedDesign - assessed) / DAY, at: approvedDesign });
    }
    const granted = of(c.id, "approval_granted")[0];
    const referral = Date.parse(c.referralDate + "T00:00:00");
    if (granted !== undefined && !Number.isNaN(referral)) referralToApproval.push(Math.max(0, (granted - referral) / DAY));

    const saves = of(c.id, "design_saved").length;
    if (saves > 0) { designed++; if (saves > 1) reworked++; }
    const revisions = of(c.id, "revision_requested").length;
    if (granted !== undefined || revisions > 0) { decided++; if (revisions > 0) revised++; }
    const flagged = of(c.id, "accessibility_issue");
    issues += flagged.length;
    if (flagged.length > 0 && of(c.id, "design_approved").some((t) => t > flagged[0]!)) resolved++;
  }

  // Only reviews that still match the current costs count.
  const funded = cases.filter((c) => c.funding !== null && c.funding.reviewedTotal === c.derived.funding?.total);
  const within = funded.filter((c) => c.derived.funding!.withinLimit).length;
  const none = "No data yet";

  const metrics: Metric[] = [
    {
      label: "Average Assessment → Approved Design",
      value: assessToDesign.length ? `${avg(assessToDesign.map((x) => x.days)).toFixed(1)} Days` : "—",
      hint: assessToDesign.length ? `Across ${assessToDesign.length} case${assessToDesign.length === 1 ? "" : "s"}` : none,
    },
    {
      label: "Average Referral → Council Approval",
      value: referralToApproval.length ? `${avg(referralToApproval).toFixed(1)} Days` : "—",
      hint: referralToApproval.length ? `Across ${referralToApproval.length} approved case${referralToApproval.length === 1 ? "" : "s"}` : none,
    },
    {
      label: "Design Rework Rate",
      value: designed ? pct(reworked, designed) : "—",
      hint: designed ? `${reworked} of ${designed} designs saved more than once` : none,
    },
    {
      label: "Revision Request Rate",
      value: decided ? pct(revised, decided) : "—",
      hint: decided ? `${revised} of ${decided} decided cases` : none,
    },
    {
      label: "Accessibility Issues Identified",
      value: String(issues),
      hint: issues ? `${resolved} case${resolved === 1 ? "" : "s"} resolved by a later design` : "No issues flagged",
    },
    {
      label: "Cases Within Grant Limit",
      value: funded.length ? pct(within, funded.length) : "—",
      hint: funded.length ? `${within} of ${funded.length} funding reviews` : none,
    },
  ];

  const months = new Map<string, number[]>();
  for (const x of assessToDesign) {
    const d = new Date(x.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.set(key, [...(months.get(key) ?? []), x.days]);
  }
  const trend = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, days]) => ({
      month: new Date(key + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      days: Math.round(avg(days) * 10) / 10,
    }));

  return { metrics, trend };
}
