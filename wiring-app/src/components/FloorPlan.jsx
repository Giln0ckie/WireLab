import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// FloorPlan Import — drop‑in module for your Wiring Trainer (plain React)

// ---------- Hook ----------
export function useFloorPlanState() {
  const [floorPlan, setFloorPlan] = useState(null);
  const objectUrlRef = useRef(null);

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const loadFromFile = useCallback(async (file, opts) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const dims = await getImageNaturalSize(url);
    setFloorPlan({
      src: url,
      x: 0,
      y: 0,
      scale: (opts && opts.scale) ?? 1,
      rotation: 0,
      opacity: (opts && opts.opacity) ?? 0.6,
      locked: false,
      naturalWidth: dims.width,
      naturalHeight: dims.height,
    });
  }, []);

  const remove = useCallback(() => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    setFloorPlan(null);
  }, []);

  const actions = useMemo(() => ({
    loadFromFile,
    remove,
    set: setFloorPlan,
    toggleLock: () => setFloorPlan(fp => (fp ? { ...fp, locked: !fp.locked } : fp)),
    setOpacity: (v) => setFloorPlan(fp => (fp ? { ...fp, opacity: clamp(v, 0, 1) } : fp)),
    fitToCanvas: (canvas, margin = 16) => setFloorPlan(fp => {
      if (!fp) return fp;
      const maxW = Math.max(1, canvas.width - margin * 2);
      const maxH = Math.max(1, canvas.height - margin * 2);
      const scale = Math.min(maxW / fp.naturalWidth, maxH / fp.naturalHeight);
      return { ...fp, scale: isFinite(scale) && scale > 0 ? scale : fp.scale, x: margin, y: margin, rotation: 0 };
    }),
    resetTransform: () => setFloorPlan(fp => (fp ? { ...fp, x: 0, y: 0, scale: 1, rotation: 0 } : fp)),
  }), [loadFromFile, remove]);

  return { floorPlan, setFloorPlan, actions };
}

// ---------- Controls (toolbar) ----------
export function FloorPlanControls({ floorPlan, actions, canvas, className }) {
  const inputRef = useRef(null);
  return (
    <div className={("flex flex-wrap items-center gap-2 ") + (className ?? "") }>
      <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50 neutral-btn" onClick={() => inputRef.current?.click()}>
        Import floor plan
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) actions.loadFromFile(f); e.currentTarget.value = ""; }}
      />

      <label className="flex items-center gap-2 text-sm">
        Opacity
        <input type="range" min={0} max={1} step={0.05} value={floorPlan?.opacity ?? 0.6} onChange={(e) => actions.setOpacity(parseFloat(e.target.value))} />
      </label>

      <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50 neutral-btn" onClick={() => actions.toggleLock()} disabled={!floorPlan} title={floorPlan?.locked ? "Unlock floor plan" : "Lock floor plan"}>
        {floorPlan?.locked ? "Unlock" : "Lock"}
      </button>

      <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50 neutral-btn" onClick={() => actions.fitToCanvas(canvas)} disabled={!floorPlan}>
        Fit to canvas
      </button>

      <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50 neutral-btn" onClick={() => actions.resetTransform()} disabled={!floorPlan}>
        Reset transform
      </button>

      <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-red-50 border-red-200 text-red-600" onClick={() => actions.remove()} disabled={!floorPlan}>
        Remove
      </button>
    </div>
  );
}

