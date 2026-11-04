import type { Assessment, BathroomLayout, DesignInput, FeatureId, NeedsProfile, PlacedComponent } from "@/lib/domain";
import { WC_TARGET_SIDE_CLEARANCE } from "@/lib/rules";
import { doorRequirement } from "./needs";

/** Clearance used when no side transfer is needed. */
const WC_DEFAULT_SIDE_CLEARANCE = 400;
/** Allowance for wall-hung fixture projection when sizing the turning circle. */
const TURNING_ALLOWANCE = 600;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Generates a dimensioned bathroom plan from the room measurements and needs
 * profile. The WC position is the only value a person edits; it comes from the
 * saved design when there is one, otherwise from the generator's recommendation.
 */
export function generateLayout(a: Assessment, needs: NeedsProfile, design: DesignInput | null) {
  const W = a.roomLength;
  const D = a.roomWidth;
  const has = (id: FeatureId) => needs.features.some((f) => f.id === id);
  const door = doorRequirement(a);
  const levelAccess = has("shower");
  const requirements = {
    turningSpace: a.mobility === "Wheelchair",
    wcTransfer: a.mobility === "Wheelchair" || a.transfer !== "Independent",
    levelShower: levelAccess,
    seatedReach: a.mobility === "Wheelchair" || has("basin"),
    minDoorWidth: door.min,
  };

  const showerW = Math.min(1200, Math.round(W * 0.5));
  const showerD = Math.min(900, Math.round(D * 0.45));
  const doorW = has("door") ? door.target : a.doorWidth;
  const basinD = has("basin") ? 450 : 550;
  const basin = { x: 300, y: D - basinD, w: 500, d: basinD };
  const rail = has("rails");

  const wcRange = { min: basin.x + basin.w, max: Math.max(basin.x + basin.w, W - 400 - (rail ? 60 : 0)) };
  const recommendedWcX = clamp(
    basin.x + basin.w + (requirements.wcTransfer ? WC_TARGET_SIDE_CLEARANCE : WC_DEFAULT_SIDE_CLEARANCE),
    wcRange.min,
    wcRange.max,
  );
  const wcX = design ? clamp(design.wcX, wcRange.min, wcRange.max) : recommendedWcX;

  const components: PlacedComponent[] = [
    {
      key: "shower", label: levelAccess ? "Level-access Shower" : "Shower", x: 0, y: 0, w: showerW, d: showerD,
      detail: levelAccess ? `${showerW} × ${showerD} mm wet area, gradient floor, no threshold` : `${showerW} × ${showerD} mm shower tray`,
    },
  ];
  if (has("seat")) {
    components.push({ key: "seat", label: "Shower Seat", x: 60, y: clamp(300, 0, Math.max(0, showerD - 450)), w: 450, d: 400, detail: "Fold-down seat, 480 mm seat height" });
  }
  if (rail) {
    components.push({ key: "rail", label: "Grab Rail", x: W - 60, y: Math.max(0, D - 800), w: 60, d: 600, detail: "600 mm horizontal rail, 32 mm diameter" });
  }
  components.push(
    {
      key: "basin", label: "Basin", ...basin,
      detail: has("basin") ? "Wall-hung basin, 750 mm rim height, knee space" : "Existing-style pedestal basin, 550 mm projection",
    },
    {
      key: "wc", label: "WC", x: wcX, y: D - 700, w: 400, d: 700,
      detail: has("wc") ? "Raised-height WC, 480 mm seat height" : "Standard-height WC",
    },
    {
      key: "door", label: "Door", x: Math.max(0, W - doorW - 100), y: 0, w: doorW, d: 60,
      detail: has("door") ? `${doorW} mm outward-opening door (widened from ${a.doorWidth} mm)` : `${doorW} mm existing door`,
    },
  );

  const layout: BathroomLayout = {
    name: design ? `Version ${design.version}` : "Proposed (not yet saved)",
    roomW: W,
    roomD: D,
    turningDiameter: Math.max(0, Math.min(W, D) - TURNING_ALLOWANCE),
    turningCentre: { x: Math.round(W / 2), y: Math.round(D * 0.56) },
    basinProjection: basinD,
    showerThreshold: levelAccess ? 0 : 150,
    levelAccess,
    wcRange,
    requirements,
    components,
  };
  return { layout, recommendedWcX };
}

/** Returns a copy of the layout with the WC moved, kept within its allowed range. */
export function moveWc(layout: BathroomLayout, x: number, name = "Custom"): BathroomLayout {
  return {
    ...layout,
    name,
    components: layout.components.map((c) => (c.key === "wc" ? { ...c, x: clamp(x, layout.wcRange.min, layout.wcRange.max) } : c)),
  };
}
