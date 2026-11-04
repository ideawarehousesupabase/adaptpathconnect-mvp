import { describe, expect, it } from "vitest";
import type { Assessment, AuditEvent, CasePrimary, DfgCase } from "@/lib/domain";
import { computeMetrics, deriveNeeds, generateLayout, moveWc, processCase } from "@/lib/engine";
import { runRules, suggestLayoutFix, wcSideClearance } from "./rules";
import { nextCaseRef } from "./cases";
import { parseCsv, parseReferralCsv, validateAssessment, EMPTY_ASSESSMENT } from "./validation";

const assessment: Assessment = {
  mobility: "Wheelchair",
  transfer: "Assisted",
  carerSupport: "Yes",
  existingBathroom: ["Bath", "Toilet", "Basin"],
  needs: ["Level-access shower required", "Shower seat required", "Grab rails required", "Accessible WC required", "Accessible basin required"],
  roomLength: 2400,
  roomWidth: 2100,
  doorWidth: 900,
  rangeOfMovement: "", existingAdaptations: "", bathingRoutine: "", prognosis: "", otNotes: "",
  completedAt: "2026-10-01T09:00:00.000Z",
};

const base: CasePrimary = {
  id: "DFG-2026-001", applicant: "Test Applicant", dateOfBirth: "", address: "1 Test Street", phone: "",
  referralDate: "2026-09-28", assignedOt: "OT", localAuthority: "Council", adaptation: "Accessible Bathroom",
  assessment: null, design: null, costing: null, funding: null, decision: null,
  createdAt: "2026-09-28T09:00:00.000Z", updatedAt: "2026-09-28T09:00:00.000Z",
};

describe("needs profile", () => {
  it("maps assessment answers to features with their sources", () => {
    const n = deriveNeeds(assessment);
    expect(n.mobility).toBe("Wheelchair user");
    expect(n.priority).toBe("Safe assisted bathing");
    expect(n.features.map((f) => f.id)).toEqual(["shower", "seat", "rails", "wc", "basin", "circulation", "bathRemoval"]);
  });
  it("recommends door widening when the door is too narrow for a wheelchair", () => {
    const n = deriveNeeds({ ...assessment, doorWidth: 760 });
    expect(n.features.find((f) => f.id === "door")).toMatchObject({ name: "Door widening to 900 mm", source: "Door width: 760 mm" });
  });
});

describe("layout and accessibility rules", () => {
  const needs = deriveNeeds(assessment);
  const { layout } = generateLayout(assessment, needs, null);

  it("generates a layout that passes every applicable check", () => {
    expect(wcSideClearance(layout)).toBe(750);
    const rules = runRules(layout);
    expect(rules.map((r) => r.id)).toEqual(["turning", "wc", "door", "basin", "shower"]);
    expect(rules.every((r) => r.status === "passed")).toBe(true);
  });

  it("flags a WC moved too close and suggests the fix", () => {
    const moved = moveWc(layout, 1400);
    const rules = runRules(moved);
    expect(rules.find((r) => r.id === "wc")?.status).toBe("review");
    expect(rules.filter((r) => r.status === "passed")).toHaveLength(4);
    expect(suggestLayoutFix(moved, rules)?.wcX).toBe(1550);
  });

  it("only runs checks the applicant's needs call for", () => {
    const a: Assessment = { ...assessment, mobility: "Independent", transfer: "Independent", needs: ["Grab rails required"] };
    const { layout: l } = generateLayout(a, deriveNeeds(a), null);
    expect(runRules(l).map((r) => r.id)).toEqual(["door"]);
  });

  it("cannot suggest a fix when the room is too narrow", () => {
    const a = { ...assessment, roomLength: 1700 };
    const { layout: l } = generateLayout(a, deriveNeeds(a), null);
    const rules = runRules(l);
    expect(rules.find((r) => r.id === "wc")?.status).toBe("review");
    expect(suggestLayoutFix(l, rules)).toBeNull();
  });
});

