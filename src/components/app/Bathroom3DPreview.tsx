import { useState } from "react";
import type { BathroomLayout, ComponentKey, PlacedComponent } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Eye, Layers, Maximize2 } from "lucide-react";

interface Props {
  layout: BathroomLayout;
}

export function Bathroom3DPreview({ layout }: Props) {
  const { roomW, roomD } = layout;
  const [showLabels, setShowLabels] = useState(true);
  const [viewMode, setViewMode] = useState<"iso" | "top">("iso");

  const components = Object.fromEntries(
    layout.components.map((x) => [x.key, x])
  ) as Partial<Record<ComponentKey, PlacedComponent>>;

  // Isometric projection constants
  const cos30 = Math.cos(Math.PI / 6); // ~0.866
  const sin30 = Math.sin(Math.PI / 6); // 0.5
  const wallH = 1800; // mm

  const toIso = (x: number, y: number, z = 0) => {
    return {
      x: (x - y) * cos30,
      y: (x + y) * sin30 - z,
    };
  };

  // Bounding box for SVG viewBox calculation
  const pTop = toIso(0, 0, wallH);
  const pRight = toIso(roomW, 0, 0);
  const pLeft = toIso(0, roomD, 0);
  const pBottom = toIso(roomW, roomD, 0);

  const minX = pLeft.x - 200;
  const maxX = pRight.x + 200;
  const minY = pTop.y - 150;
  const maxY = pBottom.y + 200;
  const vbW = maxX - minX;
  const vbH = maxY - minY;

  const rotPoint = (px: number, py: number, cx: number, cy: number, rot = 0) => {
    if (!rot) return { x: px, y: py };
    const rad = (rot * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cx + dx * cosA - dy * sinA,
      y: cy + dx * sinA + dy * cosA,
    };
  };

  // Render 3D box fixture
  const render3DBox = (
    c: PlacedComponent,
    h: number,
    colors: { top: string; left: string; right: string; stroke: string },
    label?: string,
    origin?: { cx: number; cy: number; rot: number }
  ) => {
    const { x, y, w, d } = c;
    const cx = origin ? origin.cx : x + w / 2;
    const cy = origin ? origin.cy : y + d / 2;
    const rot = origin ? origin.rot : (c.rotation ?? 0);

    const p0 = rotPoint(x, y, cx, cy, rot);
    const p1 = rotPoint(x + w, y, cx, cy, rot);
    const p2 = rotPoint(x + w, y + d, cx, cy, rot);
    const p3 = rotPoint(x, y + d, cx, cy, rot);

    const b0 = toIso(p0.x, p0.y, 0);
    const b1 = toIso(p1.x, p1.y, 0);
    const b2 = toIso(p2.x, p2.y, 0);
    const b3 = toIso(p3.x, p3.y, 0);

    const t0 = toIso(p0.x, p0.y, h);
    const t1 = toIso(p1.x, p1.y, h);
    const t2 = toIso(p2.x, p2.y, h);
    const t3 = toIso(p3.x, p3.y, h);

    return (
      <g key={c.key} className="transition-all duration-300">
        {/* Left Face (along y-axis) */}
        <polygon
          points={`${b3.x},${b3.y} ${b2.x},${b2.y} ${t2.x},${t2.y} ${t3.x},${t3.y}`}
          fill={colors.left}
          stroke={colors.stroke}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* Right Face (along x-axis) */}
        <polygon
          points={`${b2.x},${b2.y} ${b1.x},${b1.y} ${t1.x},${t1.y} ${t2.x},${t2.y}`}
          fill={colors.right}
          stroke={colors.stroke}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* Top Face */}
        <polygon
          points={`${t0.x},${t0.y} ${t1.x},${t1.y} ${t2.x},${t2.y} ${t3.x},${t3.y}`}
          fill={colors.top}
          stroke={colors.stroke}
          strokeWidth="5"
          strokeLinejoin="round"
        />
        {/* Floating Label */}
        {showLabels && label && (
          <g transform={`translate(${t2.x}, ${t2.y - 30})`}>
            <rect
              x="-65"
              y="-30"
              width="130"
              height="28"
              rx="6"
              fill="rgba(15, 23, 42, 0.85)"
              stroke="#38bdf8"
              strokeWidth="2"
            />
            <text
              x="0"
              y="-12"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="16"
              fontWeight="600"
              className="select-none pointer-events-none"
            >
              {label}
            </text>
          </g>
        )}
      </g>
    );
  };

  // Specific fixture renderers
  const renderShower = () => {
    const s = components.shower;
    if (!s) return null;
    const { x, y, w, d, rotation = 0 } = s;
    const cx = x + w / 2;
    const cy = y + d / 2;

    const sp0 = rotPoint(x, y, cx, cy, rotation);
    const sp1 = rotPoint(x + w, y, cx, cy, rotation);
    const sp2 = rotPoint(x + w, y + d, cx, cy, rotation);
    const sp3 = rotPoint(x, y + d, cx, cy, rotation);

    const p0 = toIso(sp0.x, sp0.y, 0);
    const p1 = toIso(sp1.x, sp1.y, 0);
    const p2 = toIso(sp2.x, sp2.y, 0);
    const p3 = toIso(sp3.x, sp3.y, 0);

    // Glass screen on the open edge
    const gTop0 = toIso(sp1.x, sp1.y, 1750);
    const gTop1 = toIso(sp2.x, sp2.y, 1750);
    const gBot0 = p1;
    const gBot1 = p2;

    // Shower head position
    const shPoleTopP = rotPoint(x + 120, y + 60, cx, cy, rotation);
    const shPoleTop = toIso(shPoleTopP.x, shPoleTopP.y, 1900);
    const shPoleBot = toIso(shPoleTopP.x, shPoleTopP.y, 900);
    const shHeadP = rotPoint(x + 350, y + 250, cx, cy, rotation);
    const shHead = toIso(shHeadP.x, shHeadP.y, 1950);
    const drain = toIso(cx, cy, 0);

    return (
      <g key="shower">
        {/* Wet room shower floor gradient */}
        <polygon
          points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
          fill="url(#showerGrad)"
          stroke="#0284c7"
          strokeWidth="6"
          strokeDasharray="20 10"
        />
        {/* Drain grate */}
        <ellipse cx={drain.x} cy={drain.y} rx="24" ry="12" fill="#475569" stroke="#94a3b8" strokeWidth="4" />

        {/* Chrome riser rail & shower head */}
        <line x1={shPoleBot.x} y1={shPoleBot.y} x2={shPoleTop.x} y2={shPoleTop.y} stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" />
        <line x1={shPoleTop.x} y1={shPoleTop.y} x2={shHead.x} y2={shHead.y} stroke="#cbd5e1" strokeWidth="7" strokeLinecap="round" />
        <ellipse cx={shHead.x} cy={shHead.y} rx="30" ry="15" fill="#f8fafc" stroke="#64748b" strokeWidth="4" />

        {/* Glass screen */}
        <polygon
          points={`${gBot0.x},${gBot0.y} ${gBot1.x},${gBot1.y} ${gTop1.x},${gTop1.y} ${gTop0.x},${gTop0.y}`}
          fill="rgba(56, 189, 248, 0.22)"
          stroke="rgba(14, 165, 233, 0.85)"
          strokeWidth="5"
        />
        {/* Chrome support bar */}
        <line x1={gTop0.x} y1={gTop0.y} x2={gTop1.x} y2={gTop1.y} stroke="#e2e8f0" strokeWidth="6" />

        {showLabels && (
          <g transform={`translate(${gTop1.x - 20}, ${gTop1.y - 30})`}>
            <rect x="-70" y="-30" width="140" height="28" rx="6" fill="rgba(15, 23, 42, 0.85)" stroke="#38bdf8" strokeWidth="2" />
            <text x="0" y="-12" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="600">
              Level Shower
            </text>
          </g>
        )}
      </g>
    );
  };

  const renderWc = () => {
    const wc = components.wc;
    if (!wc) return null;
    const { x, y, w, d, rotation = 0 } = wc;
    const cx = x + w / 2;
    const cy = y + d / 2;
    const origin = { cx, cy, rot: rotation };

    // Cistern at back wall
    const cisternComp: PlacedComponent = {
      ...wc,
      d: 200,
    };
    // Pan in front
    const panComp: PlacedComponent = {
      ...wc,
      y: y + 200,
      d: d - 200,
    };

    return (
      <g key="wc">
        {render3DBox(
          panComp,
          480, // Raised height WC
          { top: "#f8fafc", left: "#cbd5e1", right: "#e2e8f0", stroke: "#64748b" },
          "Accessible WC",
          origin
        )}
        {render3DBox(
          cisternComp,
          820, // Cistern height
          { top: "#ffffff", left: "#94a3b8", right: "#cbd5e1", stroke: "#64748b" },
          undefined,
          origin
        )}
      </g>
    );
  };

  const renderBasin = () => {
    const b = components.basin;
    if (!b) return null;
    const { x, y, w, d, rotation = 0 } = b;
    const cx = x + w / 2;
    const cy = y + d / 2;
    const btP = rotPoint(x + w / 2, y + 100, cx, cy, rotation);
    const basinTop = toIso(btP.x, btP.y, 780);

    const mP0 = rotPoint(x + 40, y, cx, cy, rotation);
    const mP1 = rotPoint(x + w - 40, y, cx, cy, rotation);
    const m0 = toIso(mP0.x, mP0.y, 900);
    const m1 = toIso(mP1.x, mP1.y, 900);
    const m2 = toIso(mP1.x, mP1.y, 1600);
    const m3 = toIso(mP0.x, mP0.y, 1600);

    return (
      <g key="basin">
        {render3DBox(
          b,
          750, // 750 mm rim height
          { top: "#f1f5f9", left: "#cbd5e1", right: "#e2e8f0", stroke: "#64748b" },
          "Accessible Basin"
        )}
        {/* Wall mirror above basin */}
        <polygon
          points={`${m0.x},${m0.y} ${m1.x},${m1.y} ${m2.x},${m2.y} ${m3.x},${m3.y}`}
          fill="rgba(224, 242, 254, 0.6)"
          stroke="#94a3b8"
          strokeWidth="4"
        />
        {/* Chrome mixer tap */}
        <circle cx={basinTop.x} cy={basinTop.y - 30} r="10" fill="#94a3b8" />
        <line x1={basinTop.x} y1={basinTop.y} x2={basinTop.x} y2={basinTop.y - 30} stroke="#cbd5e1" strokeWidth="8" />
      </g>
    );
  };

  const renderSeat = () => {
    const seat = components.seat;
    if (!seat) return null;
    return render3DBox(
      seat,
      480,
      { top: "#0284c7", left: "#0369a1", right: "#075985", stroke: "#0c4a6e" },
      "Shower Seat"
    );
  };

  const renderRail = () => {
    const rail = components.rail;
    if (!rail) return null;
    const { x, y, w, d, rotation = 0 } = rail;
    const cx = x + w / 2;
    const cy = y + d / 2;
    const rp0 = rotPoint(x, y, cx, cy, rotation);
    const rp1 = rotPoint(x, y + d, cx, cy, rotation);
    const rStart = toIso(rp0.x, rp0.y, 750);
    const rEnd = toIso(rp1.x, rp1.y, 750);
    return (
      <g key="rail">
        <line
          x1={rStart.x}
          y1={rStart.y}
          x2={rEnd.x}
          y2={rEnd.y}
          stroke="#94a3b8"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <line
          x1={rStart.x}
          y1={rStart.y}
          x2={rEnd.x}
          y2={rEnd.y}
          stroke="#f8fafc"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </g>
    );
  };

  const renderDoor = () => {
    const door = components.door;
    if (!door) return null;
    const { x, y, w, d = 60, rotation = 0 } = door;
    const cx = x + w / 2;
    const cy = y + d / 2;
    const dp0 = rotPoint(x, y, cx, cy, rotation);
    const dp1 = rotPoint(x + w, y, cx, cy, rotation);
    const d0 = toIso(dp0.x, dp0.y, 0);
    const d1 = toIso(dp1.x, dp1.y, 0);
    const dTop0 = toIso(dp0.x, dp0.y, 2000);
    const dTop1 = toIso(dp1.x, dp1.y, 2000);

    return (
      <g key="door">
        {/* Door frame cutout */}
        <polygon
          points={`${d0.x},${d0.y} ${d1.x},${d1.y} ${dTop1.x},${dTop1.y} ${dTop0.x},${dTop0.y}`}
          fill="rgba(241, 245, 249, 0.4)"
          stroke="#64748b"
          strokeWidth="6"
          strokeDasharray="15 10"
        />
      </g>
    );
  };

  return (
    <div className="space-y-3">
      {/* View Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card border border-border p-2 text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode("iso")}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors cursor-pointer",
              viewMode === "iso" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" /> 3D Isometric View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("top")}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors cursor-pointer",
              viewMode === "top" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Top Plan View
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded border-border text-primary"
            />
            <span>Show Fixture Labels</span>
          </label>
        </div>
      </div>

      {/* 3D Visualizer Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-slate-950 p-4 shadow-inner">
        {viewMode === "iso" ? (
          <svg
            viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
            className="h-auto w-full max-h-[540px] select-none"
            role="img"
            aria-label="3D Isometric Bathroom Model"
          >
            <defs>
              {/* Floor grid pattern */}
              <linearGradient id="floorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>

              {/* Wet shower area gradient */}
              <linearGradient id="showerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0369a1" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
              </linearGradient>

              {/* Back Wall left gradient */}
              <linearGradient id="wallLeftGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>

              {/* Back Wall right gradient */}
              <linearGradient id="wallRightGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
            </defs>

            {/* Back Wall Left (along y-axis) */}
            {(() => {
              const b0 = toIso(0, 0, 0);
              const b1 = toIso(0, roomD, 0);
              const t1 = toIso(0, roomD, wallH);
              const t0 = toIso(0, 0, wallH);
              return (
                <polygon
                  points={`${b0.x},${b0.y} ${b1.x},${b1.y} ${t1.x},${t1.y} ${t0.x},${t0.y}`}
                  fill="url(#wallLeftGrad)"
                  stroke="#64748b"
                  strokeWidth="6"
                />
              );
            })()}

            {/* Back Wall Right (along x-axis) */}
            {(() => {
              const b0 = toIso(0, 0, 0);
              const b1 = toIso(roomW, 0, 0);
              const t1 = toIso(roomW, 0, wallH);
              const t0 = toIso(0, 0, wallH);
              return (
                <polygon
                  points={`${b0.x},${b0.y} ${b1.x},${b1.y} ${t1.x},${t1.y} ${t0.x},${t0.y}`}
                  fill="url(#wallRightGrad)"
                  stroke="#475569"
                  strokeWidth="6"
                />
              );
            })()}

            {/* Tiled Floor */}
            {(() => {
              const f0 = toIso(0, 0, 0);
              const f1 = toIso(roomW, 0, 0);
              const f2 = toIso(roomW, roomD, 0);
              const f3 = toIso(0, roomD, 0);
              return (
                <polygon
                  points={`${f0.x},${f0.y} ${f1.x},${f1.y} ${f2.x},${f2.y} ${f3.x},${f3.y}`}
                  fill="url(#floorGrad)"
                  stroke="#475569"
                  strokeWidth="6"
                />
              );
            })()}

            {/* Turning Circle on floor */}
            {layout.requirements.turningSpace && (() => {
              const tc = toIso(layout.turningCentre.x, layout.turningCentre.y, 0);
              const rx = (layout.turningDiameter / 2) * cos30;
              const ry = (layout.turningDiameter / 2) * sin30;
              return (
                <g>
                  <ellipse
                    cx={tc.x}
                    cy={tc.y}
                    rx={rx}
                    ry={ry}
                    fill="rgba(34, 197, 94, 0.08)"
                    stroke="#22c55e"
                    strokeWidth="4"
                    strokeDasharray="15 10"
                  />
                  <text
                    x={tc.x}
                    y={tc.y}
                    textAnchor="middle"
                    fill="#4ade80"
                    fontSize="18"
                    fontWeight="600"
                  >
                    Ø{layout.turningDiameter} mm Wheelchair Turning
                  </text>
                </g>
              );
            })()}

            {/* Render 3D Fixtures in depth order */}
            {renderShower()}
            {renderDoor()}
            {renderSeat()}
            {renderBasin()}
            {renderWc()}
            {renderRail()}
          </svg>
        ) : (
          /* Top view */
          <div className="mx-auto max-w-lg p-2">
            <svg
              viewBox={`-100 -100 ${roomW + 200} ${roomD + 200}`}
              className="h-auto w-full select-none"
              role="img"
              aria-label="Top 2D View"
            >
              <rect x={0} y={0} width={roomW} height={roomD} fill="#1e293b" stroke="#64748b" strokeWidth="8" />
              {layout.components.map((comp) => (
                <g key={comp.key}>
                  <rect
                    x={comp.x}
                    y={comp.y}
                    width={comp.w}
                    height={comp.d}
                    rx="8"
                    fill={comp.key === "shower" ? "#0284c7" : comp.key === "wc" ? "#f8fafc" : comp.key === "basin" ? "#e2e8f0" : "#64748b"}
                    stroke="#0f172a"
                    strokeWidth="4"
                  />
                  <text
                    x={comp.x + comp.w / 2}
                    y={comp.y + comp.d / 2 + 6}
                    textAnchor="middle"
                    fill={comp.key === "wc" || comp.key === "basin" ? "#0f172a" : "#ffffff"}
                    fontSize="42"
                    fontWeight="600"
                  >
                    {comp.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800 pt-3">
          <span>
            Room Spec: <strong className="text-slate-200">{roomW} × {roomD} mm</strong>
          </span>
          <span>Interactive 3D model generated directly from your saved layout.</span>
        </div>
      </div>
    </div>
  );
}

