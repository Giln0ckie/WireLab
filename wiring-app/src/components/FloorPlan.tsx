import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * FloorPlan Import — drop‑in module for your Wiring Trainer
 * --------------------------------------------------------
 * What you get:
 * 1) useFloorPlanState() — a hook holding { floorPlan, actions }
 * 2) <FloorPlanControls /> — toolbar (Import, Opacity, Lock, Fit, Remove)
 * 3) <FloorPlanImage /> — place this INSIDE your main <svg> (as the first child)
 *
 * Works with PNG/JPG/SVG files. The image is draggable, scalable, rotatable,
 * and can be locked + dimmed via opacity. Handles are shown when unlocked.
 *
 * Minimal dependencies: plain React. Tailwind classes are used but optional.
 * No external UI libs required. Typescript-friendly.
 */

// Added in this revision:
// - <FloorPlanPanel />: a compact, collapsible sidebar panel that wraps
//   <FloorPlanControls /> and shows a live thumbnail + quick actions.

// ---------- Types ----------
export type FloorPlan = {
  src: string; // object URL for the imported file
  x: number;   // top-left X within SVG coords
  y: number;   // top-left Y within SVG coords
  scale: number; // uniform scale
  rotation: number; // degrees
  opacity: number; // 0..1
  locked: boolean;
  naturalWidth: number; // intrinsic width of the image, used for sizing
  naturalHeight: number; // intrinsic height
};

export type CanvasSize = { width: number; height: number };

// ---------- Hook ----------
export function useFloorPlanState() {
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Clean up blob URL when replaced/removed
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const loadFromFile = useCallback(async (file: File, opts?: Partial<Pick<FloorPlan, "opacity" | "scale">>) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    // Determine intrinsic size (also works for SVG)
    const dims = await getImageNaturalSize(url);

    setFloorPlan({
      src: url,
      x: 0,
      y: 0,
      scale: opts?.scale ?? 1,
      rotation: 0,
      opacity: opts?.opacity ?? 0.6,
      locked: false,
      naturalWidth: dims.width,
      naturalHeight: dims.height,
    });
  }, []);

  const remove = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFloorPlan(null);
  }, []);

  const actions = useMemo(
    () => ({
      loadFromFile,
      remove,
      set: setFloorPlan,
      toggleLock: () => setFloorPlan(fp => (fp ? { ...fp, locked: !fp.locked } : fp)),
      setOpacity: (v: number) => setFloorPlan(fp => (fp ? { ...fp, opacity: clamp(v, 0, 1) } : fp)),
      fitToCanvas: (canvas: CanvasSize, margin = 16) =>
        setFloorPlan(fp => {
          if (!fp) return fp;
          const maxW = Math.max(1, canvas.width - margin * 2);
          const maxH = Math.max(1, canvas.height - margin * 2);
          const scale = Math.min(maxW / fp.naturalWidth, maxH / fp.naturalHeight);
          return {
            ...fp,
            scale: isFinite(scale) && scale > 0 ? scale : fp.scale,
            x: margin,
            y: margin,
            rotation: 0,
          };
        }),
      resetTransform: () =>
        setFloorPlan(fp => (fp ? { ...fp, x: 0, y: 0, scale: 1, rotation: 0 } : fp)),
    }),
    [loadFromFile, remove]
  );

  return { floorPlan, setFloorPlan, actions } as const;
}

// ---------- Controls (toolbar) ----------
export function FloorPlanControls({
  floorPlan,
  actions,
  canvas,
  className,
}: {
  floorPlan: FloorPlan | null;
  actions: ReturnType<typeof useFloorPlanState>["actions"];
  canvas: CanvasSize; // used for "Fit to Canvas"
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={"flex flex-wrap items-center gap-2 " + (className ?? "") }>
      {/* Import button */}
      <button
        className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
        onClick={() => inputRef.current?.click()}
      >
        Import floor plan
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) actions.loadFromFile(f);
          e.currentTarget.value = ""; // allow re-upload same file later
        }}
      />

      {/* Opacity */}
      <label className="flex items-center gap-2 text-sm">
        Opacity
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={floorPlan?.opacity ?? 0.6}
          onChange={(e) => actions.setOpacity(parseFloat(e.target.value))}
        />
      </label>

      {/* Lock/Unlock */}
      <button
        className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
        onClick={() => actions.toggleLock()}
        disabled={!floorPlan}
        title={floorPlan?.locked ? "Unlock floor plan" : "Lock floor plan"}
      >
        {floorPlan?.locked ? "Unlock" : "Lock"}
      </button>

      {/* Fit to canvas */}
      <button
        className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
        onClick={() => actions.fitToCanvas(canvas)}
        disabled={!floorPlan}
      >
        Fit to canvas
      </button>

      {/* Reset */}
      <button
        className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
        onClick={() => actions.resetTransform()}
        disabled={!floorPlan}
      >
        Reset transform
      </button>

      {/* Remove */}
      <button
        className="px-3 py-1.5 rounded-xl border text-sm hover:bg-red-50 border-red-200 text-red-600"
        onClick={() => actions.remove()}
        disabled={!floorPlan}
      >
        Remove
      </button>
    </div>
  );
}

