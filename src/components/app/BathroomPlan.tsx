import { useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react";
import type { BathroomLayout, ComponentKey, PlacedComponent } from "@/lib/domain";
import { WC_RULE_MIN_SIDE_CLEARANCE, wcSideClearance } from "@/lib/rules";
import { cn } from "@/lib/utils";

interface Props {
  layout: BathroomLayout;
  selected?: ComponentKey | null;
  onSelect?: (k: ComponentKey) => void;
  onMove?: (k: ComponentKey, x: number, y: number) => void;
  highlightClearance?: boolean;
  dimensions?: boolean;
  interactive?: boolean;
}

export function BathroomPlan({
  layout,
  selected,
  onSelect,
  onMove,
  highlightClearance,
  dimensions,
  interactive = true,
}: Props) {
  const { roomW, roomD } = layout;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{
    key: ComponentKey;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const c = Object.fromEntries(layout.components.map((x) => [x.key, x])) as Partial<Record<ComponentKey, PlacedComponent>> & Record<"shower" | "wc" | "basin" | "door", PlacedComponent>;
  const wc = c.wc, basin = c.basin, shower = c.shower;
  const gap = wc && basin ? wcSideClearance(layout) : 0;
  const ok = gap >= WC_RULE_MIN_SIDE_CLEARANCE;
  const tc = layout.turningCentre;
  const T = 60;

  function getSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const screenCTM = svgRef.current.getScreenCTM();
    if (!screenCTM) return null;
    const svgP = pt.matrixTransform(screenCTM.inverse());
    return { x: svgP.x, y: svgP.y };
  }

  function handleStartDrag(key: ComponentKey, clientX: number, clientY: number) {
    if (!onMove || !interactive) return;
    onSelect?.(key);
    const comp = layout.components.find((item) => item.key === key);
    if (!comp) return;
    const pt = getSvgPoint(clientX, clientY);
    if (!pt) return;
    setDragging({
      key,
      startX: pt.x,
      startY: pt.y,
      origX: comp.x,
      origY: comp.y,
    });
  }

  function handleMouseMove(e: ReactMouseEvent<SVGSVGElement>) {
    if (!dragging || !onMove) return;
    const pt = getSvgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const dx = pt.x - dragging.startX;
    const dy = pt.y - dragging.startY;
    const comp = layout.components.find((item) => item.key === dragging.key);
    if (!comp) return;
    const newX = Math.round((dragging.origX + dx) / 10) * 10;
    const newY = Math.round((dragging.origY + dy) / 10) * 10;
    onMove(dragging.key, newX, newY);
  }

  function handleTouchMove(e: ReactTouchEvent<SVGSVGElement>) {
    if (!dragging || !onMove || e.touches.length === 0) return;
    const touch = e.touches[0]!;
    const pt = getSvgPoint(touch.clientX, touch.clientY);
    if (!pt) return;
    const dx = pt.x - dragging.startX;
    const dy = pt.y - dragging.startY;
    const newX = Math.round((dragging.origX + dx) / 10) * 10;
    const newY = Math.round((dragging.origY + dy) / 10) * 10;
    onMove(dragging.key, newX, newY);
  }

  function handleEndDrag() {
    setDragging(null);
  }

  const fixture = (k: ComponentKey, extra?: React.ReactNode) => {
    const f = c[k];
    if (!f) return null;
    const isSel = selected === k;
    const isDraggingThis = dragging?.key === k;
    const rot = f.rotation ?? 0;
    return (
      <g
        key={k}
        role={onSelect ? "button" : undefined}
        aria-label={`${f.label} (click or drag to move, rotate)`}
        tabIndex={onSelect ? 0 : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(k);
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          handleStartDrag(k, e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          if (e.touches[0]) {
            handleStartDrag(k, e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onKeyDown={(e) => e.key === "Enter" && onSelect?.(k)}
        className={cn(
          onSelect && "cursor-grab active:cursor-grabbing",
          isDraggingThis ? "opacity-90" : "transition-transform duration-100"
        )}
        transform={`translate(${f.x}, ${f.y}) rotate(${rot}, ${f.w / 2}, ${f.d / 2})`}
      >
        <rect
          width={f.w}
          height={f.d}
          rx={k === "rail" ? 30 : 40}
          className={cn(
            k === "shower" ? "fill-plan-wet" : k === "rail" ? "fill-muted-foreground" : "fill-plan-fixture",
            isSel ? "stroke-primary" : "stroke-plan-wall"
          )}
          strokeWidth={isSel ? 22 : 10}
          strokeDasharray={k === "shower" ? "40 25" : undefined}
        />
        {extra}
        {k !== "rail" && k !== "door" && (
          <text
            x={f.w / 2}
            y={k === "seat" ? f.d / 2 + 25 : f.d / 2 + 25}
            textAnchor="middle"
            className="fill-plan-wall pointer-events-none select-none"
            fontSize={k === "seat" ? 60 : 75}
            fontWeight={600}
            transform={rot ? `rotate(${-rot}, ${f.w / 2}, ${f.d / 2})` : undefined}
          >
            {k === "shower" ? "" : f.label}
          </text>
        )}
      </g>
    );
  };

  // Side transfer clearance zone
  const clearanceZone = (() => {
    if (!wc || !basin) return null;
    let zoneX = 0;
    let zoneW = 0;
    if (wc.x >= basin.x + basin.w) {
      zoneX = basin.x + basin.w;
      zoneW = wc.x - (basin.x + basin.w);
    } else if (basin.x >= wc.x + wc.w) {
      zoneX = wc.x + wc.w;
      zoneW = basin.x - (wc.x + wc.w);
    }
    if (zoneW <= 0) return null;
    return (
      <g>
        <rect
          x={zoneX}
          y={wc.y}
          width={zoneW}
          height={wc.d}
          className={cn(
            "transition-all duration-300 pointer-events-none",
            ok ? "fill-success/15 stroke-success" : "fill-warning/20 stroke-warning",
            highlightClearance ? "opacity-100" : "opacity-60"
          )}
          strokeWidth={8}
          strokeDasharray="15 10"
        />
        <text
          x={zoneX + zoneW / 2}
          y={wc.y + wc.d / 2}
          textAnchor="middle"
          fontSize={60}
          fontWeight={700}
          className={cn("pointer-events-none select-none", ok ? "fill-success" : "fill-warning")}
        >
          {zoneW} mm
        </text>
      </g>
    );
  })();

  return (
    <svg
      ref={svgRef}
      viewBox={`-260 -260 ${roomW + 520} ${roomD + 520}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label="Bathroom floor plan"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onMouseUp={handleEndDrag}
      onTouchEnd={handleEndDrag}
      onMouseLeave={handleEndDrag}
    >
      <rect x={0} y={0} width={roomW} height={roomD} className="fill-plan-floor" />

      {/* turning circle */}
      {layout.requirements.turningSpace && (
        <g className="pointer-events-none">
          <circle
            cx={tc.x}
            cy={tc.y}
            r={layout.turningDiameter / 2}
            className="fill-transparent stroke-success"
            strokeWidth={8}
            strokeDasharray="30 20"
            opacity={0.7}
          />
          <text x={tc.x} y={tc.y} textAnchor="middle" fontSize={60} className="fill-success" fontWeight={600}>
            Ø{layout.turningDiameter}
          </text>
        </g>
      )}

      {shower && (
        <text
          x={shower.x + shower.w / 2}
          y={shower.y + shower.d * 0.55}
          textAnchor="middle"
          fontSize={shower.w < 1000 ? 55 : 75}
          className="fill-accent-foreground pointer-events-none"
          fontWeight={600}
        >
          {shower.label}
        </text>
      )}

      {fixture("shower")}
      {fixture("seat")}
      {fixture("basin")}
      {fixture("wc")}
      {fixture("rail")}

      {clearanceZone}

      {/* Outer room walls */}
      <rect
        x={0}
        y={0}
        width={roomW}
        height={roomD}
        className="fill-none stroke-plan-wall pointer-events-none"
        strokeWidth={T * 1.6}
        strokeLinejoin="miter"
      />

      {/* Door - completely rotatable and movable */}
      {c.door && (
        <g
          role={onSelect ? "button" : undefined}
          aria-label="Door (click to select, drag or rotate)"
          tabIndex={onSelect ? 0 : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.("door");
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            handleStartDrag("door", e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            if (e.touches[0]) {
              handleStartDrag("door", e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          className={cn(
            onSelect && "cursor-grab active:cursor-grabbing",
            selected === "door" ? "opacity-100" : "opacity-90"
          )}
          transform={`translate(${c.door.x}, ${c.door.y}) rotate(${c.door.rotation ?? 0}, ${c.door.w / 2}, ${c.door.d / 2})`}
        >
          {/* Threshold opening */}
          <rect
            width={c.door.w}
            height={c.door.d || 60}
            rx="6"
            className={cn(
              "fill-card",
              selected === "door" ? "stroke-primary" : "stroke-plan-wall"
            )}
            strokeWidth={selected === "door" ? 16 : 10}
          />
          {/* Door leaf */}
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={-c.door.w}
            className={selected === "door" ? "stroke-primary" : "stroke-plan-wall"}
            strokeWidth={selected === "door" ? 14 : 8}
            strokeLinecap="round"
          />
          {/* Door swing arc */}
          <path
            d={`M 0 ${-c.door.w} A ${c.door.w} ${c.door.w} 0 0 1 ${c.door.w} 0`}
            className={cn(
              "fill-transparent",
              selected === "door" ? "stroke-primary" : "stroke-muted-foreground"
            )}
            strokeWidth={selected === "door" ? 12 : 6}
            strokeDasharray="20 15"
          />
          {/* Door label */}
          <text
            x={c.door.w / 2}
            y={(c.door.d || 60) / 2 + 15}
            textAnchor="middle"
            fontSize={50}
            fontWeight={600}
            className="fill-plan-wall pointer-events-none select-none"
          >
            Door {c.door.w}
          </text>
        </g>
      )}

      {dimensions && (
        <g className="fill-foreground stroke-foreground pointer-events-none" fontSize={70} fontWeight={600}>
          <line x1={0} y1={roomD + 150} x2={roomW} y2={roomD + 150} strokeWidth={6} />
          <text x={roomW / 2} y={roomD + 235} textAnchor="middle" stroke="none">
            {roomW} mm
          </text>
          <line x1={-150} y1={0} x2={-150} y2={roomD} strokeWidth={6} />
          <text
            x={-175}
            y={roomD / 2}
            textAnchor="middle"
            stroke="none"
            transform={`rotate(-90 -175 ${roomD / 2})`}
          >
            {roomD} mm
          </text>
          {c.door && (
            <text x={c.door.x + c.door.w / 2} y={c.door.y > 200 ? c.door.y - 80 : -200} textAnchor="middle" stroke="none">
              Door {c.door.w} mm
            </text>
          )}
          {shower && (
            <text x={shower.x + shower.w / 2} y={shower.y + shower.d - 50} textAnchor="middle" stroke="none" fontSize={60}>
              {shower.w} × {shower.d}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
