import type { BathroomLayout, ComponentKey, PlacedComponent } from "@/lib/domain";
import { WC_RULE_MIN_SIDE_CLEARANCE } from "@/lib/rules";
import { cn } from "@/lib/utils";

interface Props {
  layout: BathroomLayout;
  selected?: ComponentKey | null;
  onSelect?: (k: ComponentKey) => void;
  highlightClearance?: boolean;
  dimensions?: boolean;
}

export function BathroomPlan({ layout, selected, onSelect, highlightClearance, dimensions }: Props) {
  const { roomW, roomD } = layout;
  const c = Object.fromEntries(layout.components.map((x) => [x.key, x])) as Partial<Record<ComponentKey, PlacedComponent>> & Record<"shower" | "wc" | "basin" | "door", PlacedComponent>;
  const wc = c.wc, basin = c.basin, shower = c.shower;
  const gap = wc.x - (basin.x + basin.w);
  const ok = gap >= WC_RULE_MIN_SIDE_CLEARANCE;
  const tc = layout.turningCentre;
  const T = 60;

  const fixture = (k: ComponentKey, extra?: React.ReactNode) => {
    const f = c[k];
    if (!f) return null;
    const isSel = selected === k;
    return (
      <g
        key={k}
        role={onSelect ? "button" : undefined}
        aria-label={f.label}
        tabIndex={onSelect ? 0 : undefined}
        onClick={() => onSelect?.(k)}
        onKeyDown={(e) => e.key === "Enter" && onSelect?.(k)}
        className={cn(onSelect && "cursor-pointer", "transition-all duration-500")}
        style={{ transform: `translate(${f.x}px, ${f.y}px)` }}
      >
        <rect width={f.w} height={f.d} rx={k === "rail" ? 30 : 40}
          className={cn(k === "shower" ? "fill-plan-wet" : k === "rail" ? "fill-muted-foreground" : "fill-plan-fixture",
            isSel ? "stroke-primary" : "stroke-plan-wall")}
          strokeWidth={isSel ? 22 : 10} strokeDasharray={k === "shower" ? "40 25" : undefined} />
        {extra}
        {k !== "rail" && k !== "door" && (
          <text x={f.w / 2} y={k === "seat" ? f.d / 2 + 25 : f.d / 2 + 25} textAnchor="middle" className="fill-plan-wall" fontSize={k === "seat" ? 60 : 75} fontWeight={600}>
            {k === "shower" ? "" : f.label}
          </text>
        )}
      </g>
    );
  };

  return (
    <svg viewBox={`-260 -260 ${roomW + 520} ${roomD + 520}`} className="h-auto w-full" role="img" aria-label="Bathroom floor plan">
      <rect x={0} y={0} width={roomW} height={roomD} className="fill-plan-floor" />
      {/* turning circle */}
      {layout.requirements.turningSpace && (
        <>
          <circle cx={tc.x} cy={tc.y} r={layout.turningDiameter / 2} className="fill-transparent stroke-success" strokeWidth={8} strokeDasharray="30 20" opacity={0.7} />
          <text x={tc.x} y={tc.y} textAnchor="middle" fontSize={60} className="fill-success" fontWeight={600}>Ø{layout.turningDiameter}</text>
        </>
      )}
      <text x={shower.w / 2} y={shower.d * 0.55} textAnchor="middle" fontSize={shower.w < 1000 ? 55 : 75} className="fill-accent-foreground" fontWeight={600}>{shower.label}</text>
      {fixture("shower")}
      {fixture("seat")}
      {fixture("basin")}
      {fixture("wc")}
      {fixture("rail")}
      {/* clearance zone */}
      <rect x={basin.x + basin.w} y={wc.y} width={Math.max(gap, 0)} height={wc.d}
        className={cn("transition-all duration-500", ok ? "fill-success/15 stroke-success" : "fill-warning/20 stroke-warning", highlightClearance ? "opacity-100" : "opacity-60")} strokeWidth={8} />
      <text x={basin.x + basin.w + gap / 2} y={wc.y + wc.d / 2} textAnchor="middle" fontSize={60} fontWeight={700} className={cn("transition-all duration-500", ok ? "fill-success" : "fill-warning")}>{gap}</text>
      {/* walls */}
      <path d={`M${c.door.x + c.door.w} 0 H${roomW} V${roomD} H0 V0 H${c.door.x}`} className="fill-none stroke-plan-wall" strokeWidth={T * 1.6} strokeLinejoin="miter" />
      {/* door swing */}
      <g role={onSelect ? "button" : undefined} aria-label="Door" onClick={() => onSelect?.("door")} className={onSelect ? "cursor-pointer" : undefined}>
        <path d={`M${c.door.x} 0 L${c.door.x} ${-c.door.w} A${c.door.w} ${c.door.w} 0 0 1 ${c.door.x + c.door.w} 0`} className={cn("fill-transparent", selected === "door" ? "stroke-primary" : "stroke-muted-foreground")} strokeWidth={selected === "door" ? 16 : 8} strokeDasharray="20 15" />
      </g>
      {dimensions && (
        <g className="fill-foreground stroke-foreground" fontSize={70} fontWeight={600}>
          <line x1={0} y1={roomD + 150} x2={roomW} y2={roomD + 150} strokeWidth={6} />
          <text x={roomW / 2} y={roomD + 235} textAnchor="middle" stroke="none">{roomW} mm</text>
          <line x1={-150} y1={0} x2={-150} y2={roomD} strokeWidth={6} />
          <text x={-175} y={roomD / 2} textAnchor="middle" stroke="none" transform={`rotate(-90 -175 ${roomD / 2})`}>{roomD} mm</text>
          <text x={c.door.x + c.door.w / 2} y={-200} textAnchor="middle" stroke="none">Door {c.door.w}</text>
          <text x={shower.w / 2} y={shower.d - 50} textAnchor="middle" stroke="none" fontSize={60}>{shower.w} × {shower.d}</text>
        </g>
      )}
    </svg>
  );
}