describe("processCase", () => {
  it("is deterministic", () => {
    const c = { ...base, assessment };
    expect(processCase(c)).toEqual(processCase(c));
  });

  it("walks the stages as primary data is added", () => {
    expect(processCase(base)).toMatchObject({ stage: "Assessment", status: "Pending", needs: null });
    const assessed = { ...base, assessment };
    expect(processCase(assessed)).toMatchObject({ stage: "Design", status: "In Progress", designApproved: false });

    const designed = { ...assessed, design: { wcX: 1550, version: 1, savedAt: "2026-10-02T09:00:00.000Z" } };
    const d = processCase(designed);
    expect(d).toMatchObject({ stage: "Costing", designApproved: true });
    expect(d.funding!.total).toBe(9400);

    const costed = { ...designed, costing: { confirmedAt: "x", confirmedTotal: 9400 } };
    expect(processCase(costed).stage).toBe("Funding Review");
    const funded = { ...costed, funding: { applicantContribution: 1250, reviewedAt: "x", reviewedTotal: 9400 } };
    expect(processCase(funded)).toMatchObject({ stage: "Council Approval", status: "Pending", funding: { dfg: 8150, withinLimit: true } });
    const approved = { ...funded, decision: { outcome: "Approved" as const, note: "", at: "x", by: "M" } };
    expect(processCase(approved)).toMatchObject({ stage: "Approved", status: "Approved" });
  });

  it("re-opens costing when an assessment change alters the total", () => {
    const c: CasePrimary = {
      ...base,
      assessment: { ...assessment, doorWidth: 700 },
      design: { wcX: 1550, version: 1, savedAt: "x" },
      costing: { confirmedAt: "x", confirmedTotal: 9400 },
    };
    expect(processCase(c).stage).toBe("Costing");
  });

  it("keeps a design that fails a check in the Design stage", () => {
    const c = { ...base, assessment, design: { wcX: 1400, version: 2, savedAt: "x" } };
    expect(processCase(c)).toMatchObject({ stage: "Design", designApproved: false, rulesReview: 1 });
  });
});

describe("pilot metrics", () => {
  it("shows no values for an empty account", () => {
    const { metrics, trend } = computeMetrics([], []);
    expect(metrics.find((m) => m.label.startsWith("Average Assessment"))?.value).toBe("—");
    expect(trend).toEqual([]);
  });

  it("measures assessment to approved design from audit events", () => {
    const primary = { ...base, assessment, design: { wcX: 1550, version: 2, savedAt: "x" } };
    const c: DfgCase = { ...primary, derived: processCase(primary), stage: "Costing", status: "In Progress" };
    const ev = (type: AuditEvent["type"], at: string): AuditEvent => ({ id: at + type, caseId: c.id, userId: "u1", type, action: "", detail: "", at, user: "", role: "" });
    const { metrics, trend } = computeMetrics([c], [
      ev("assessment_completed", "2026-10-01T09:00:00.000Z"),
      ev("design_saved", "2026-10-03T09:00:00.000Z"),
      ev("accessibility_issue", "2026-10-03T09:00:00.000Z"),
      ev("design_saved", "2026-10-05T09:00:00.000Z"),
      ev("design_approved", "2026-10-05T09:00:00.000Z"),
    ]);
    expect(metrics[0]!.value).toBe("4.0 Days");
    expect(metrics.find((m) => m.label === "Design Rework Rate")?.value).toBe("100%");
    expect(trend).toHaveLength(1);
  });
});

describe("input validation", () => {
  it("requires the core assessment answers and sane measurements", () => {
    const res = validateAssessment({ ...EMPTY_ASSESSMENT, roomLength: "90" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toContain("Room length must be a whole number between 1200 and 8000 mm.");
  });

  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("reports row-level errors in a referrals CSV", () => {
    const csv = "applicant,address,referralDate,assignedOt,localAuthority\nAnn,1 Road,2026-10-01,OT,Council\n,2 Road,bad,OT,Council\n";
    const res = parseReferralCsv(csv);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toEqual(["Row 3: Applicant name is required.", "Row 3: Referral date must be a valid date (YYYY-MM-DD)."]);
  });

  it("allocates the next free case reference", () => {
    expect(nextCaseRef([], 2026)).toBe("DFG-2026-001");
    expect(nextCaseRef(["DFG-2026-001", "DFG-2026-007", "OTHER"], 2026)).toBe("DFG-2026-008");
  });
});