// ---------- SVG Layer ----------
/** Place <FloorPlanImage /> as the FIRST child inside your main <svg>. */
export function FloorPlanImage({
  floorPlan,
  setFloorPlan,
  gridSnap = 0, // set to your grid size in px to enable snapping on drag
}: {
  floorPlan: FloorPlan | null;
  setFloorPlan: React.Dispatch<React.SetStateAction<FloorPlan | null>>;
  gridSnap?: number;
}) {
  const dragging = useRef<{ kind: "move" | "scale" | "rotate"; startX: number; startY: number; fp: FloorPlan; handle?: string } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // We wrap in a <g> so consumers can insert this group at z-index bottom of their SVG
  const onPointerDown = (e: React.PointerEvent, kind: "move" | "scale" | "rotate", handle?: string) => {
    if (!floorPlan || floorPlan.locked) return;
    const svg = (e.currentTarget as Element).closest('svg') as SVGSVGElement | null;
    if (!svg) return;
    svgRef.current = svg;

    const pt = getSvgPoint(svg, e.clientX, e.clientY);
    dragging.current = { kind, startX: pt.x, startY: pt.y, fp: floorPlan, handle };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !svgRef.current) return;
    const { kind, startX, startY, fp, handle } = dragging.current;
    const pt = getSvgPoint(svgRef.current, e.clientX, e.clientY);
    const dx = pt.x - startX;
    const dy = pt.y - startY;

    if (kind === "move") {
      let nx = fp.x + dx;
      let ny = fp.y + dy;
      if (gridSnap > 0) {
        nx = snap(nx, gridSnap);
        ny = snap(ny, gridSnap);
      }
      setFloorPlan({ ...fp, x: nx, y: ny });
      return;
    }

    // Transform center = top-left + half size (scaled)
    const w = fp.naturalWidth * fp.scale;
    const h = fp.naturalHeight * fp.scale;
    const cx = fp.x + w / 2;
    const cy = fp.y + h / 2;

    if (kind === "rotate") {
      const a0 = Math.atan2(startY - cy, startX - cx);
      const a1 = Math.atan2(pt.y - cy, pt.x - cx);
      const deg = ((a1 - a0) * 180) / Math.PI;
      setFloorPlan({ ...fp, rotation: normalizeDeg(fp.rotation + deg) });
      dragging.current = { ...dragging.current, startX: pt.x, startY: pt.y, fp: { ...fp, rotation: normalizeDeg(fp.rotation + deg) } };
      return;
    }

    if (kind === "scale") {
      // choose sign based on handle (corner scaling)
      const signX = handle?.includes("right") ? 1 : -1;
      const signY = handle?.includes("bottom") ? 1 : -1;
      // project movement roughly to uniform scale delta
      const proj = (dx * signX + dy * signY) / 200; // tweak denominator for sensitivity
      const next = clamp(fp.scale + proj, 0.05, 50);
      setFloorPlan({ ...fp, scale: next });
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    dragging.current = null;
  };

  if (!floorPlan) return null;

  const w = floorPlan.naturalWidth * floorPlan.scale;
  const h = floorPlan.naturalHeight * floorPlan.scale;

  return (
    <g
      style={{ cursor: floorPlan.locked ? "default" : "grab" }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Actual image */}
      <image
        href={floorPlan.src}
        x={floorPlan.x}
        y={floorPlan.y}
        width={w}
        height={h}
        opacity={floorPlan.opacity}
        transform={`rotate(${floorPlan.rotation} ${floorPlan.x + w / 2} ${floorPlan.y + h / 2})`}
        style={{ pointerEvents: floorPlan.locked ? "none" : "all" }}
        onPointerDown={(e) => onPointerDown(e, "move")}
      />

      {/* Handles (only when unlocked) */}
      {!floorPlan.locked && (
        <g transform={`rotate(${floorPlan.rotation} ${floorPlan.x + w / 2} ${floorPlan.y + h / 2})`}>
          {/* Bounding box */}
          <rect x={floorPlan.x} y={floorPlan.y} width={w} height={h} fill="none" stroke="rgba(0,0,0,0.25)" strokeDasharray={6} />

          {/* Corner scale handles */}
          {[
            { x: floorPlan.x, y: floorPlan.y, id: "top-left" },
            { x: floorPlan.x + w, y: floorPlan.y, id: "top-right" },
            { x: floorPlan.x, y: floorPlan.y + h, id: "bottom-left" },
            { x: floorPlan.x + w, y: floorPlan.y + h, id: "bottom-right" },
          ].map((p) => (
            <rect
              key={p.id}
              x={p.x - 6}
              y={p.y - 6}
              width={12}
              height={12}
              fill="white"
              stroke="black"
              onPointerDown={(e) => onPointerDown(e, "scale", p.id)}
              style={{ cursor: "nwse-resize" }}
            />
          ))}

          {/* Rotation handle (above top-center) */}
          <circle
            cx={floorPlan.x + w / 2}
            cy={floorPlan.y - 24}
            r={6}
            fill="white"
            stroke="black"
            onPointerDown={(e) => onPointerDown(e, "rotate")}
            style={{ cursor: "grab" }}
          />
          <line
            x1={floorPlan.x + w / 2}
            y1={floorPlan.y}
            x2={floorPlan.x + w / 2}
            y2={floorPlan.y - 24}
            stroke="black"
            strokeDasharray={4}
          />
        </g>
      )}
    </g>
  );
}

