import { useState, useRef } from "react";
import type { BathroomLayout, ComponentKey, PlacedComponent } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Eye, Layers, Download, Check, Sparkles, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  layout: BathroomLayout;
}

export function Bathroom3DPreview({ layout }: Props) {
  const { roomW, roomD } = layout;
  const [showLabels, setShowLabels] = useState(true);
  const [viewMode, setViewMode] = useState<"iso" | "top">("iso");
  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const minX = pLeft.x - 220;
  const maxX = pRight.x + 220;
  const minY = pTop.y - 180;
  const maxY = pBottom.y + 220;
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

  // Export current SVG rendering to a high-resolution PNG image
  const handleDownloadImage = () => {
    if (!svgRef.current) return;
    setIsExporting(true);
    try {
      const svgElement = svgRef.current;
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgElement);

      if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!source.match(/^<svg[^>]+xmlns\:xlink="http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }

      const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2; // High-definition export
        const exportW = 1920;
        const exportH = Math.round(exportW * (vbH / vbW));
        canvas.width = exportW;
        canvas.height = exportH + 140;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setIsExporting(false);
          return;
        }

        // Architectural presentation background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, "#0b0f19");
        bgGrad.addColorStop(1, "#020617");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header Title Banner
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 26px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText("AdaptPath OS — Accessible Bathroom Adaptation", 50, 48);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "16px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText(
          `Room Specification: ${roomW} × ${roomD} mm · Dynamic 3D Architectural Render · UK Part M / BS 8300`,
          50,
          80
        );

        // Header separator line
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(50, 102);
        ctx.lineTo(canvas.width - 50, 102);
        ctx.stroke();

        // Draw the 3D Render
        ctx.drawImage(img, 40, 120, canvas.width - 80, exportH);

        // Footer Metadata
        ctx.fillStyle = "#64748b";
        ctx.font = "14px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText(
          "Deterministic Accessibility Specification · Generated directly from verified architectural measurements",
          50,
          canvas.height - 25
        );

        const pngUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = `bathroom-design-${roomW}x${roomD}.png`;
        link.href = pngUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setIsExporting(false);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 3000);
      };

      img.onerror = () => {
        setIsExporting(false);
      };

      img.src = url;
    } catch (err) {
      console.error("Failed to export image", err);
      setIsExporting(false);
    }
  };

  // Helper for drop shadows onto floor
  const renderFloorShadow = (
    c: PlacedComponent,
    origin?: { cx: number; cy: number; rot: number }
  ) => {
    const { x, y, w, d } = c;
    const cx = origin ? origin.cx : x + w / 2;
    const cy = origin ? origin.cy : y + d / 2;
    const rot = origin ? origin.rot : (c.rotation ?? 0);

    const p0 = rotPoint(x - 20, y - 20, cx, cy, rot);
    const p1 = rotPoint(x + w + 20, y - 20, cx, cy, rot);
    const p2 = rotPoint(x + w + 20, y + d + 30, cx, cy, rot);
    const p3 = rotPoint(x - 20, y + d + 30, cx, cy, rot);

    const b0 = toIso(p0.x, p0.y, 0);
    const b1 = toIso(p1.x, p1.y, 0);
    const b2 = toIso(p2.x, p2.y, 0);
    const b3 = toIso(p3.x, p3.y, 0);

    return (
      <polygon
        key={`shadow-${c.key}`}
        points={`${b0.x},${b0.y} ${b1.x},${b1.y} ${b2.x},${b2.y} ${b3.x},${b3.y}`}
        fill="rgba(0, 0, 0, 0.45)"
        filter="url(#softShadow)"
      />
    );
  };

  // Render 3D textured fixture box
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
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Right Face (along x-axis) */}
        <polygon
          points={`${b2.x},${b2.y} ${b1.x},${b1.y} ${t1.x},${t1.y} ${t2.x},${t2.y}`}
          fill={colors.right}
          stroke={colors.stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Top Face */}
        <polygon
          points={`${t0.x},${t0.y} ${t1.x},${t1.y} ${t2.x},${t2.y} ${t3.x},${t3.y}`}
          fill={colors.top}
          stroke={colors.stroke}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* Floating Label */}
        {showLabels && label && (
          <g transform={`translate(${t2.x}, ${t2.y - 32})`}>
            <rect
              x="-75"
              y="-30"
              width="150"
              height="30"
              rx="7"
              fill="rgba(15, 23, 42, 0.92)"
              stroke="#38bdf8"
              strokeWidth="2"
            />
            <text
              x="0"
              y="-10"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="14"
              fontWeight="600"
              letterSpacing="0.3px"
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

    // Tempered glass screen on the open edge
    const gTop0 = toIso(sp1.x, sp1.y, 1850);
    const gTop1 = toIso(sp2.x, sp2.y, 1850);
    const gBot0 = p1;
    const gBot1 = p2;

    // Shower head and riser rail positions
    const shPoleTopP = rotPoint(x + 120, y + 60, cx, cy, rotation);
    const shPoleTop = toIso(shPoleTopP.x, shPoleTopP.y, 1950);
    const shPoleBot = toIso(shPoleTopP.x, shPoleTopP.y, 900);
    const shHeadP = rotPoint(x + 350, y + 250, cx, cy, rotation);
    const shHead = toIso(shHeadP.x, shHeadP.y, 2000);
    const drain = toIso(cx, cy, 0);

    return (
      <g key="shower">
        {/* Wet room shower non-slip floor zone */}
        <polygon
          points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
          fill="url(#showerGrad)"
          stroke="#0284c7"
          strokeWidth="4"
          strokeDasharray="16 8"
        />

        {/* Flush shower drain grate */}
        <ellipse cx={drain.x} cy={drain.y} rx="26" ry="14" fill="#334155" stroke="#94a3b8" strokeWidth="3" />
        <ellipse cx={drain.x} cy={drain.y} rx="14" ry="7" fill="#0f172a" />
        <line x1={drain.x - 18} y1={drain.y} x2={drain.x + 18} y2={drain.y} stroke="#94a3b8" strokeWidth="2" />

        {/* Chrome thermostatic shower mixer bar */}
        <line
          x1={shPoleBot.x - 20}
          y1={shPoleBot.y + 10}
          x2={shPoleBot.x + 20}
          y2={shPoleBot.y - 10}
          stroke="url(#chromeGrad)"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Chrome vertical riser rail & drench shower head */}
        <line
          x1={shPoleBot.x}
          y1={shPoleBot.y}
          x2={shPoleTop.x}
          y2={shPoleTop.y}
          stroke="url(#chromeGrad)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <line
          x1={shPoleTop.x}
          y1={shPoleTop.y}
          x2={shHead.x}
          y2={shHead.y}
          stroke="url(#chromeGrad)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {/* Overhead rainfall shower head with chrome rim */}
        <ellipse cx={shHead.x} cy={shHead.y} rx="34" ry="18" fill="url(#chromeGrad)" stroke="#64748b" strokeWidth="3" />
        <ellipse cx={shHead.x} cy={shHead.y} rx="24" ry="12" fill="#f8fafc" />

        {/* Tempered Safety Glass Screen */}
        <polygon
          points={`${gBot0.x},${gBot0.y} ${gBot1.x},${gBot1.y} ${gTop1.x},${gTop1.y} ${gTop0.x},${gTop0.y}`}
          fill="url(#glassGrad)"
          stroke="rgba(56, 189, 248, 0.9)"
          strokeWidth="4"
        />
        {/* Glass reflection highlight line */}
        <line
          x1={gBot0.x + (gBot1.x - gBot0.x) * 0.35}
          y1={gBot0.y + (gTop0.y - gBot0.y) * 0.15}
          x2={gBot0.x + (gBot1.x - gBot0.x) * 0.35}
          y2={gBot0.y + (gTop0.y - gBot0.y) * 0.85}
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth="3"
        />
        {/* Chrome top support tie bar */}
        <line
          x1={gTop0.x}
          y1={gTop0.y}
          x2={gTop1.x}
          y2={gTop1.y}
          stroke="url(#chromeGrad)"
          strokeWidth="6"
        />
        {/* Chrome bottom clamping channel */}
        <line
          x1={gBot0.x}
          y1={gBot0.y}
          x2={gBot1.x}
          y2={gBot1.y}
          stroke="url(#chromeGrad)"
          strokeWidth="5"
        />

        {showLabels && (
          <g transform={`translate(${gTop1.x - 20}, ${gTop1.y - 32})`}>
            <rect x="-70" y="-30" width="140" height="30" rx="7" fill="rgba(15, 23, 42, 0.92)" stroke="#38bdf8" strokeWidth="2" />
            <text x="0" y="-10" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="600">
              Level-Access Shower
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

    // Pan top center for porcelain bowl rim
    const panCenterP = rotPoint(x + w / 2, y + 200 + (d - 200) / 2, cx, cy, rotation);
    const panCenterIso = toIso(panCenterP.x, panCenterP.y, 480);

    // Cistern top center for flush buttons
    const cisCenterP = rotPoint(x + w / 2, y + 100, cx, cy, rotation);
    const cisCenterIso = toIso(cisCenterP.x, cisCenterP.y, 820);

    return (
      <g key="wc">
        {/* Drop shadow on floor */}
        {renderFloorShadow(wc, origin)}

        {/* Accessible raised-height pan (480mm height) */}
        {render3DBox(
          panComp,
          480,
          {
            top: "url(#porcelainTop)",
            left: "#cbd5e1",
            right: "#e2e8f0",
            stroke: "#94a3b8",
          },
          "Accessible WC",
          origin
        )}

        {/* Porcelain inner bowl ellipse */}
        <ellipse
          cx={panCenterIso.x}
          cy={panCenterIso.y}
          rx="26"
          ry="15"
          fill="#e2e8f0"
          stroke="#cbd5e1"
          strokeWidth="3"
        />

        {/* Back-to-wall cistern (820mm height) */}
        {render3DBox(
          cisternComp,
          820,
          {
            top: "#ffffff",
            left: "#94a3b8",
            right: "#cbd5e1",
            stroke: "#64748b",
          },
          undefined,
          origin
        )}

        {/* Chrome dual-flush push buttons */}
        <ellipse
          cx={cisCenterIso.x}
          cy={cisCenterIso.y}
          rx="14"
          ry="7"
          fill="url(#chromeGrad)"
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        <circle cx={cisCenterIso.x - 4} cy={cisCenterIso.y} r="3" fill="#ffffff" />
        <circle cx={cisCenterIso.x + 4} cy={cisCenterIso.y} r="3" fill="#ffffff" />
      </g>
    );
  };

  const renderBasin = () => {
    const b = components.basin;
    if (!b) return null;
    const { x, y, w, d, rotation = 0 } = b;
    const cx = x + w / 2;
    const cy = y + d / 2;
    const origin = { cx, cy, rot: rotation };

    const btP = rotPoint(x + w / 2, y + 100, cx, cy, rotation);
    const basinCenter = toIso(btP.x, btP.y, 750);

    const mP0 = rotPoint(x + 40, y, cx, cy, rotation);
    const mP1 = rotPoint(x + w - 40, y, cx, cy, rotation);
    const m0 = toIso(mP0.x, mP0.y, 900);
    const m1 = toIso(mP1.x, mP1.y, 900);
    const m2 = toIso(mP1.x, mP1.y, 1650);
    const m3 = toIso(mP0.x, mP0.y, 1650);

    return (
      <g key="basin">
        {/* Floor drop shadow */}
        {renderFloorShadow(b, origin)}

        {/* Ceramic vanity basin (750mm height) */}
        {render3DBox(
          b,
          750,
          {
            top: "url(#porcelainTop)",
            left: "#cbd5e1",
            right: "#e2e8f0",
            stroke: "#94a3b8",
          },
          "Accessible Basin",
          origin
        )}

        {/* Sink basin inner bowl contour */}
        <ellipse
          cx={basinCenter.x}
          cy={basinCenter.y}
          rx="32"
          ry="16"
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth="2.5"
        />
        {/* Chrome waste plug */}
        <circle cx={basinCenter.x} cy={basinCenter.y} r="5" fill="url(#chromeGrad)" />

        {/* Chrome monobloc lever mixer tap */}
        <line
          x1={basinCenter.x}
          y1={basinCenter.y - 12}
          x2={basinCenter.x}
          y2={basinCenter.y - 38}
          stroke="url(#chromeGrad)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <line
          x1={basinCenter.x}
          y1={basinCenter.y - 38}
          x2={basinCenter.x - 12}
          y2={basinCenter.y - 32}
          stroke="url(#chromeGrad)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {/* Single lever handle */}
        <line
          x1={basinCenter.x - 8}
          y1={basinCenter.y - 42}
          x2={basinCenter.x + 8}
          y2={basinCenter.y - 46}
          stroke="url(#chromeGrad)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Wall mirror above basin */}
        <polygon
          points={`${m0.x},${m0.y} ${m1.x},${m1.y} ${m2.x},${m2.y} ${m3.x},${m3.y}`}
          fill="url(#mirrorGrad)"
          stroke="#cbd5e1"
          strokeWidth="4"
        />
        {/* Diagonal mirror glass reflection streak */}
        <line
          x1={m0.x + (m1.x - m0.x) * 0.25}
          y1={m0.y - 40}
          x2={m0.x + (m1.x - m0.x) * 0.75}
          y2={m2.y + 40}
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="4"
        />
      </g>
    );
  };

  const renderSeat = () => {
    const seat = components.seat;
    if (!seat) return null;
    const { x, y, w, d, rotation = 0 } = seat;
    const cx = x + w / 2;
    const cy = y + d / 2;
    const origin = { cx, cy, rot: rotation };

    return (
      <g key="seat">
        {/* Drop shadow on floor */}
        {renderFloorShadow(seat, origin)}

        {/* Padded ergonomic shower seat (480mm height) */}
        {render3DBox(
          seat,
          480,
          {
            top: "url(#seatGrad)",
            left: "#0369a1",
            right: "#0284c7",
            stroke: "#075985",
          },
          "Shower Seat",
          origin
        )}
      </g>
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
        {/* 35mm tubular stainless steel grab rail */}
        <line
          x1={rStart.x}
          y1={rStart.y}
          x2={rEnd.x}
          y2={rEnd.y}
          stroke="#475569"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <line
          x1={rStart.x}
          y1={rStart.y}
          x2={rEnd.x}
          y2={rEnd.y}
          stroke="url(#chromeGrad)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Wall mounting circular flanges */}
        <circle cx={rStart.x} cy={rStart.y} r="10" fill="#94a3b8" stroke="#334155" strokeWidth="2" />
        <circle cx={rEnd.x} cy={rEnd.y} r="10" fill="#94a3b8" stroke="#334155" strokeWidth="2" />
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
          fill="rgba(241, 245, 249, 0.15)"
          stroke="#94a3b8"
          strokeWidth="4"
          strokeDasharray="14 8"
        />
        {/* Door threshold transition strip */}
        <line x1={d0.x} y1={d0.y} x2={d1.x} y2={d1.y} stroke="url(#chromeGrad)" strokeWidth="6" />
      </g>
    );
  };

  return (
    <div className="space-y-3">
      {/* View & Export Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card border border-border p-2 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode("iso")}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors cursor-pointer",
              viewMode === "iso" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" /> 3D Architectural Render
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

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded border-border text-primary"
            />
            <span>Show Fixture Labels</span>
          </label>

          {/* 1-Click High-Res PNG Image Download Button */}
          <Button
            type="button"
            size="sm"
            onClick={handleDownloadImage}
            disabled={isExporting}
            className="flex items-center gap-1.5 font-medium cursor-pointer bg-slate-900 border border-slate-700 text-slate-100 hover:bg-slate-800"
          >
            {downloadSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300">PNG Saved!</span>
              </>
            ) : isExporting ? (
              <>
                <Sparkles className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Exporting Image...</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 text-primary" />
                <span>Download Design Image (PNG)</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Dynamic Visualizer Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-slate-950 p-4 shadow-inner">
        {viewMode === "iso" ? (
          <svg
            ref={svgRef}
            viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
            className="h-auto w-full max-h-[560px] select-none"
            role="img"
            aria-label="3D Textured Architectural Bathroom Render"
          >
            <defs>
              {/* Soft floor contact shadow filter */}
              <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
              </filter>

              {/* Floor finish gradient */}
              <linearGradient id="floorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="60%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#090d16" />
              </linearGradient>

              {/* Wet room shower non-slip area gradient */}
              <linearGradient id="showerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#0369a1" stopOpacity="0.4" />
              </linearGradient>

              {/* Wall left gradient with ambient light falloff */}
              <linearGradient id="wallLeftGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="50%" stopColor="#3f4f66" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>

              {/* Wall right gradient */}
              <linearGradient id="wallRightGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#283548" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>

              {/* Sanitary porcelain ceramic gradient */}
              <linearGradient id="porcelainTop" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="70%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>

              {/* High-polish chrome metallic gradient */}
              <linearGradient id="chromeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#94a3b8" />
                <stop offset="35%" stopColor="#ffffff" />
                <stop offset="65%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#64748b" />
              </linearGradient>

              {/* Tempered safety glass screen gradient */}
              <linearGradient id="glassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="70%" stopColor="#0284c7" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.32" />
              </linearGradient>

              {/* Mirror reflection gradient */}
              <linearGradient id="mirrorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.75" />
                <stop offset="50%" stopColor="#ffffff" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.65" />
              </linearGradient>

              {/* Shower seat textured padding gradient */}
              <linearGradient id="seatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#0369a1" />
              </linearGradient>
            </defs>

            {/* Back Wall Left (along y-axis) */}
            {(() => {
              const b0 = toIso(0, 0, 0);
              const b1 = toIso(0, roomD, 0);
              const t1 = toIso(0, roomD, wallH);
              const t0 = toIso(0, 0, wallH);
              return (
                <g key="wall-left">
                  <polygon
                    points={`${b0.x},${b0.y} ${b1.x},${b1.y} ${t1.x},${t1.y} ${t0.x},${t0.y}`}
                    fill="url(#wallLeftGrad)"
                    stroke="#64748b"
                    strokeWidth="4"
                  />
                  {/* Modern ceramic wall tile horizontal joints */}
                  {Array.from({ length: Math.floor(wallH / 300) }).map((_, i) => {
                    const z = (i + 1) * 300;
                    const pStart = toIso(0, 0, z);
                    const pEnd = toIso(0, roomD, z);
                    return (
                      <line
                        key={`wtl-h-${i}`}
                        x1={pStart.x}
                        y1={pStart.y}
                        x2={pEnd.x}
                        y2={pEnd.y}
                        stroke="#475569"
                        strokeWidth="1.5"
                        opacity="0.5"
                      />
                    );
                  })}
                </g>
              );
            })()}

            {/* Back Wall Right (along x-axis) */}
            {(() => {
              const b0 = toIso(0, 0, 0);
              const b1 = toIso(roomW, 0, 0);
              const t1 = toIso(roomW, 0, wallH);
              const t0 = toIso(0, 0, wallH);
              return (
                <g key="wall-right">
                  <polygon
                    points={`${b0.x},${b0.y} ${b1.x},${b1.y} ${t1.x},${t1.y} ${t0.x},${t0.y}`}
                    fill="url(#wallRightGrad)"
                    stroke="#475569"
                    strokeWidth="4"
                  />
                  {/* Wall tile joints on right wall */}
                  {Array.from({ length: Math.floor(wallH / 300) }).map((_, i) => {
                    const z = (i + 1) * 300;
                    const pStart = toIso(0, 0, z);
                    const pEnd = toIso(roomW, 0, z);
                    return (
                      <line
                        key={`wtr-h-${i}`}
                        x1={pStart.x}
                        y1={pStart.y}
                        x2={pEnd.x}
                        y2={pEnd.y}
                        stroke="#334155"
                        strokeWidth="1.5"
                        opacity="0.5"
                      />
                    );
                  })}
                </g>
              );
            })()}

            {/* Ceramic Tiled Floor Quad */}
            {(() => {
              const f0 = toIso(0, 0, 0);
              const f1 = toIso(roomW, 0, 0);
              const f2 = toIso(roomW, roomD, 0);
              const f3 = toIso(0, roomD, 0);
              return (
                <g key="floor-quad">
                  <polygon
                    points={`${f0.x},${f0.y} ${f1.x},${f1.y} ${f2.x},${f2.y} ${f3.x},${f3.y}`}
                    fill="url(#floorGrad)"
                    stroke="#475569"
                    strokeWidth="4"
                  />
                  {/* Isometric Floor Tile Grid (300mm x 300mm tiles) */}
                  {Array.from({ length: Math.floor(roomW / 300) + 1 }).map((_, i) => {
                    const x = i * 300;
                    const pStart = toIso(x, 0, 0);
                    const pEnd = toIso(x, roomD, 0);
                    return (
                      <line
                        key={`ft-x-${i}`}
                        x1={pStart.x}
                        y1={pStart.y}
                        x2={pEnd.x}
                        y2={pEnd.y}
                        stroke="#334155"
                        strokeWidth="1.5"
                        opacity="0.55"
                      />
                    );
                  })}
                  {Array.from({ length: Math.floor(roomD / 300) + 1 }).map((_, i) => {
                    const y = i * 300;
                    const pStart = toIso(0, y, 0);
                    const pEnd = toIso(roomW, y, 0);
                    return (
                      <line
                        key={`ft-y-${i}`}
                        x1={pStart.x}
                        y1={pStart.y}
                        x2={pEnd.x}
                        y2={pEnd.y}
                        stroke="#334155"
                        strokeWidth="1.5"
                        opacity="0.55"
                      />
                    );
                  })}
                </g>
              );
            })()}

            {/* Wheelchair Turning Space Projection on Floor */}
            {layout.requirements.turningSpace && (() => {
              const tc = toIso(layout.turningCentre.x, layout.turningCentre.y, 0);
              const rx = (layout.turningDiameter / 2) * cos30;
              const ry = (layout.turningDiameter / 2) * sin30;
              const ok = layout.turningDiameter >= 1500;
              return (
                <g key="turning-circle">
                  <ellipse
                    cx={tc.x}
                    cy={tc.y}
                    rx={rx}
                    ry={ry}
                    fill={ok ? "rgba(34, 197, 94, 0.09)" : "rgba(245, 158, 11, 0.09)"}
                    stroke={ok ? "#22c55e" : "#f59e0b"}
                    strokeWidth="3.5"
                    strokeDasharray="14 8"
                  />
                  {/* Center crosshair */}
                  <line x1={tc.x - 12} y1={tc.y} x2={tc.x + 12} y2={tc.y} stroke={ok ? "#4ade80" : "#fbbf24"} strokeWidth="2" />
                  <line x1={tc.x} y1={tc.y - 8} x2={tc.x} y2={tc.y + 8} stroke={ok ? "#4ade80" : "#fbbf24"} strokeWidth="2" />
                  <text
                    x={tc.x}
                    y={tc.y + 24}
                    textAnchor="middle"
                    fill={ok ? "#4ade80" : "#fbbf24"}
                    fontSize="16"
                    fontWeight="600"
                    className="select-none pointer-events-none"
                  >
                    Ø{layout.turningDiameter} mm Wheelchair Turning
                  </text>
                </g>
              );
            })()}

            {/* Depth-Sorted Fixtures */}
            {renderShower()}
            {renderDoor()}
            {renderSeat()}
            {renderBasin()}
            {renderWc()}
            {renderRail()}
          </svg>
        ) : (
          /* Top 2D Plan View */
          <div className="mx-auto max-w-lg p-2">
            <svg
              viewBox={`-100 -100 ${roomW + 200} ${roomD + 200}`}
              className="h-auto w-full select-none"
              role="img"
              aria-label="Top 2D Plan View"
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
                    fill={
                      comp.key === "shower"
                        ? "#0284c7"
                        : comp.key === "wc"
                        ? "#f8fafc"
                        : comp.key === "basin"
                        ? "#e2e8f0"
                        : "#64748b"
                    }
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

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 border-t border-slate-800 pt-3">
          <span>
            Room Spec: <strong className="text-slate-200">{roomW} × {roomD} mm</strong>
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <Sparkles className="h-3 w-3 text-primary" />
            Dynamic architectural render updates automatically when fixtures are moved or rotated.
          </span>
        </div>
      </div>
    </div>
  );
}
