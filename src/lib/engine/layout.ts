import type { Assessment, BathroomLayout, ComponentKey, DesignInput, FeatureId, NeedsProfile, PlacedComponent } from "@/lib/domain";
import { WC_TARGET_SIDE_CLEARANCE } from "@/lib/rules";
import { doorRequirement } from "./needs";

/** Clearance used when no side transfer is needed. */
const WC_DEFAULT_SIDE_CLEARANCE = 400;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Dynamically computes the maximum clear wheelchair turning circle diameter
 * and its optimal center position within the room based on placed fixtures.
 *
 * UK Accessibility Guidance (BS 8300-2:2018 & Building Regs Part M):
 * 1. Standard requirement is a 1500 mm Ø clear turning circle.
 * 2. In a level-access shower (0 mm step wet room), the floor is flush and non-slip,
 *    allowing the turning space to safely overlap the shower area.
 * 3. Wall-hung accessible washbasins provide knee clearance underneath so wheelchair
 *    footrests can project under the basin rim (up to 200 mm allowance).
 * 4. Solid floor barriers (raised WC pan/cistern, step-in trays) cannot be intersected.
 */
export function calculateTurningSpace(
  roomW: number,
  roomD: number,
  components: PlacedComponent[],
  levelAccess: boolean
): { diameter: number; centre: { x: number; y: number } } {
  if (roomW < 600 || roomD < 600) {
    return {
      diameter: Math.max(0, Math.min(roomW, roomD)),
      centre: { x: Math.round(roomW / 2), y: Math.round(roomD / 2) },
    };
  }

  interface Box {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  const obstacles: Box[] = [];

  for (const c of components) {
    // Level access wet room shower has a flush floor (0 mm step).
    // Under UK Part M and BS 8300, turning space is permitted to overlap it.
    if (c.key === "shower") {
      if (!levelAccess) {
        obstacles.push({ x1: c.x, y1: c.y, x2: c.x + c.w, y2: c.y + c.d });
      }
      continue;
    }

    // Door is an opening in the wall, not a floor obstacle
    if (c.key === "door") continue;

    // Grab rails are wall-hung
    if (c.key === "rail") continue;

    // Shower seat is fold-down wall-hung
    if (c.key === "seat") continue;

    const rot = c.rotation ?? 0;
    const isRot90 = rot === 90 || rot === 270;
    const effW = isRot90 ? c.d : c.w;
    const effD = isRot90 ? c.w : c.d;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.d / 2;

    if (c.key === "wc") {
      // Raised WC pan & cistern is a solid obstacle
      obstacles.push({
        x1: Math.max(0, cx - effW / 2),
        y1: Math.max(0, cy - effD / 2),
        x2: Math.min(roomW, cx + effW / 2),
        y2: Math.min(roomD, cy + effD / 2),
      });
    } else if (c.key === "basin") {
      // Wall-hung accessible basin provides knee clearance beneath
      // (BS 8300 allows up to 200 mm footrest reach under rim)
      const footrestAllowance = 200;
      const reducedD = Math.max(200, effD - footrestAllowance);
      obstacles.push({
        x1: Math.max(0, cx - effW / 2),
        y1: Math.max(0, cy - reducedD / 2),
        x2: Math.min(roomW, cx + effW / 2),
        y2: Math.min(roomD, cy + reducedD / 2),
      });
    }
  }

  // Distance from point (px, py) to a rectangular obstacle
  const distToObstacle = (px: number, py: number, o: Box): number => {
    const dx = Math.max(o.x1 - px, 0, px - o.x2);
    const dy = Math.max(o.y1 - py, 0, py - o.y2);
    return Math.hypot(dx, dy);
  };

  // Clear radius available at candidate center (px, py)
  const clearRadiusAt = (px: number, py: number): number => {
    let r = Math.min(px, roomW - px, py, roomD - py);
    for (const o of obstacles) {
      const d = distToObstacle(px, py, o);
      if (d < r) r = d;
    }
    return Math.max(0, r);
  };

  // Evaluate candidate centers across the room grid to locate the maximum turning circle
  let bestCenter = { x: Math.round(roomW / 2), y: Math.round(roomD / 2) };
  let bestRadius = 0;

  const step = 50;
  for (let x = 100; x <= roomW - 100; x += step) {
    for (let y = 100; y <= roomD - 100; y += step) {
      const rad = clearRadiusAt(x, y);
      if (rad > bestRadius) {
        bestRadius = rad;
        bestCenter = { x, y };
      }
    }
  }

  // Maximum achievable turning diameter rounded to nearest 10 mm
  const maxSpan = Math.min(roomW, roomD);
  const rawDiameter = Math.round((bestRadius * 2) / 10) * 10;
  const diameter = Math.min(rawDiameter, maxSpan);

  return {
    diameter,
    centre: bestCenter,
  };
}

/**
 * Generates a dimensioned bathroom plan from room measurements and needs.
 * Fixtures can be positioned manually; if positions are saved, they are applied.
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

  const wcRange = { min: 0, max: Math.max(0, W - 400 - (rail ? 60 : 0)) };
  const recommendedWcX = clamp(
    basin.x + basin.w + (requirements.wcTransfer ? WC_TARGET_SIDE_CLEARANCE : WC_DEFAULT_SIDE_CLEARANCE),
    0,
    wcRange.max,
  );
  const wcX = design ? clamp(design.wcX, 0, wcRange.max) : recommendedWcX;

  const defaultComponents: PlacedComponent[] = [
    {
      key: "shower",
      label: levelAccess ? "Level-access Shower" : "Shower",
      x: 0,
      y: 0,
      w: showerW,
      d: showerD,
      detail: levelAccess ? `${showerW} × ${showerD} mm wet area, gradient floor, no threshold` : `${showerW} × ${showerD} mm shower tray`,
    },
  ];

  if (has("seat")) {
    defaultComponents.push({
      key: "seat",
      label: "Shower Seat",
      x: 60,
      y: clamp(300, 0, Math.max(0, showerD - 450)),
      w: 450,
      d: 400,
      detail: "Fold-down seat, 480 mm seat height",
    });
  }

  if (rail) {
    defaultComponents.push({
      key: "rail",
      label: "Grab Rail",
      x: W - 60,
      y: Math.max(0, D - 800),
      w: 60,
      d: 600,
      detail: "600 mm horizontal rail, 32 mm diameter",
    });
  }

  defaultComponents.push(
    {
      key: "basin",
      label: "Basin",
      ...basin,
      detail: has("basin") ? "Wall-hung basin, 750 mm rim height, knee space" : "Existing-style pedestal basin, 550 mm projection",
    },
    {
      key: "wc",
      label: "WC",
      x: wcX,
      y: D - 700,
      w: 400,
      d: 700,
      detail: has("wc") ? "Raised-height WC, 480 mm seat height" : "Standard-height WC",
    },
    {
      key: "door",
      label: "Door",
      x: Math.max(0, W - doorW - 100),
      y: 0,
      w: doorW,
      d: 60,
      detail: has("door") ? `${doorW} mm outward-opening door (widened from ${a.doorWidth} mm)` : `${doorW} mm existing door`,
    },
  );

  // Apply custom saved positions if present
  const customPositions = design?.positions;
  const components = defaultComponents.map((c) => {
    if (customPositions && customPositions[c.key]) {
      const pos = customPositions[c.key]!;
      return {
        ...c,
        x: clamp(Math.round(pos.x), 0, Math.max(0, W - c.w)),
        y: clamp(Math.round(pos.y), 0, Math.max(0, D - c.d)),
        rotation: pos.rotation ?? 0,
      };
    }
    return { ...c, rotation: 0 };
  });

  const turning = calculateTurningSpace(W, D, components, levelAccess);

  const layout: BathroomLayout = {
    name: design ? `Version ${design.version}` : "Proposed (not yet saved)",
    roomW: W,
    roomD: D,
    turningDiameter: turning.diameter,
    turningCentre: turning.centre,
    basinProjection: basinD,
    showerThreshold: levelAccess ? 0 : 150,
    levelAccess,
    wcRange,
    requirements,
    components,
  };
  return { layout, recommendedWcX };
}

/** Returns a copy of the layout with a specific component moved. */
export function moveComponent(
  layout: BathroomLayout,
  key: ComponentKey,
  x: number,
  y: number,
  rotation?: number,
  name = "Custom",
): BathroomLayout {
  const W = layout.roomW;
  const D = layout.roomD;
  const nextComponents = layout.components.map((c) => {
    if (c.key !== key) return c;
    return {
      ...c,
      x: clamp(Math.round(x), 0, Math.max(0, W - c.w)),
      y: clamp(Math.round(y), 0, Math.max(0, D - c.d)),
      rotation: rotation !== undefined ? rotation : (c.rotation ?? 0),
    };
  });
  const turning = calculateTurningSpace(W, D, nextComponents, layout.levelAccess);
  return {
    ...layout,
    name,
    components: nextComponents,
    turningDiameter: turning.diameter,
    turningCentre: turning.centre,
  };
}

/** Returns a copy of the layout with a component rotated by deltaAngle degrees (default 90°). */
export function rotateComponent(
  layout: BathroomLayout,
  key: ComponentKey,
  deltaAngle = 90,
  name = "Custom",
): BathroomLayout {
  const nextComponents = layout.components.map((c) => {
    if (c.key !== key) return c;
    const current = c.rotation ?? 0;
    const next = ((current + deltaAngle) % 360 + 360) % 360;
    return {
      ...c,
      rotation: next,
    };
  });
  const turning = calculateTurningSpace(layout.roomW, layout.roomD, nextComponents, layout.levelAccess);
  return {
    ...layout,
    name,
    components: nextComponents,
    turningDiameter: turning.diameter,
    turningCentre: turning.centre,
  };
}

/** Returns a copy of the layout with a component rotated to an absolute angle (0, 90, 180, 270). */
export function setComponentRotation(
  layout: BathroomLayout,
  key: ComponentKey,
  angle: number,
  name = "Custom",
): BathroomLayout {
  const norm = ((angle % 360) + 360) % 360;
  const nextComponents = layout.components.map((c) => {
    if (c.key !== key) return c;
    return {
      ...c,
      rotation: norm,
    };
  });
  const turning = calculateTurningSpace(layout.roomW, layout.roomD, nextComponents, layout.levelAccess);
  return {
    ...layout,
    name,
    components: nextComponents,
    turningDiameter: turning.diameter,
    turningCentre: turning.centre,
  };
}

/** Returns a copy of the layout with the WC moved, kept within room bounds. */
export function moveWc(layout: BathroomLayout, x: number, name = "Custom"): BathroomLayout {
  const comp = layout.components.find((c) => c.key === "wc");
  const y = comp ? comp.y : layout.roomD - 700;
  return moveComponent(layout, "wc", x, y, name);
}
