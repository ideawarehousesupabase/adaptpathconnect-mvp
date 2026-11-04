import type { BathroomLayout, FeatureId, FundingPosition, NeedsProfile, WorkItem } from "@/lib/domain";

/** Illustrative unit rates (GBP). Reference configuration, not case data. */
export const RATES = {
  shower: 2300,
  seat: 240,
  rail: 120,
  wc: 850,
  basin: 720,
  door: 950,
  bathRemoval: 450,
  plumbingBase: 350,
  plumbingPerFixture: 350,
  electricalLevelAccess: 620,
  labourShare: 0.5,
} as const;

/** Statutory maximum mandatory DFG in England. */
export const MAX_GRANT = 30000;

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Builds the schedule of works from the needs profile and the generated layout. */
export function buildScheduleOfWorks(needs: NeedsProfile, layout: BathroomLayout): WorkItem[] {
  const has = (id: FeatureId) => needs.features.some((f) => f.id === id);
  const items: WorkItem[] = [];
  const add = (item: string, qty: number, unit: number) => items.push({ item, qty, cost: qty * unit, fromDesign: true });

  if (has("bathRemoval")) add("Bath removal", 1, RATES.bathRemoval);
  if (has("shower")) add("Level-access shower", 1, RATES.shower);
  if (has("seat")) add("Fold-down shower seat", 1, RATES.seat);
  if (has("rails")) {
    const keys = new Set(layout.components.map((c) => c.key));
    // One rail beside the WC, one by the basin, one in the shower when there is a seat to transfer to.
    add("Grab rails", 2 + (keys.has("seat") ? 1 : 0), RATES.rail);
  }
  if (has("wc")) add("Accessible WC", 1, RATES.wc);
  if (has("basin")) add("Accessible basin", 1, RATES.basin);
  if (has("door")) add("Door widening", 1, RATES.door);

  const designSubtotal = items.reduce((s, i) => s + i.cost, 0);
  const wetFixtures = (["shower", "wc", "basin"] as const).filter(has).length;
  if (wetFixtures > 0) {
    items.push({ item: "Plumbing", qty: null, cost: RATES.plumbingBase + RATES.plumbingPerFixture * wetFixtures, fromDesign: false });
  }
  if (has("shower")) items.push({ item: "Electrical Work", qty: null, cost: RATES.electricalLevelAccess, fromDesign: false });
  if (designSubtotal > 0) items.push({ item: "Labour", qty: null, cost: round10(designSubtotal * RATES.labourShare), fromDesign: false });
  return items;
}

export function fundingPosition(items: WorkItem[], applicantContribution: number): FundingPosition {
  const total = items.reduce((s, i) => s + i.cost, 0);
  const applicant = Math.min(Math.max(0, applicantContribution), total);
  const dfg = total - applicant;
  return { total, applicant, dfg, ceiling: MAX_GRANT, withinLimit: dfg <= MAX_GRANT };
}
