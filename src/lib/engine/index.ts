import type { CaseDerived, CasePrimary, CaseStatus, Stage } from "@/lib/domain";
import { runRules, suggestLayoutFix } from "@/lib/rules";
import { buildScheduleOfWorks, fundingPosition } from "./costing";
import { generateLayout } from "./layout";
import { deriveNeeds } from "./needs";

/**
 * Central processing entry point. Every derived value the app shows comes from
 * here, so a different implementation can replace it without touching the UI.
 * Deterministic: the same primary data always yields the same output.
 */
export const ENGINE_VERSION = "rules-1.0";

export function processCase(c: CasePrimary): CaseDerived {
  if (!c.assessment) {
    return {
      engineVersion: ENGINE_VERSION,
      stage: "Assessment",
      status: deriveStatus("Assessment", c),
      needs: null,
      layout: null,
      rules: [],
      rulesPassed: 0,
      rulesReview: 0,
      suggestion: null,
      designApproved: false,
      works: [],
      funding: null,
    };
  }

  const needs = deriveNeeds(c.assessment);
  const { layout } = generateLayout(c.assessment, needs, c.design);
  const rules = runRules(layout);
  const rulesPassed = rules.filter((r) => r.status === "passed").length;
  const designApproved = c.design !== null && rulesPassed === rules.length;
  const works = buildScheduleOfWorks(needs, layout);
  const funding = fundingPosition(works, c.funding?.applicantContribution ?? 0);

  const stage: Stage = !designApproved
    ? "Design"
    : c.costing?.confirmedTotal !== funding.total
      ? "Costing"
      : c.funding?.reviewedTotal !== funding.total
        ? "Funding Review"
        : c.decision?.outcome !== "Approved"
          ? "Council Approval"
          : "Approved";

  return {
    engineVersion: ENGINE_VERSION,
    stage,
    status: deriveStatus(stage, c),
    needs,
    layout,
    rules,
    rulesPassed,
    rulesReview: rules.length - rulesPassed,
    suggestion: suggestLayoutFix(layout, rules),
    designApproved,
    works,
    funding,
  };
}

function deriveStatus(stage: Stage, c: CasePrimary): CaseStatus {
  if (stage === "Approved") return "Approved";
  if (c.decision?.outcome === "Revision Requested") return "Revision Requested";
  if (stage === "Assessment" || stage === "Council Approval") return "Pending";
  return "In Progress";
}

export { deriveNeeds, describeForApplicant, doorRequirement } from "./needs";
export { generateLayout, moveWc } from "./layout";
export { buildScheduleOfWorks, fundingPosition, MAX_GRANT, RATES } from "./costing";
export { computeMetrics } from "./metrics";