// ---------- SVG Layer ----------
export function FloorPlanImage({ floorPlan, setFloorPlan, gridSnap = 0 }) {
  const dragging = useRef(null);
  const svgRef = useRef(null);

  const onPointerDown = (e, kind, handle) => {
    if (!floorPlan || floorPlan.locked) return;
    const svg = e.currentTarget.closest('svg');
    if (!svg) return;
    svgRef.current = svg;
    const pt = getSvgPoint(svg, e.clientX, e.clientY);
    dragging.current = { kind, startX: pt.x, startY: pt.y, fp: floorPlan, handle };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current || !svgRef.current) return;
    const { kind, startX, startY, fp, handle } = dragging.current;
    const pt = getSvgPoint(svgRef.current, e.clientX, e.clientY);
    const dx = pt.x - startX;
    const dy = pt.y - startY;

    if (kind === 'move') {
      let nx = fp.x + dx, ny = fp.y + dy;
      if (gridSnap > 0) { nx = snap(nx, gridSnap); ny = snap(ny, gridSnap); }
      setFloorPlan({ ...fp, x: nx, y: ny });
      return;
    }

    const w = fp.naturalWidth * fp.scale;
    const h = fp.naturalHeight * fp.scale;
    const cx = fp.x + w / 2; const cy = fp.y + h / 2;

    if (kind === 'rotate') {
      const a0 = Math.atan2(startY - cy, startX - cx);
      const a1 = Math.atan2(pt.y - cy, pt.x - cx);
      const deg = ((a1 - a0) * 180) / Math.PI;
      const rot = normalizeDeg(fp.rotation + deg);
      setFloorPlan({ ...fp, rotation: rot });
      dragging.current = { ...dragging.current, startX: pt.x, startY: pt.y, fp: { ...fp, rotation: rot } };
      return;
    }

    if (kind === 'scale') {
      const signX = handle?.includes('right') ? 1 : -1;
      const signY = handle?.includes('bottom') ? 1 : -1;
      const proj = (dx * signX + dy * signY) / 200;
      const next = clamp(fp.scale + proj, 0.05, 50);
      setFloorPlan({ ...fp, scale: next });
      return;
    }
  };

  const onPointerUp = (e) => {
    if (!dragging.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragging.current = null;
  };

  if (!floorPlan) return null;

  const w = floorPlan.naturalWidth * floorPlan.scale;
  const h = floorPlan.naturalHeight * floorPlan.scale;

  return (
    <g style={{ cursor: floorPlan.locked ? 'default' : 'grab' }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <image
        href={floorPlan.src}
        x={floorPlan.x}
        y={floorPlan.y}
        width={w}
        height={h}
        opacity={floorPlan.opacity}
        transform={`rotate(${floorPlan.rotation} ${floorPlan.x + w / 2} ${floorPlan.y + h / 2})`}
        style={{ pointerEvents: floorPlan.locked ? 'none' : 'all' }}
        onPointerDown={(e) => onPointerDown(e, 'move')}
      />
      {!floorPlan.locked && (
        <g transform={`rotate(${floorPlan.rotation} ${floorPlan.x + w / 2} ${floorPlan.y + h / 2})`}>
          <rect x={floorPlan.x} y={floorPlan.y} width={w} height={h} fill="none" stroke="rgba(0,0,0,0.25)" strokeDasharray={6} />
          {[
            { x: floorPlan.x, y: floorPlan.y, id: 'top-left' },
            { x: floorPlan.x + w, y: floorPlan.y, id: 'top-right' },
            { x: floorPlan.x, y: floorPlan.y + h, id: 'bottom-left' },
            { x: floorPlan.x + w, y: floorPlan.y + h, id: 'bottom-right' },
          ].map((p) => (
            <rect key={p.id} x={p.x - 6} y={p.y - 6} width={12} height={12} fill="white" stroke="black" onPointerDown={(e) => onPointerDown(e, 'scale', p.id)} style={{ cursor: 'nwse-resize' }} />
          ))}
          <circle cx={floorPlan.x + w / 2} cy={floorPlan.y - 24} r={6} fill="white" stroke="black" onPointerDown={(e) => onPointerDown(e, 'rotate')} style={{ cursor: 'grab' }} />
          <line x1={floorPlan.x + w / 2} y1={floorPlan.y} x2={floorPlan.x + w / 2} y2={floorPlan.y - 24} stroke="black" strokeDasharray={4} />
        </g>
      )}
    </g>
  );
}

// ---------- Panel (sidebar UI) ----------
export function FloorPlanPanel({ floorPlan, actions, canvas, defaultOpen = true, embedded = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const fileRef = useRef(null);

  const content = (
    <div className="space-y-3">
      <div>
        <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50" onClick={() => fileRef.current?.click()}>
          {floorPlan ? 'Replace image' : 'Import image'}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) actions.loadFromFile(f); e.currentTarget.value = ""; }} />
      </div>
      <div className="rounded-xl border overflow-hidden bg-white">
        {floorPlan ? (
          <div className="flex items-center gap-3 p-2">
            <div className="w-20 h-16 shrink-0 bg-gray-100 border rounded-md overflow-hidden">
              <div className="w-full h-full" style={{ backgroundImage: `url(${floorPlan.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
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
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Opacity
          <input type="range" min={0} max={1} step={0.05} value={floorPlan?.opacity ?? 0.6} onChange={(e) => actions.setOpacity(parseFloat(e.target.value))} />
        </label>
        <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50" onClick={() => actions.toggleLock()} disabled={!floorPlan}>{floorPlan?.locked ? 'Unlock' : 'Lock'}</button>
        <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50" onClick={() => actions.fitToCanvas(canvas)} disabled={!floorPlan}>Fit</button>
        <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50" onClick={() => actions.resetTransform()} disabled={!floorPlan}>Reset</button>
        <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-red-50 border-red-200 text-red-600" onClick={() => actions.remove()} disabled={!floorPlan}>Remove</button>
      </div>
    </div>
  );

  if (embedded) {
    // Render content only; parent controls collapse
    return (
      <div className="mt-3">
        {content}
      </div>
    );
  }

  // Standalone panel with its own header/collapse
  return (
    <div className="rounded-2xl border bg-white/70 backdrop-blur p-3 w-full max-w-sm shadow-sm">
      <button className="w-full flex items-center justify-between text-left font-medium" onClick={() => setOpen(v => !v)}>
        <span className="text-sm">Floor plan</span>
        <span className="text-xs opacity-70">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3">
          {content}
        </div>
      )}
    </div>
  );
}

// ---------- Helpers ----------
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function snap(n, grid) { return Math.round(n / grid) * grid; }
function normalizeDeg(d) { let x = d % 360; if (x < 0) x += 360; return x; }
function getSvgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY; const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : { x: clientX, y: clientY };
}
function getImageNaturalSize(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1000, height: img.naturalHeight || 800 });
    img.onerror = reject;
    img.src = src;
  });
}
