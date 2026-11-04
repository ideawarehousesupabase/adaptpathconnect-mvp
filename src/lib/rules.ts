import type { BathroomLayout, RuleResult, RuleStatus, Suggestion } from "@/lib/domain";

export type { RuleResult, RuleStatus } from "@/lib/domain";

export const RULESET = { source: "UK Accessibility Guidance", version: "Prototype Ruleset 1.0" };

export const WC_RULE_MIN_SIDE_CLEARANCE = 700;
/** Side-transfer space layouts aim for: the rule minimum plus a 50 mm tolerance. */
export const WC_TARGET_SIDE_CLEARANCE = WC_RULE_MIN_SIDE_CLEARANCE + 50;
const MIN_TURNING_DIAMETER = 1500;
const MAX_BASIN_PROJECTION = 500;

function get(layout: BathroomLayout, key: string) {
  const c = layout.components.find((c) => c.key === key);
  if (!c) throw new Error(`Missing ${key}`);
  return c;
}

/** Side transfer clearance: gap between the basin (open side) and the WC. */
export function wcSideClearance(layout: BathroomLayout) {
  const wc = get(layout, "wc");
  const basin = get(layout, "basin");
  return wc.x - (basin.x + basin.w);
}

/** Runs only the checks the applicant's assessed needs call for. */
export function runRules(layout: BathroomLayout): RuleResult[] {
  const req = layout.requirements;
  const door = get(layout, "door");
  const shower = get(layout, "shower");
  const clearance = wcSideClearance(layout);
  const r = (ok: boolean): RuleStatus => (ok ? "passed" : "review");
  const out: RuleResult[] = [];

  if (req.turningSpace) {
    const ok = layout.turningDiameter >= MIN_TURNING_DIAMETER;
    out.push({
      id: "turning", name: "Wheelchair Turning Space", category: "Turning circles / clear floor areas",
      status: r(ok), measured: `${layout.turningDiameter} mm Ø`, required: `≥ ${MIN_TURNING_DIAMETER} mm Ø`,
      message: ok
        ? "Clear turning circle available in the centre of the room."
        : "The room is too small for a full wheelchair turning circle. Consider extending into an adjoining space.",
    });
  }
  if (req.wcTransfer) {
    const ok = clearance >= WC_RULE_MIN_SIDE_CLEARANCE;
    out.push({
      id: "wc", name: "WC Transfer Clearance", category: "Transfer spaces",
      status: r(ok), measured: `${clearance} mm`, required: `≥ ${WC_RULE_MIN_SIDE_CLEARANCE} mm`,
      message: ok
        ? "Side transfer clearance meets the configured requirement."
        : "Current side transfer clearance is below the configured accessibility requirement.",
    });
  }
  {
    const ok = door.w >= req.minDoorWidth;
    out.push({
      id: "door", name: "Door Clearance", category: "Door clearances",
      status: r(ok), measured: `${door.w} mm`, required: `≥ ${req.minDoorWidth} mm`,
      message: ok ? "Door width allows access for the applicant's mobility aid." : "Door is narrower than the applicant's mobility requires.",
    });
  }
  if (req.seatedReach) {
    const ok = layout.basinProjection <= MAX_BASIN_PROJECTION;
    out.push({
      id: "basin", name: "Basin Reach Zone", category: "Reach zones",
      status: r(ok), measured: `${layout.basinProjection} mm`, required: `≤ ${MAX_BASIN_PROJECTION} mm projection`,
      message: ok ? "Tap controls within seated reach range." : "Basin projects too far for seated use. Add an accessible basin to the OT assessment.",
    });
  }
  if (req.levelShower) {
    const ok = layout.showerThreshold === 0 && shower.w >= 1200 && shower.d >= 900;
    out.push({
      id: "shower", name: "Shower Access", category: "Shower / wet-room access",
      status: r(ok),
      measured: `${shower.w} × ${shower.d} mm, ${layout.showerThreshold} mm step`, required: "≥ 1200 × 900 mm, level",
      message: ok ? "Level-access wet area with no threshold." : "The room cannot fit a 1200 × 900 mm level-access wet area.",
    });
  }
  return out;
}

/**
 * Proposes a WC position that resolves a failing transfer-clearance check,
 * or null when the check passes or the room is too narrow to fix it.
 */
export function suggestLayoutFix(layout: BathroomLayout, rules: RuleResult[]): Suggestion | null {
  if (rules.find((x) => x.id === "wc")?.status !== "review") return null;
  const basin = get(layout, "basin");
  const wc = get(layout, "wc");
  const target = Math.min(basin.x + basin.w + WC_TARGET_SIDE_CLEARANCE, layout.wcRange.max);
  const clearance = target - (basin.x + basin.w);
  if (clearance < WC_RULE_MIN_SIDE_CLEARANCE || target === wc.x) return null;
  return { wcX: target, message: `Move the WC ${target - wc.x} mm to the right to give ${clearance} mm side-transfer space.` };
}
