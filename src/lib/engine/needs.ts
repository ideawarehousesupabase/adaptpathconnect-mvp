import type { Assessment, FeatureId, Need, NeedsFeature, NeedsProfile } from "@/lib/domain";

/** Door width a wheelchair or walking-aid user needs, and the width we specify when widening. */
export function doorRequirement(a: Pick<Assessment, "mobility">) {
  return a.mobility === "Wheelchair" ? { min: 850, target: 900 } : { min: 750, target: 800 };
}

const NEED_FEATURES: Record<Need, { id: FeatureId; name: string }> = {
  "Level-access shower required": { id: "shower", name: "Level-access shower" },
  "Shower seat required": { id: "seat", name: "Fold-down shower seat" },
  "Grab rails required": { id: "rails", name: "Grab rails" },
  "Accessible WC required": { id: "wc", name: "Accessible WC" },
  "Accessible basin required": { id: "basin", name: "Accessible basin" },
};

const MOBILITY: Record<Assessment["mobility"], string> = {
  Independent: "Independently mobile",
  "Walking Aid": "Walking aid user",
  Wheelchair: "Wheelchair user",
};

const TRANSFER: Record<Assessment["transfer"], string> = {
  Independent: "Independent transfer",
  Assisted: "Side transfer required",
  "Carer Required": "Carer-assisted transfer",
};

/** Maps the OT assessment to a needs profile using fixed, ordered mapping rules. */
export function deriveNeeds(a: Assessment): NeedsProfile {
  const features: NeedsFeature[] = [];
  const has = (id: FeatureId) => features.some((f) => f.id === id);
  const add = (id: FeatureId, name: string, source: string) => {
    if (!has(id)) features.push({ id, name, source });
  };

  for (const n of a.needs) add(NEED_FEATURES[n].id, NEED_FEATURES[n].name, n);

  if (a.mobility === "Walking Aid") add("rails", "Grab rails", "Mobility: Walking Aid");
  if (has("shower") && a.transfer !== "Independent") add("seat", "Fold-down shower seat", `Transfer: ${a.transfer}`);
  if (a.mobility === "Wheelchair") add("circulation", "Clear wheelchair circulation area", "Mobility: Wheelchair");

  const door = doorRequirement(a);
  if (a.doorWidth < door.min) add("door", `Door widening to ${door.target} mm`, `Door width: ${a.doorWidth} mm`);
  if (has("shower") && a.existingBathroom.includes("Bath")) add("bathRemoval", "Bath removal", "Existing bathroom: Bath");

  const assisted = a.carerSupport === "Yes" || a.transfer === "Carer Required";
  const priority = has("shower")
    ? assisted ? "Safe assisted bathing" : "Safe independent bathing"
    : has("wc") ? "Safe toileting"
    : features.length > 0 ? "Safer bathroom access"
    : "General accessibility review";

  return {
    mobility: MOBILITY[a.mobility],
    transfer: TRANSFER[a.transfer],
    carer: a.carerSupport === "Yes" ? "Required" : "Not required",
    priority,
    features,
  };
}

/** Plain-language description of the planned bathroom for the applicant and family. */
export function describeForApplicant(n: NeedsProfile): string {
  const phrases: Record<FeatureId, string> = {
    shower: "a step-free shower",
    seat: "a fold-down shower seat",
    rails: "support rails",
    wc: "a raised toilet that is easier to transfer to",
    basin: "a basin you can reach while seated",
    circulation: "a clear space to turn a wheelchair",
    door: "a wider door",
    bathRemoval: "the old bath taken out",
  };
  const parts = n.features.map((f) => phrases[f.id]);
  if (parts.length === 0) return "No changes to the bathroom have been recommended from the assessment yet.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `This view shows how the new bathroom is planned to look: ${list}.`;
}