// ---------- Helpers ----------
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function snap(n: number, grid: number) {
  return Math.round(n / grid) * grid;
}

function normalizeDeg(d: number) {
  let x = d % 360;
  if (x < 0) x += 360;
  return x;
}

function getSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : ({ x: clientX, y: clientY } as any);
}

async function getImageNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1000, height: img.naturalHeight || 800 });
    img.onerror = reject;
    img.src = src;
  });
}

// ---------- Panel (sidebar UI) ----------
export function FloorPlanPanel({
  floorPlan,
  actions,
  canvas,
  defaultOpen = true,
}: {
  floorPlan: FloorPlan | null;
  actions: ReturnType<typeof useFloorPlanState>["actions"];
  canvas: CanvasSize;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="rounded-2xl border bg-white/70 backdrop-blur p-3 w-full max-w-sm shadow-sm">
      <button
        className="w-full flex items-center justify-between text-left font-medium"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-sm">Floor plan</span>
        <span className="text-xs opacity-70">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Import */}
          <div>
            <button
              className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
              onClick={() => fileRef.current?.click()}
            >
              {floorPlan ? "Replace image" : "Import image"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) actions.loadFromFile(f);
                e.currentTarget.value = "";
              }}
            />
          </div>

          {/* Thumbnail preview */}
          <div className="rounded-xl border overflow-hidden bg-white">
            {floorPlan ? (
              <div className="flex items-center gap-3 p-2">
                <div className="w-20 h-16 shrink-0 bg-gray-100 border rounded-md overflow-hidden">
                  {/* Use CSS background to avoid creating extra <img> tag listeners */}
                  <div
                    className="w-full h-full"
                    style={{ backgroundImage: `url(${floorPlan.src})`, backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  <div>Size: {Math.round(floorPlan.naturalWidth)}×{Math.round(floorPlan.naturalHeight)} px</div>
                  <div>Scale: {floorPlan.scale.toFixed(2)}×</div>
                  <div>Rotation: {Math.round(floorPlan.rotation)}°</div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-xs text-gray-500">No image loaded.</div>
            )}
          </div>

          {/* Controls subset */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              Opacity
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={floorPlan?.opacity ?? 0.6}
                onChange={(e) => actions.setOpacity(parseFloat(e.target.value))}
              />
            </label>

            <button
              className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
              onClick={() => actions.toggleLock()}
              disabled={!floorPlan}
            >
              {floorPlan?.locked ? "Unlock" : "Lock"}
            </button>

            <button
              className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
              onClick={() => actions.fitToCanvas(canvas)}
              disabled={!floorPlan}
            >
              Fit
            </button>

            <button
              className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
              onClick={() => actions.resetTransform()}
              disabled={!floorPlan}
            >
              Reset
            </button>

            <button
              className="px-3 py-1.5 rounded-xl border text-sm hover:bg-red-50 border-red-200 text-red-600"
              onClick={() => actions.remove()}
              disabled={!floorPlan}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Example Integration (documentation) ----------
/**
 * 1) Hook it up in your trainer:
 *
 * const { floorPlan, setFloorPlan, actions } = useFloorPlanState();
 * const canvas = { width: 1200, height: 800 };
 *
 * <aside className="w-72 p-2 space-y-2">
 *   <FloorPlanPanel floorPlan={floorPlan} actions={actions} canvas={canvas} />
 *   (other panels ...)
 * </aside>
 *
 * <div className="flex-1">
 *   <svg width={canvas.width} height={canvas.height} viewBox={`0 0 ${canvas.width} ${canvas.height}`}>
 *     <FloorPlanImage floorPlan={floorPlan} setFloorPlan={setFloorPlan} gridSnap={20} />
 *     (wiring layers above)
 *   </svg>
 * </div>
 *
 * 2) If you already have a toolbox/sidebar, just drop <FloorPlanPanel /> in.
 *    It wraps the common actions and shows a quick preview.
 *
 * 3) Keyboard niceties (optional, wire up in your app):
 *    - Ctrl+Shift+F → Fit to canvas
 *    - R while dragging rotate-handle continues rotation
 *    - L toggles lock
 *
 * 4) State persistence: store `floorPlan` in your save/export JSON; the `src`
 *    will need a reimport step or convert to DataURL when exporting.
 */
