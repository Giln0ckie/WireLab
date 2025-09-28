import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { FloorPlanPanel, FloorPlanImage, useFloorPlanState } from "./components/FloorPlan";
import bannerImg from './Banner.png';

// Custom CSS for enhanced slider styling
const sliderStyle = `
  .slider {
    -webkit-appearance: none;
    appearance: none;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #3b82f6;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    cursor: pointer;
  }
  .slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #3b82f6;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    cursor: pointer;
    border: none;
  }
  .voltage-pen-active {
    cursor: pointer;
  }
  .voltage-pen-active * {
    cursor: pointer !important;
  }
`;

// Realistic voltage pen cursor - encoded for cross-browser compatibility
const VOLTAGE_PEN_CURSOR = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>
  <g transform='rotate(-30 16 16)'>
    <rect x='14' y='2' width='4' height='20' fill='#fbbf24' rx='2' stroke='#374151' stroke-width='0.5'/>
    <rect x='13' y='22' width='6' height='4' fill='#6b7280' rx='1'/>
    <rect x='12.5' y='26' width='7' height='3' fill='#4b5563' rx='1.5'/>
    <circle cx='16' cy='8' r='1.5' fill='#ef4444'/>
    <text x='16' y='14' font-size='3' text-anchor='middle' fill='#374151' font-family='Arial'>TEST</text>
    <rect x='15.5' y='1' width='1' height='2' fill='#9ca3af'/>
  </g>
</svg>
`)} `;

// Scissors cursor for wire cutting
const SCISSORS_CURSOR = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>
  <g transform='rotate(-15 16 16)'>
    <path d='M8 14 L14 8 L16 10 L10 16 Z' fill='#6b7280' stroke='#374151' stroke-width='0.5'/>
    <path d='M18 10 L24 16 L22 18 L16 12 Z' fill='#6b7280' stroke='#374151' stroke-width='0.5'/>
    <circle cx='16' cy='12' r='2' fill='#9ca3af' stroke='#374151' stroke-width='0.5'/>
    <circle cx='10' cy='20' r='3' fill='none' stroke='#4b5563' stroke-width='1.5'/>
    <circle cx='22' cy='20' r='3' fill='none' stroke='#4b5563' stroke-width='1.5'/>
  </g>
</svg>
`)} `;

// (ComponentTypes defined above)

// Utility functions for wire cutting
const distanceToSegment = (point, segA, segB) => {
  const A = segA, B = segB, P = point;
  const AB = { x: B.x - A.x, y: B.y - A.y };
  const AP = { x: P.x - A.x, y: P.y - A.y };
  const ab2 = AB.x * AB.x + AB.y * AB.y;
  if (ab2 === 0) return Math.hypot(P.x - A.x, P.y - A.y);
  const t = Math.max(0, Math.min(1, (AP.x * AB.x + AP.y * AB.y) / ab2));
  const projection = { x: A.x + t * AB.x, y: A.y + t * AB.y };
  return Math.hypot(P.x - projection.x, P.y - projection.y);
};

const projectPointOnSegment = (point, segA, segB) => {
  const A = segA, B = segB, P = point;
  const AB = { x: B.x - A.x, y: B.y - A.y };
  const AP = { x: P.x - A.x, y: P.y - A.y };
  const ab2 = AB.x * AB.x + AB.y * AB.y;
  if (ab2 === 0) return { x: A.x, y: A.y, t: 0 };
  const t = Math.max(0, Math.min(1, (AP.x * AB.x + AP.y * AB.y) / ab2));
  return { x: A.x + t * AB.x, y: A.y + t * AB.y, t };
};

// Removed unused pointsEqual helper to satisfy lint

/**
 * UK Wiring Practice Trainer — interactive prototype (with fixes)
 *
 * ✅ Features:
 *    - Harmonised conductor colours (Line, Neutral, Earth)
 *    - Wires palette + recolour existing wires
 *    - Drag‑to‑move components ("fixings") on the canvas
 *    - Passive connectors for **loop‑in at switches**: Line, Neutral, CPC (3‑way blocks)
 *    - Wago‑style lever connectors (221 series look) — 3‑way & 5‑way for L/N/E
 *    - Visual polish — SVG grid, snap‑to‑grid, selection glow, improved icons
 *    - Visibility controls — wires on top/behind, halo/outline, thickness slider, fade boxes
 *
 * ♻️ Changes in this version:
 *    - Fix: component deletion no longer leaves orphaned wires (stale closure)
 *    - Fix: Earth swatch in palette now renders via inline SVG gradient
 *    - A11y: keyboard + pointer affordances on terminals and switch rockers
 * ⚠️ Educational simulation only — NOT a substitute for training or BS 7671 compliance.
 */

// ---------- Types ----------
const newId = () => Math.random().toString(36).slice(2, 9);

// Constants
const SYSTEM_V = 230;

// Hit testing utility for wires
const hitTestWireAtPoint = (wires, components, point, tolerance) => {
  let bestHit = null;
  let bestDistance = Infinity;
  
  for (const wire of wires) {
    const a = terminalById(components, wire.a);
    const b = terminalById(components, wire.b);
    if (!a || !b) continue;
    
    const pa = componentTerminalAbsPos(a.comp, a.term);
    const pb = componentTerminalAbsPos(b.comp, b.term);
    
    // For now, treat curved wires as straight lines for hit testing
    // TODO: Could improve this to test against the actual curve
    const distance = distanceToSegment(point, pa, pb);
    
    if (distance <= tolerance && distance < bestDistance) {
      bestDistance = distance;
      bestHit = { wireId: wire.id, distance, hitPoint: projectPointOnSegment(point, pa, pb) };
    }
  }
  
  return bestHit;
};

/** Terminal definitions are kept simple. */
const TerminalTypes = {
  L: "L", // Line (aka Live)
  N: "N", // Neutral
  E: "E", // Earth / CPC
  COM: "COM", // Common (2‑way switch)
  L1: "L1",
  L2: "L2",
  LIN: "LIN",   // Line IN
  LOUT: "LOUT", // Line OUT
  NIN: "NIN",   // Neutral IN
  NOUT: "NOUT", // Neutral OUT
  EIN: "EIN",   // Earth IN
  EOUT: "EOUT", // Earth OUT
};

/** Basic palette of components */
const ComponentTypes = {
  SUPPLY: "SUPPLY",
  LAMP: "LAMP",
  SWITCH_1WAY: "SWITCH_1WAY",
  SWITCH_2WAY: "SWITCH_2WAY",
  SWITCH_INTERMEDIATE: "SWITCH_INTERMEDIATE",
  CONNECTOR_N3: "CONNECTOR_N3", // 3‑port neutral loop block (all linked)
  CONNECTOR_E3: "CONNECTOR_E3", // 3‑port earth loop block (all linked)
  CONNECTOR_L3: "CONNECTOR_L3", // 3‑port line loop block (all linked)
  // Wago‑style variants (visual only, same electrical behaviour)
  WAGO_L3: "WAGO_L3",
  WAGO_N3: "WAGO_N3",
  WAGO_E3: "WAGO_E3",
  WAGO_L5: "WAGO_L5",
  // Socket and FCU types
  SOCKET_1G: "SOCKET_1G",      // 1-gang socket
  SOCKET_2G: "SOCKET_2G",      // 2-gang socket
  SOCKET_2G_SWITCHED: "SOCKET_2G_SWITCHED",
  SOCKET_RCD_1G: "SOCKET_RCD_1G", // 1-gang RCD socket (test/reset, trips L+N)
  FCU_UNSWITCHED: "FCU_UNSWITCHED", 
  FCU_SWITCHED: "FCU_SWITCHED",
  WAGO_N5: "WAGO_N5",
  WAGO_E5: "WAGO_E5",
  // NEW
  CONSUMER_UNIT: "CONSUMER_UNIT",
  JUNCTION: "JUNCTION", // Wire junction point created by scissors tool
  CONSUMER_UNIT_SPLIT: "CONSUMER_UNIT_SPLIT",
  CEILING_ROSE: "CEILING_ROSE",
  // New accessory
  CCU_45A: "CCU_45A",
  // Outdoor / garden range
  OUTDOOR_SOCKET_RCD: "OUTDOOR_SOCKET_RCD",
  OUTDOOR_JUNCTION_IP66: "OUTDOOR_JUNCTION_IP66",
  GARDEN_LIGHT: "GARDEN_LIGHT",
  // EV charge points
  EVSE_1P_7kW: "EVSE_1P_7kW",        // typical 32 A single-phase charger
  EVSE_3P_11_22kW: "EVSE_3P_11_22kW", // optional: three-phase variant
};

/** Conductor kinds + render styles */
const ConductorKinds = {
  GEN: "GEN", // generic/unknown
  L: "L",
  N: "N",
  E: "E",
};

const ConductorStyle = {
  [ConductorKinds.GEN]: { label: "Generic", stroke: "#111827", dash: "" },
  [ConductorKinds.L]: { label: "Line (brown)", stroke: "#92400e", dash: "" },
  [ConductorKinds.N]: { label: "Neutral (blue)", stroke: "#1e3a8a", dash: "" },
  // Earth shown with a green‑yellow gradient stroke defined in <defs>
  [ConductorKinds.E]: { label: "Earth/CPC (green‑yellow)", stroke: "url(#earthStripes)", dash: "4 2" },
};

// --- Wire sizes, ampacity and resistance per metre (simplified educational values) ---
const WIRE_SIZES = [1.0, 1.5, 2.5, 6.0, 10.0, 16.0, 25.0];
const AMPACITY_BY_SIZE = {
  1.0: 11,    // A, typical lighting/control
  1.5: 16,    // A, lighting/control
  2.5: 20,    // A, ring finals/spurs
  6.0: 40,    // A, cookers/showers/submains (short runs)
  10.0: 64,   // A, simplified
  16.0: 85,   // A, simplified
  25.0: 114,  // A, simplified (typical 100A service tails)
};
// Approximate DC resistance of copper conductor per metre (Ω/m) at ~20°C
// Values chosen for educational realism, not for design
const R_PER_M_BY_SIZE = {
  1.0: 0.0180,
  1.5: 0.0121,
  2.5: 0.00741,
  6.0: 0.00310,
  10.0: 0.00183,
  16.0: 0.00115,
  25.0: 0.00069,
};
const THICKNESS_FACTOR_BY_SIZE = {
  1.0: 0.9,
  1.5: 0.95,
  2.5: 1.0,
  6.0: 1.18,
  10.0: 1.6,
  16.0: 1.8,
  25.0: 2.1,
};
const formatSize = (s) => (s ? `${s} mm²` : "—");
const getAmpacity = (s) => AMPACITY_BY_SIZE[s] ?? null;
const getRPerM = (s) => R_PER_M_BY_SIZE[s] ?? null;
const sizeFactor = (s) => THICKNESS_FACTOR_BY_SIZE[s] ?? 1.0;

// CPC size in T&E for common sizes (simplified)
const cpcSizeForBundle = (lineSize) => ({
  1.0: 1.0,
  1.5: 1.0,
  2.5: 1.5,
  6.0: 2.5,
}[lineSize] ?? lineSize);

// UI accent rings for palette selection
const conductorRing = {
  GEN: "ring-slate-300",
  L:   "ring-amber-500/70",
  N:   "ring-blue-600/70",
  E:   "ring-emerald-600/70",
};

// --- Cable bundle presets (auto-colour/group) ---
const CablePresets = {
  "T&E 2C+E": {
    name: "T&E 2C+E (L,N,E)",
    // size of each core applied at runtime from bundleSize state (E uses reduced CPC by default)
    cores: [{kind:ConductorKinds.L},{kind:ConductorKinds.N},{kind:ConductorKinds.E}],
    family: "T&E"
  },
  "Tails + Earth": {
    name: "Meter tails (L,N 25 mm²) + Main earth (16 mm²)",
    // Use fixed sizes typical for UK domestic installations (100A service)
    cores: [
      { kind: ConductorKinds.L, fixedSizeMm2: 25.0 },
      { kind: ConductorKinds.N, fixedSizeMm2: 25.0 },
      { kind: ConductorKinds.E, fixedSizeMm2: 16.0 },
    ],
    family: "Service"
  },
  "Bonding (E)": {
    name: "Main bonding conductor (10–16 mm²)",
    // Earth-only bonding; defaults to 10 mm², can be changed via size selector if desired
    cores: [ { kind: ConductorKinds.E, fixedSizeMm2: 10.0 } ],
    family: "Bonding"
  },
  "3C+E": {
    name: "3C+E (brown/black/grey + E)", 
    cores: [{kind:ConductorKinds.L},{kind:ConductorKinds.L},{kind:ConductorKinds.L},{kind:ConductorKinds.E}],
    family: "PVC singles"
  },
  "SWA 2C+E": {
    name: "SWA 2C+E (submain)",
    cores: [{kind:ConductorKinds.L},{kind:ConductorKinds.N},{kind:ConductorKinds.E}],
    family: "SWA"
  },
  "Garden sub-circuit (SWA)": {
    name: "Garden sub-circuit (SWA 2C+E)",
    cores: [{kind:ConductorKinds.L},{kind:ConductorKinds.N},{kind:ConductorKinds.E}],
    family: "SWA",
    hint: "Suitable for outdoor runs; consider RCD protection and IP-rated terminations",
  },
  "3C+E Strappers": {
    name: "3C+E strappers (all lives)",
    cores: [{kind:ConductorKinds.L},{kind:ConductorKinds.L},{kind:ConductorKinds.L},{kind:ConductorKinds.E}],
    family: "PVC singles"
  }
};
const bundleHint = (name)=> {
  if (name.includes('strap')) return 'all L (sleeve as needed)';
  if (name.includes('Tails')) return 'L/N fixed 25 mm² + E 16 mm²';
  if (name.includes('Bonding')) return 'Earth only, default 10 mm²';
  return 'auto L/N/E';
};

// Small colour helper for terminal dots
const termDotFill = (t) => {
  if (t === TerminalTypes.L) return "#92400e"; // brown
  if (t === TerminalTypes.N) return "#1e3a8a"; // blue
  if (t === TerminalTypes.E) return "url(#earthStripes)";
  return "#6b7280"; // grey for signal/common
};

// Component stroke colour accents by type
const compStroke = (type) => {
  if (type === ComponentTypes.SUPPLY) return "#1e3a8a"; // blue
  if (type === ComponentTypes.LAMP) return "#b45309"; // amber
  if (String(type).includes("CONNECTOR_L") || String(type).includes("WAGO_L")) return "#92400e";
  if (String(type).includes("CONNECTOR_N") || String(type).includes("WAGO_N")) return "#1e3a8a";
  if (String(type).includes("CONNECTOR_E") || String(type).includes("WAGO_E")) return "#15803d";
  return "#0f172a"; // slate-900
};

// Terminal dot with optional probe highlight
function Terminal({terminal: t, onClick, probeA, probeB}) {
  const isProbe = t.id === probeA || t.id === probeB;
  return (
    <g
      role="button"
      tabIndex={0}
      onKeyDown={(e)=>{ if(isActivateKey(e)) onClick(t.id); }}
      onClick={()=>onClick(t.id)}
      aria-label={`${t.name} terminal`}
      style={{cursor:'pointer'}}>
      {isProbe && (
        <circle cx={t.dx} cy={t.dy} r={9} fill="none" stroke="#111827" strokeOpacity="0.35" />
      )}
      <circle cx={t.dx} cy={t.dy} r={6} fill={termDotFill(t.t)} stroke="#111827" />
      <text x={t.dx+10} y={t.dy+4} fontSize={11} fill="#374151">{t.name}</text>
    </g>
  );
};

// ---------- Component library (symbols & terminals) ----------
function makeSupply(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.SUPPLY,
    label: "Supply (230V)",
    x,
    y,
    terminals: [
      { id: newId(), name: "L", t: TerminalTypes.L, dx: 10, dy: 10 },
      { id: newId(), name: "N", t: TerminalTypes.N, dx: 10, dy: 40 },
      { id: newId(), name: "E", t: TerminalTypes.E, dx: 10, dy: 70 },
    ],
    internalLinks: [],
  };
}

function makeLamp(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.LAMP,
    label: "Lamp (luminaire)",
    x,
    y,
    terminals: [
      { id: newId(), name: "L", t: TerminalTypes.L, dx: 10, dy: 10 },
      { id: newId(), name: "N", t: TerminalTypes.N, dx: 10, dy: 40 },
      { id: newId(), name: "E", t: TerminalTypes.E, dx: 10, dy: 70 },
    ],
    internalLinks: [],
  };
}

// Removed legacy generic makeSocket (unused)

function makeSwitch1Way(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.SWITCH_1WAY,
    label: "1‑gang switch (1‑way)",
    x,
    y,
    state: { on: false },
    terminals: [
      { id: newId(), name: "COM", t: TerminalTypes.COM, dx: 10, dy: 15 },
      { id: newId(), name: "L1", t: TerminalTypes.L1, dx: 10, dy: 55 },
      { id: newId(), name: "E", t: TerminalTypes.E, dx: 80, dy: 35 },
    ],
    internalLinks: (self) => (self.state.on ? [["COM", "L1"]] : []),
  };
}

function makeSwitch2Way(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.SWITCH_2WAY,
    label: "1‑gang switch (2‑way)",
    x,
    y,
    state: { pos: 0 },
    terminals: [
      { id: newId(), name: "COM", t: TerminalTypes.COM, dx: 10, dy: 10 },
      { id: newId(), name: "L1", t: TerminalTypes.L1, dx: 10, dy: 40 },
      { id: newId(), name: "L2", t: TerminalTypes.L2, dx: 10, dy: 70 },
      { id: newId(), name: "E", t: TerminalTypes.E, dx: 80, dy: 40 },
    ],
    internalLinks: (self) => (self.state.pos === 0 ? [["COM", "L1"]] : [["COM", "L2"]]),
  };
}

function makeSwitchIntermediate(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.SWITCH_INTERMEDIATE,
    label: "Intermediate switch",
    x,
    y,
    state: { pos: 0 },
    terminals: [
      { id: newId(), name: "L1A", t: TerminalTypes.L1, dx: 10, dy: 12 },
      { id: newId(), name: "L1B", t: TerminalTypes.L1, dx: 10, dy: 36 },
      { id: newId(), name: "L2A", t: TerminalTypes.L2, dx: 10, dy: 60 },
      { id: newId(), name: "L2B", t: TerminalTypes.L2, dx: 10, dy: 84 },
      { id: newId(), name: "E", t: TerminalTypes.E, dx: 90, dy: 48 },
    ],
    internalLinks: (self) =>
      self.state.pos === 0
        ? [["L1A", "L1B"], ["L2A", "L2B"]]
        : [["L1A", "L2B"], ["L2A", "L1B"]],
  };
}

function makeCeilingRose(x, y) {
  // Terminals: L loop (L1..L3 common), Neutral bar (N1..N2 common), Earth bar (E1..E2 common),
  // Lamp N (connected to N bar), Switched Live (SWL) separate.
  const tL1 = { id:newId(), name:"L1", t:TerminalTypes.L, dx:10, dy:18 };
  const tL2 = { id:newId(), name:"L2", t:TerminalTypes.L, dx:10, dy:38 };
  const tL3 = { id:newId(), name:"L3", t:TerminalTypes.L, dx:10, dy:58 };
  const tN1 = { id:newId(), name:"N1", t:TerminalTypes.N, dx:70, dy:18 };
  const tN2 = { id:newId(), name:"N2", t:TerminalTypes.N, dx:70, dy:38 };
  const tE1 = { id:newId(), name:"E1", t:TerminalTypes.E, dx:120, dy:18 };
  const tE2 = { id:newId(), name:"E2", t:TerminalTypes.E, dx:120, dy:38 };
  const tLampN = { id:newId(), name:"LAMP_N", t:TerminalTypes.N, dx:70, dy:68 };
  const tSWL   = { id:newId(), name:"SWL", t:TerminalTypes.L, dx:10, dy:78 }; // connects to lamp L externally

  return {
    id:newId(),
    type:ComponentTypes.CEILING_ROSE,
  label:"Ceiling rose",
    x,y,
    terminals:[tL1,tL2,tL3,tN1,tN2,tE1,tE2,tLampN,tSWL],
    internalLinks:[
      ["L1","L2"],["L1","L3"],  // looped permanent lives
      ["N1","N2"],              // neutral bar
      ["N1","LAMP_N"],          // lamp neutral joins N bar
      ["E1","E2"]               // earths
    ],
  };
}

// ---------- Cooker Control Unit (45A DP isolator + neon) ----------
function makeCookerControlUnit(x, y) {
  const tLIN  = { id:newId(), name:"LIN",  t:TerminalTypes.LIN,  dx:10,  dy:24 };
  const tNIN  = { id:newId(), name:"NIN",  t:TerminalTypes.NIN,  dx:10,  dy:48 };
  const tEIN  = { id:newId(), name:"EIN",  t:TerminalTypes.EIN,  dx:10,  dy:72 };
  const tLOUT = { id:newId(), name:"LOUT", t:TerminalTypes.LOUT, dx:140, dy:24 };
  const tNOUT = { id:newId(), name:"NOUT", t:TerminalTypes.NOUT, dx:140, dy:48 };
  const tEOUT = { id:newId(), name:"EOUT", t:TerminalTypes.EOUT, dx:140, dy:72 };
  return {
    id:newId(),
    type:ComponentTypes.CCU_45A,
  label:"Cooker Control Unit (45A DP)",
    x,y,
    state:{ on:true },
    terminals:[tLIN,tNIN,tEIN,tLOUT,tNOUT,tEOUT],
    internalLinks:(self)=>[
      ...(self.state.on ? [["LIN","LOUT"],["NIN","NOUT"]] : []),
      ["EIN","EOUT"]
    ],
  };
}

// 3‑way neutral connector (all ports common)
function makeConnectorN3(x, y) {
  const t1 = { id: newId(), name: "N1", t: TerminalTypes.N, dx: 10, dy: 18 };
  const t2 = { id: newId(), name: "N2", t: TerminalTypes.N, dx: 10, dy: 48 };
  const t3 = { id: newId(), name: "N3", t: TerminalTypes.N, dx: 10, dy: 78 };
  return {
    id: newId(),
    type: ComponentTypes.CONNECTOR_N3,
  label: "Neutral connector block (3‑way)",
    x,
    y,
    terminals: [t1, t2, t3],
    internalLinks: [["N1", "N2"], ["N1", "N3"]],
  };
}

// 3‑way earth connector (all ports common)
function makeConnectorE3(x, y) {
  const t1 = { id: newId(), name: "E1", t: TerminalTypes.E, dx: 10, dy: 18 };
  const t2 = { id: newId(), name: "E2", t: TerminalTypes.E, dx: 10, dy: 48 };
  const t3 = { id: newId(), name: "E3", t: TerminalTypes.E, dx: 10, dy: 78 };
  return {
    id: newId(),
    type: ComponentTypes.CONNECTOR_E3,
  label: "Earth (CPC) connector block (3‑way)",
    x,
    y,
    terminals: [t1, t2, t3],
    internalLinks: [["E1", "E2"], ["E1", "E3"]],
  };
}

// 3‑way line connector (all ports common) — for permanent live loop‑in
function makeConnectorL3(x, y) {
  const t1 = { id: newId(), name: "L1", t: TerminalTypes.L, dx: 10, dy: 18 };
  const t2 = { id: newId(), name: "L2", t: TerminalTypes.L, dx: 10, dy: 48 };
  const t3 = { id: newId(), name: "L3", t: TerminalTypes.L, dx: 10, dy: 78 };
  return {
    id: newId(),
    type: ComponentTypes.CONNECTOR_L3,
  label: "Line connector block (3‑way)",
    x,
    y,
    terminals: [t1, t2, t3],
    internalLinks: [["L1", "L2"], ["L1", "L3"]],
  };
}
// ---- EVSE: 7.2 kW single-phase (32 A), with built-in 6 mA DC detection flag ----
function makeEVSE1P(x, y, opts = {}) {
  const tL = { id:newId(), name:"L", t:TerminalTypes.L, dx:10,  dy:20 };
  const tN = { id:newId(), name:"N", t:TerminalTypes.N, dx:10,  dy:48 };
  const tE = { id:newId(), name:"E", t:TerminalTypes.E, dx:10,  dy:76 };
  return {
    id: newId(),
    type: ComponentTypes.EVSE_1P_7kW,
    label: "EV charger (1×32 A, ~7.2 kW)",
    x, y,
    state: {
      // Editable per-instance flags (used by Regulations panel)
      has6mA: opts.has6mA ?? true,      // EVSE integrates 6 mA DC detection (RDC-DD)
      earthing: opts.earthing ?? 'PME',  // 'PME' (TN-C-S) or 'TT'
    },
    meta: {
      environment: "outdoor",     // most wallboxes are outdoors
      ipRating: "IP65",           // typical enclosure rating (adjust if needed)
      requiresRCD: true,
      has6mA_DC_Detection: true,  // many chargers integrate RDC-DD per IEC 62955
      needsDedicatedCircuit: true,
      needsPENProtection: true,   // PME/Open-PEN mitigation per BS 7671 Sec. 722
      smartChargeRequired: true   // GB smart charge regs (if “sold” scope applies)
    },
    terminals: [tL, tN, tE],
    internalLinks: [], // handled by external protective devices/RCBO etc.
  };
}

// (Optional) three-phase EVSE shell — same meta, 3×L + N + E terminals
function makeEVSE3P(x, y, opts = {}) {
  const TL = i => ({ id:newId(), name:`L${i}`, t:TerminalTypes.L, dx:10, dy:10 + i*16 });
  const tN = { id:newId(), name:"N", t:TerminalTypes.N, dx:10, dy:70 };
  const tE = { id:newId(), name:"E", t:TerminalTypes.E, dx:10, dy:98 };
  return {
    id: newId(),
    type: ComponentTypes.EVSE_3P_11_22kW,
    label: "EV charger (3-phase 11/22 kW)",
    x, y,
    state: {
      has6mA: opts.has6mA ?? true,
      earthing: opts.earthing ?? 'PME',
    },
    meta: {
      environment: "outdoor",
      ipRating: "IP65",
      requiresRCD: true,
      has6mA_DC_Detection: true,
      needsDedicatedCircuit: true,
      needsPENProtection: true,
      smartChargeRequired: true
    },
    terminals: [TL(1), TL(2), TL(3), tN, tE],
    internalLinks: [],
  };
}

// ---- Wago‑style connectors (visuals with orange levers) ----
function makeWago3(kind, x, y) {
  // kind: 'L' | 'N' | 'E'
  const name = kind === 'L' ? 'Line' : kind === 'N' ? 'Neutral' : 'Earth';
  const tname = (i) => `${kind}${i}`;
  const tt = kind === 'L' ? TerminalTypes.L : kind === 'N' ? TerminalTypes.N : TerminalTypes.E;
  const t1 = { id: newId(), name: tname(1), t: tt, dx: 10, dy: 18 };
  const t2 = { id: newId(), name: tname(2), t: tt, dx: 10, dy: 48 };
  const t3 = { id: newId(), name: tname(3), t: tt, dx: 10, dy: 78 };
  return {
    id: newId(),
    type: kind === 'L' ? ComponentTypes.WAGO_L3 : kind === 'N' ? ComponentTypes.WAGO_N3 : ComponentTypes.WAGO_E3,
  label: `Wago 221 — ${name} (3‑way)`,
    x,
    y,
    terminals: [t1, t2, t3],
    internalLinks: [[t1.name, t2.name], [t1.name, t3.name]],
  };
}

function makeWago5(kind, x, y) {
  const name = kind === 'L' ? 'Line' : kind === 'N' ? 'Neutral' : 'Earth';
  const tname = (i) => `${kind}${i}`;
  const tt = kind === 'L' ? TerminalTypes.L : kind === 'N' ? TerminalTypes.N : TerminalTypes.E;
  const ts = [1, 2, 3, 4, 5].map((i) => ({ id: newId(), name: tname(i), t: tt, dx: 10, dy: 10 + 18 * i }));
  return {
    id: newId(),
    type: kind === 'L' ? ComponentTypes.WAGO_L5 : kind === 'N' ? ComponentTypes.WAGO_N5 : ComponentTypes.WAGO_E5,
  label: `Wago 221 — ${name} (5‑way)`,
    x,
    y,
    terminals: ts,
    internalLinks: ts.slice(1).map((t) => [ts[0].name, t.name]),
  };
}

// ---- Outdoor 13A socket with integral RCD (typical IP66 enclosure) ----
function makeOutdoorSocketRCD(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.OUTDOOR_SOCKET_RCD,
    label: "Outdoor socket (RCD, IP66)",
    x, y,
    meta: { environment: "outdoor", ipRating: "IP66", requiresRCD: true, rcdIntegral: true },
    terminals: [
      { id: newId(), name: "LIN",  t: TerminalTypes.LIN,  dx: 10, dy: 22 },
      { id: newId(), name: "LOUT", t: TerminalTypes.LOUT, dx: 70, dy: 22 },
      { id: newId(), name: "NIN",  t: TerminalTypes.NIN,  dx: 10, dy: 62 },
      { id: newId(), name: "NOUT", t: TerminalTypes.NOUT, dx: 70, dy: 62 },
      { id: newId(), name: "EIN",  t: TerminalTypes.EIN,  dx: 10, dy: 102 },
      { id: newId(), name: "EOUT", t: TerminalTypes.EOUT, dx: 70, dy: 102 },
    ],
    internalLinks: [
      // Integral RCD simplified: links present (model detailed RCD later if needed)
      ["LIN","LOUT"],["NIN","NOUT"],["EIN","EOUT"]
    ],
  };
}
    

// ---- Outdoor junction box (IP66) for SWA joints etc. ----
function makeOutdoorJunctionBox(x, y) {
  const tL =  { id:newId(), name:"L1", t:TerminalTypes.L, dx:10,  dy:20 };
  const tL2 = { id:newId(), name:"L2", t:TerminalTypes.L, dx:10,  dy:50 };
  const tN =  { id:newId(), name:"N1", t:TerminalTypes.N, dx:70,  dy:20 };
  const tN2 = { id:newId(), name:"N2", t:TerminalTypes.N, dx:70,  dy:50 };
  const tE =  { id:newId(), name:"E1", t:TerminalTypes.E, dx:120, dy:20 };
  const tE2 = { id:newId(), name:"E2", t:TerminalTypes.E, dx:120, dy:50 };
  return {
    id: newId(),
    type: ComponentTypes.OUTDOOR_JUNCTION_IP66,
    label: "Outdoor JB (IP66)",
    x, y,
    meta: { environment: "outdoor", ipRating: "IP66" },
    terminals: [tL,tL2,tN,tN2,tE,tE2],
    internalLinks: [["L1","L2"],["N1","N2"],["E1","E2"]],
  };
}

// ---- Garden light (class I luminaire) ----
function makeGardenLight(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.GARDEN_LIGHT,
    label: "Garden light",
    x, y,
    meta: { environment: "outdoor", class: "I", requiresRCD: true },
    terminals: [
      { id: newId(), name: "L", t: TerminalTypes.L, dx: 10, dy: 16 },
      { id: newId(), name: "N", t: TerminalTypes.N, dx: 10, dy: 46 },
      { id: newId(), name: "E", t: TerminalTypes.E, dx: 10, dy: 76 },
    ],
    internalLinks: [],
  };
}

// === Consumer Unit (all-MCB) — tidy layout ===
function makeConsumerUnit(x, y, opts = {}) {
  // --- layout constants (keep in sync with renderer) ---
  const BOX_W = 220, BOX_H = 260;
  const WAY_Y0 = 56;          // first breaker row Y
  const WAY_SP = 14;          // per-row spacing
  const LOUT_X = 190;         // line-out pins at right edge
  const N_BAR_Y = 210;        // neutral bar Y
  const E_BAR_Y = 235;        // earth bar Y
  const BAR_DX = 14;          // horizontal spacing along bars

  const ways = Math.max(2, Math.min(20, opts.ways ?? 10));
  const defaultRatings = ["6A","6A","32A","32A","20A","16A","40A","6A","32A","20A"];
  const ratings = Array.from({length: ways}, (_, i) => defaultRatings[i] ?? "20A");

  const terms = [];
  // supply tails (left column)
  const tL = { id:newId(), name:"L", t:TerminalTypes.L, dx:12, dy:28 };
  const tN = { id:newId(), name:"N", t:TerminalTypes.N, dx:12, dy:52 };
  const tE = { id:newId(), name:"E", t:TerminalTypes.E, dx:12, dy:76 };
  terms.push(tL, tN, tE);

  // per-way L OUTs (right edge)
  const lineOuts = [];
  for (let i=0;i<ways;i++){
    const dy = WAY_Y0 + i*WAY_SP;
    const t = { id:newId(), name:`LOUT${i+1}`, t:TerminalTypes.LOUT, dx:LOUT_X, dy };
    lineOuts.push(t); terms.push(t);
  }

  // neutral/earth bars (bottom)
  const nBar=[], eBar=[];
  for (let i=0;i<ways;i++){
    const dx = 24 + i*BAR_DX;
    const tn = { id:newId(), name:`N${i+1}`, t:TerminalTypes.N, dx, dy:N_BAR_Y };
    const te = { id:newId(), name:`E${i+1}`, t:TerminalTypes.E, dx, dy:E_BAR_Y };
    nBar.push(tn); eBar.push(te); terms.push(tn, te);
  }

  const wayState = ratings.map(r => ({ closed:true, rating:r, isExisting: true }));

  // internals: common bars + feed each LOUT when the MCB is closed
  const internalLinks = (self)=>{
    const links=[];
    for (let i=1;i<nBar.length;i++) links.push([nBar[0].name, nBar[i].name]);
    for (let i=1;i<eBar.length;i++) links.push([eBar[0].name, eBar[i].name]);
    // simple CU: N/E bars tied directly to supply tails
    if (nBar[0]) links.push([tN.name, nBar[0].name]);
    if (eBar[0]) links.push([tE.name, eBar[0].name]);
    self.state.ways.forEach((w,i)=>{ if (w.closed) links.push([tL.name, lineOuts[i].name]); });
    return links;
  };

  return {
    id:newId(),
    type:ComponentTypes.CONSUMER_UNIT,
    label:`Consumer Unit (${ways}-way)`,
    x, y,
    terminals:terms,
    state:{ ways:wayState, _layout:{BOX_W,BOX_H,WAY_Y0,WAY_SP,LOUT_X,N_BAR_Y,E_BAR_Y} }, // (renderer convenience)
    internalLinks
  };
}

// === NEW: Split‑load CU (RCD A/B, per‑way RCBO + labels) ===============
function makeConsumerUnitSplit(x, y, opts = {}) {
  const ways = Math.max(4, Math.min(20, opts.ways ?? 10));
  const half = Math.floor(ways / 2);
  const defaultRatings = ["6A","6A","10A","32A","32A","6A","16A","20A","32A","40A"];
  const ratings = Array.from({length: ways}, (_, i) => opts.ratings?.[i] ?? defaultRatings[i] ?? "20A");
  const rcboFlags = Array.from({ length: ways }, (_, i) => !!(opts.rcbo?.[i]));
  const labels    = Array.from({length: ways}, (_, i) => opts.labels?.[i] ?? `Way ${i+1}`);
  const terms = [];
  const tL = { id: newId(), name: "L", t: TerminalTypes.L, dx: 15, dy: 33 };
  const tN = { id: newId(), name: "N", t: TerminalTypes.N, dx: 15, dy: 69 };
  const tE = { id: newId(), name: "E", t: TerminalTypes.E, dx: 15, dy: 105 };
  terms.push(tL, tN, tE);
  const lineOuts = []; const nOuts = [];
  for (let i = 0; i < ways; i++) {
    const dy = 33 + i * 24;
    const l = { id: newId(), name: `LOUT${i+1}`, t: TerminalTypes.LOUT, dx: 300, dy };
    const n = { id: newId(), name: `NOUT${i+1}`, t: TerminalTypes.N, dx: 276, dy };
    lineOuts.push(l); nOuts.push(n); terms.push(l, n);
  }
  const nBarA = [], nBarB = [], eBar = [];
  for (let i = 0; i < half; i++) {
    const dx = 39 + i * 18;
    nBarA.push({ id: newId(), name: `N_A${i+1}`, t: TerminalTypes.N, dx, dy: 255 });
  }
  for (let i = 0; i < ways - half; i++) {
    const dx = 39 + i * 18;
    nBarB.push({ id: newId(), name: `N_B${i+1}`, t: TerminalTypes.N, dx, dy: 279 });
  }
  for (let i = 0; i < ways; i++) {
    const dx = 39 + i * 18;
    eBar.push({ id: newId(), name: `E${i+1}`, t: TerminalTypes.E, dx, dy: 303 });
  }
  terms.push(...nBarA, ...nBarB, ...eBar);
  const wayState = ratings.map((r, i) => ({ closed: true, rating: r, rcbo: rcboFlags[i], label: labels[i], isExisting: true }));
  const state = { mainOn: true, rcdAOn: true, rcdBOn: true, ways: wayState };
  const internalLinks = (self) => {
    const links = [];
    const Lname = tL.name, Nname = tN.name;
    for (let i = 1; i < nBarA.length; i++) links.push([nBarA[0].name, nBarA[i].name]);
    for (let i = 1; i < nBarB.length; i++) links.push([nBarB[0].name, nBarB[i].name]);
    for (let i = 1; i < eBar.length;  i++) links.push([eBar[0].name,  eBar[i].name]);
    links.push([tE.name, eBar[0]?.name]);
    if (self.state.mainOn && self.state.rcdAOn && nBarA[0]) links.push([Nname, nBarA[0].name]);
    if (self.state.mainOn && self.state.rcdBOn && nBarB[0]) links.push([Nname, nBarB[0].name]);
    self.state.ways.forEach((w, i) => {
      const bankOk = (i < half) ? self.state.rcdAOn : self.state.rcdBOn;
      if (self.state.mainOn && bankOk && w.closed) links.push([Lname, lineOuts[i].name]);
    });
    self.state.ways.forEach((w, i) => {
      const bar0 = (i < half) ? nBarA[0] : nBarB[0];
      const bankOk = (i < half) ? self.state.rcdAOn : self.state.rcdBOn;
      if (!bar0) return;
      if (w.rcbo) {
        if (self.state.mainOn && bankOk && w.closed) links.push([bar0.name, nOuts[i].name]);
      } else {
        if (self.state.mainOn && bankOk) links.push([bar0.name, nOuts[i].name]);
      }
    });
    return links;
  };
  return { id: newId(), type: ComponentTypes.CONSUMER_UNIT_SPLIT, label: `Consumer Unit (Split‑load ${ways}-way)`, x, y, terminals: terms, state, internalLinks };
}

function makeSocket1G(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.SOCKET_1G,
  label: "1‑gang socket",
    x, y,
    terminals: [
      { id: newId(), name: "LIN",  t: TerminalTypes.LIN,  dx: 10, dy: 22 },
      { id: newId(), name: "LOUT", t: TerminalTypes.LOUT, dx: 70, dy: 22 },
      { id: newId(), name: "NIN",  t: TerminalTypes.NIN,  dx: 10, dy: 62 },
      { id: newId(), name: "NOUT", t: TerminalTypes.NOUT, dx: 70, dy: 62 },
      { id: newId(), name: "EIN",  t: TerminalTypes.EIN,  dx: 10, dy: 102 },
      { id: newId(), name: "EOUT", t: TerminalTypes.EOUT, dx: 70, dy: 102 },
    ],
    internalLinks: [
      ["LIN", "LOUT"],
      ["NIN", "NOUT"],
      ["EIN", "EOUT"]
    ],
  };
}

function makeSocket2G(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.SOCKET_2G,
  label: "2‑gang socket",
    x, y,
    terminals: [
      { id: newId(), name: "LIN",  t: TerminalTypes.LIN,  dx: 10, dy: 18 },
      { id: newId(), name: "LOUT", t: TerminalTypes.LOUT, dx: 70, dy: 18 },
      { id: newId(), name: "NIN",  t: TerminalTypes.NIN,  dx: 10, dy: 58 },
      { id: newId(), name: "NOUT", t: TerminalTypes.NOUT, dx: 70, dy: 58 },
      { id: newId(), name: "EIN",  t: TerminalTypes.EIN,  dx: 10, dy: 98 },
      { id: newId(), name: "EOUT", t: TerminalTypes.EOUT, dx: 70, dy: 98 },
    ],
    internalLinks: [
      ["LIN", "LOUT"],
      ["NIN", "NOUT"],
      ["EIN", "EOUT"]
    ],
  };
}

function makeSocket2GSwitched(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.SOCKET_2G_SWITCHED,
  label: "2‑gang socket (switched)",
    x, y,
    terminals: [
      { id: newId(), name: "LIN",  t: TerminalTypes.LIN,  dx: 10, dy: 18 },
      { id: newId(), name: "LOUT", t: TerminalTypes.LOUT, dx: 70, dy: 18 },
      { id: newId(), name: "NIN",  t: TerminalTypes.NIN,  dx: 10, dy: 58 },
      { id: newId(), name: "NOUT", t: TerminalTypes.NOUT, dx: 70, dy: 58 },
      { id: newId(), name: "EIN",  t: TerminalTypes.EIN,  dx: 10, dy: 98 },
      { id: newId(), name: "EOUT", t: TerminalTypes.EOUT, dx: 70, dy: 98 },
      // Add switch terminals if needed
      { id: newId(), name: "SW1", t: TerminalTypes.L1, dx: 40, dy: 38 },
      { id: newId(), name: "SW2", t: TerminalTypes.L2, dx: 40, dy: 78 },
    ],
    internalLinks: [
      ["LIN", "LOUT"],
      ["NIN", "NOUT"],
      ["EIN", "EOUT"]
    ],
  };
}

function makeFCUUnswitched(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.FCU_UNSWITCHED,
  label: "Unswitched FCU",
    x, y,
    terminals: [
      { id: newId(), name: "LIN",  t: TerminalTypes.LIN,  dx: 10, dy: 22 },
      { id: newId(), name: "LOUT", t: TerminalTypes.LOUT, dx: 10, dy: 42 },
      { id: newId(), name: "NIN",  t: TerminalTypes.NIN,  dx: 10, dy: 62 },
      { id: newId(), name: "NOUT", t: TerminalTypes.NOUT, dx: 10, dy: 82 },
      { id: newId(), name: "EIN",  t: TerminalTypes.EIN,  dx: 10, dy: 102 },
      { id: newId(), name: "EOUT", t: TerminalTypes.EOUT, dx: 10, dy: 122 },
      // Fused output
      { id: newId(), name: "FUSED", t: TerminalTypes.LOUT, dx: 40, dy: 32 },
    ],
    internalLinks: [
      ["LIN", "LOUT"],
      ["NIN", "NOUT"],
      ["EIN", "EOUT"],
      // Fused output is separate
    ],
  };
}

function makeFCUSwitched(x, y) {
  return {
    id: newId(),
    type: ComponentTypes.FCU_SWITCHED,
  label: "Switched FCU",
    x, y,
    terminals: [
      { id: newId(), name: "LIN",  t: TerminalTypes.LIN,  dx: 10, dy: 22 },
      { id: newId(), name: "LOUT", t: TerminalTypes.LOUT, dx: 10, dy: 42 },
      { id: newId(), name: "NIN",  t: TerminalTypes.NIN,  dx: 10, dy: 62 },
      { id: newId(), name: "NOUT", t: TerminalTypes.NOUT, dx: 10, dy: 82 },
      { id: newId(), name: "EIN",  t: TerminalTypes.EIN,  dx: 10, dy: 102 },
      { id: newId(), name: "EOUT", t: TerminalTypes.EOUT, dx: 10, dy: 122 },
      // Fused output
      { id: newId(), name: "FUSED", t: TerminalTypes.LOUT, dx: 40, dy: 32 },
      // Switch terminal
      { id: newId(), name: "SW", t: TerminalTypes.L1, dx: 40, dy: 52 },
    ],
    internalLinks: [
      ["LIN", "LOUT"],
      ["NIN", "NOUT"],
      ["EIN", "EOUT"],
      // Fused output and switch are separate
    ],
  };
}

// ---------- Helpers ----------
// Conductor "type families" and resistance characteristics
const LineTermTypes = new Set([TerminalTypes.L, TerminalTypes.LIN, TerminalTypes.LOUT, TerminalTypes.COM, TerminalTypes.L1, TerminalTypes.L2]);
const NeutralTermTypes = new Set([TerminalTypes.N, TerminalTypes.NIN, TerminalTypes.NOUT]);
const EarthTermTypes = new Set([TerminalTypes.E, TerminalTypes.EIN, TerminalTypes.EOUT]);

// Resistance simulation parameters
const PX_PER_M = 100;  // Pixel → metres scale for resistance approximation
const R_PER_M = {      // Simple per-metre resistances (Ω/m)
  L: 0.02,            // Line conductor
  N: 0.02,            // Neutral conductor
  E: 0.03             // Earth conductor (slightly higher)
};
const CONTACT_R = 0.02;  // Contact resistance per joint (Ω)

// Region-aware per-terminal minimum CSA (simplified training rules)
function requiredCSAForTerminal(comp, term, region) {
  const isE = EarthTermTypes.has(term.t);
  const isLN = LineTermTypes.has(term.t) || NeutralTermTypes.has(term.t);
  if (!isE && !isLN) return 0; // non-current terminals

  const UK = region === 'UK';
  // Lighting base (UK often 1.0; EU often 1.5)
  const LIGHT_LN = UK ? 1.0 : 1.5;
  const LIGHT_E  = UK ? 1.0 : 1.5;
  const SOCKET_LN = 2.5, SOCKET_E = 1.5;
  const FCU_LN = 2.5, FCU_E = 1.5;
  const COOKER_LN = 6.0, COOKER_E = 2.5; // simplified CPC
  // UK main tails & main earth (typical DNO 80–100A cut-out): 25 mm² L/N, 16 mm² E
  const TAILS_LN = 25.0, MAIN_EARTH = 16.0;

  switch (comp.type) {
    case ComponentTypes.SOCKET_1G:
    case ComponentTypes.SOCKET_2G:
    case ComponentTypes.SOCKET_2G_SWITCHED:
    case ComponentTypes.SOCKET_RCD_1G:
    case ComponentTypes.OUTDOOR_SOCKET_RCD:
      return isE ? SOCKET_E : SOCKET_LN;
    case ComponentTypes.FCU_UNSWITCHED:
    case ComponentTypes.FCU_SWITCHED:
      return isE ? FCU_E : FCU_LN;
    case ComponentTypes.CCU_45A:
      return isE ? COOKER_E : COOKER_LN;
    case ComponentTypes.EVSE_1P_7kW:
      // 32 A circuit typically wired in 6.0 mm² T&E; CPC often 2.5 mm² in that cable
      return isE ? 2.5 : 6.0;
    case ComponentTypes.EVSE_3P_11_22kW:
      // training-only: suggest 6–10 mm² depending on run/installation; use 10 mm² here
      return isE ? 6.0 : 10.0;
    case ComponentTypes.LAMP:
    case ComponentTypes.CEILING_ROSE:
    case ComponentTypes.GARDEN_LIGHT:
    case ComponentTypes.SWITCH_1WAY:
    case ComponentTypes.SWITCH_2WAY:
    case ComponentTypes.SWITCH_INTERMEDIATE:
      return isE ? LIGHT_E : LIGHT_LN;
    // Distribution and connectors have no constraint at the accessory itself
    case ComponentTypes.SUPPLY:
      // Enforce UK incoming supply sizing expectations
      if (UK) return isE ? MAIN_EARTH : TAILS_LN;
      return 0;
    case ComponentTypes.CONSUMER_UNIT: {
      // CU supply tails/main earth: enforce only on the supply input pins (named exactly L/N/E)
      if (UK && (term.name === 'L' || term.name === 'N' || term.name === 'E')) {
        return term.name === 'E' ? MAIN_EARTH : TAILS_LN;
      }
      return 0;
    }
    case ComponentTypes.CONSUMER_UNIT_SPLIT: {
      if (UK && (term.name === 'L' || term.name === 'N' || term.name === 'E')) {
        return term.name === 'E' ? MAIN_EARTH : TAILS_LN;
      }
      return 0;
    }
    case ComponentTypes.CONNECTOR_L3:
    case ComponentTypes.CONNECTOR_N3:
    case ComponentTypes.CONNECTOR_E3:
  case ComponentTypes.OUTDOOR_JUNCTION_IP66:
    case ComponentTypes.WAGO_L3:
    case ComponentTypes.WAGO_N3:
    case ComponentTypes.WAGO_E3:
    case ComponentTypes.WAGO_L5:
    case ComponentTypes.WAGO_N5:
    case ComponentTypes.WAGO_E5:
      return 0;
    default:
      return 0;
  }
}

function wireRequiredMinCSA(components, w, region) {
  const ta = terminalById(components, w.a);
  const tb = terminalById(components, w.b);
  if (!ta || !tb) return 0;
  const ra = requiredCSAForTerminal(ta.comp, ta.term, region);
  const rb = requiredCSAForTerminal(tb.comp, tb.term, region);
  let req = Math.max(ra, rb, 0);
  // Additional per-cable family rules (e.g., bonding minimum)
  if (region === 'UK' && w?.cableType === 'Bonding' && w?.kind === ConductorKinds.E) {
    req = Math.max(req, 10.0); // UK main bonding commonly ≥ 10 mm² (can be 16 mm² for some earthing arrangements)
  }
  return req;
}

function isWireUndersized(components, w, region = 'UK') {
  const req = wireRequiredMinCSA(components, w, region);
  if (!w || !w.sizeMm2 || !req || region === undefined) return false;
  return w.sizeMm2 + 1e-6 < req;
}

// Graph analysis helpers
function terminalById(components, tid) {
  for (const c of components) {
    for (const t of c.terminals) {
      if (t.id === tid) return { comp: c, term: t };
    }
  }
  return null;
}

function terminalAbsPosById(components, tid) {
  const hit = terminalById(components, tid);
  if (!hit) return null;
  const { comp, term } = hit;
  return componentTerminalAbsPos(comp, term);
}

function pxDistanceBetweenTerminals(components, a, b) {
  const pa = terminalAbsPosById(components, a);
  const pb = terminalAbsPosById(components, b);
  if (!pa || !pb) return Infinity;
  const dx = pa.x - pb.x, dy = pa.y - pb.y;
  return Math.hypot(dx, dy);
}

function buildTypedSubgraph(components, wires, allowedTermTypes) {
  // Map of terminalId -> set of terminalIds, but only for allowed terminal types
  const termTypeById = new Map();
  for (const c of components) for (const t of c.terminals) termTypeById.set(t.id, t.t);

  const add = (m,a,b)=>{
    if (!m.has(a)) m.set(a, new Set());
    if (!m.has(b)) m.set(b, new Set());
    m.get(a).add(b);
    m.get(b).add(a);
  };

  const g = new Map();
  // external wires
  for (const w of wires) {
    if (allowedTermTypes.has(termTypeById.get(w.a)) && allowedTermTypes.has(termTypeById.get(w.b))) {
      add(g, w.a, w.b);
    }
  }
  // internal links
  for (const c of components) {
    const links = typeof c.internalLinks === "function" ? c.internalLinks(c) : c.internalLinks || [];
    for (const [n1, n2] of links) {
      const t1 = c.terminals.find((t)=>t.name===n1);
      const t2 = c.terminals.find((t)=>t.name===n2);
      if (t1 && t2 && allowedTermTypes.has(t1.t) && allowedTermTypes.has(t2.t)) add(g, t1.id, t2.id);
    }
  }
  return g;
}

function buildWeightedSubgraph(components, wires, allowedTermTypes, conductorKey /* 'L'|'N'|'E' */) {
  const termTypeById = new Map();
  for (const c of components) for (const t of c.terminals) termTypeById.set(t.id, t.t);

  const g = new Map(); // id -> Array<{to, w}>
  const add = (a, b, w) => {
    if (!g.has(a)) g.set(a, []);
    if (!g.has(b)) g.set(b, []);
    g.get(a).push({ to: b, w });
    g.get(b).push({ to: a, w });
  };

  // External wires contribute a distance-based resistance (only for matching conductor family)
  for (const w of wires) {
    if (w.fault === 'open') continue;                 // break the conductor
    const ta = termTypeById.get(w.a);
    const tb = termTypeById.get(w.b);
    if (!allowedTermTypes.has(ta) || !allowedTermTypes.has(tb)) continue;
    // Filter by wire kind: allow GEN (unknown) or matching family only
    const k = w && w.switchedLive ? ConductorKinds.L : w.kind;
    const isMatch =
      k === ConductorKinds.GEN ||
      (conductorKey === 'L' && k === ConductorKinds.L) ||
      (conductorKey === 'N' && k === ConductorKinds.N) ||
      (conductorKey === 'E' && k === ConductorKinds.E);
    if (!isMatch) continue;
    let dist_m;
    if (typeof w.lengthM === 'number' && isFinite(w.lengthM) && w.lengthM > 0) {
      dist_m = w.lengthM;
    } else {
      const dist_px = pxDistanceBetweenTerminals(components, w.a, w.b);
      dist_m  = dist_px / PX_PER_M;
    }
    // Prefer wire-specific R/m if size is set, else fall back per family
    const rPerM = (w.sizeMm2 && getRPerM(w.sizeMm2)) ?? (R_PER_M[conductorKey] ?? 0.02);
    let rw = dist_m * rPerM + 2 * CONTACT_R;
    if (w.fault === 'hr') rw += 1.0; // add 1Ω as "high resistance joint"
    add(w.a, w.b, rw);
  }

  // Internal links (switches, FCU, RCD, connectors): very low, fixed resistance
  for (const c of components) {
    const links = typeof c.internalLinks === "function" ? c.internalLinks(c) : (c.internalLinks || []);
    for (const [n1, n2] of links) {
      const t1 = c.terminals.find((t)=>t.name===n1);
      const t2 = c.terminals.find((t)=>t.name===n2);
      if (!t1 || !t2) continue;
      if (!allowedTermTypes.has(t1.t) || !allowedTermTypes.has(t2.t)) continue;
      add(t1.id, t2.id, CONTACT_R); // treat as a short internal piece
    }
  }
  return g;
}

// Dijkstra for shortest (lowest-resistance) path
function dijkstraWeighted(g, start, goal) {
  if (!start || !goal || !g.has(start) || !g.has(goal)) return { R: Infinity, path: null };
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const pq = new Set([start]); // small graphs: simple set works fine

  while (pq.size) {
    // extract min
    let u = null, best = Infinity;
    for (const v of pq) {
      const d = dist.get(v) ?? Infinity;
      if (d < best) { best = d; u = v; }
    }
    pq.delete(u);
    if (u === goal) break;

    for (const {to, w} of g.get(u) || []) {
      const alt = (dist.get(u) ?? Infinity) + w;
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, u);
        pq.add(to);
      }
    }
  }

  if (!dist.has(goal)) return { R: Infinity, path: null };
  // rebuild path
  const path = [];
  for (let v = goal; v !== undefined; v = prev.get(v)) {
    path.push(v);
    if (v === start) break;
  }
  path.reverse();
  return { R: dist.get(goal), path };
}

// Convenience wrapper for meter measurements
function measureResistance(components, wires, a, b) {
  const families = [
    { key: "L", set: LineTermTypes },
    { key: "N", set: NeutralTermTypes },
    { key: "E", set: EarthTermTypes },
  ];
  const out = {};
  for (const fam of families) {
    const g = buildWeightedSubgraph(components, wires, fam.set, fam.key);
    const { R } = dijkstraWeighted(g, a, b);
    out[fam.key] = R;
  }
  return out; // {L:Ω or Infinity, N:..., E:...}
}

function measureVoltage(components, wires, a, b) {
  // Determine node potentials: L = 230 V, N/E = 0 V, others = unknown
  const supply = components.find(c=>c.type===ComponentTypes.SUPPLY) ||
                 components.find(c=>c.type===ComponentTypes.CONSUMER_UNIT || c.type===ComponentTypes.CONSUMER_UNIT_SPLIT);
  if (!supply) return null;
  const supplyL = terminalById(components, termIdByName(supply, "L") || supply.terminals.find(t=>t.t===TerminalTypes.L)?.id)?.term?.id;
  const supplyN = terminalById(components, termIdByName(supply, "N") || supply.terminals.find(t=>t.t===TerminalTypes.N)?.id)?.term?.id;
  const supplyE = terminalById(components, termIdByName(supply, "E") || supply.terminals.find(t=>t.t===TerminalTypes.E)?.id)?.term?.id;

  const gL = buildTypedSubgraph(components, wires, LineTermTypes);
  const gN = buildTypedSubgraph(components, wires, NeutralTermTypes);
  const gE = buildTypedSubgraph(components, wires, EarthTermTypes);

  const reach = (g, s) => bfsSet(g, s);
  const rL = supplyL ? reach(gL, supplyL) : new Set();
  const rN = supplyN ? reach(gN, supplyN) : new Set();
  const rE = supplyE ? reach(gE, supplyE) : new Set();

  const nodeV = (tid) => (rL.has(tid) ? SYSTEM_V : (rN.has(tid) || rE.has(tid)) ? 0 : null);
  const Va = nodeV(a), Vb = nodeV(b);
  if (Va==null || Vb==null) return { Va, Vb, Vab: null };
  return { Va, Vb, Vab: Math.abs(Va - Vb) };
}

function hasCycleThrough(g, startId) {
  const visited = new Set();
  let cycle = false;
  function dfs(v, parent) {
    visited.add(v);
    for (const {to:u} of g.get(v) || []) {
      if (u === parent) continue;
      if (!visited.has(u)) dfs(u, v);
      else cycle = true;
    }
  }
  if (startId && g.has(startId)) dfs(startId, null);
  return cycle;
}

function bfsSet(g, startId) {
  const seen = new Set();
  if (!startId || !g.has(startId)) return seen;
  const q = [startId];
  seen.add(startId);
  while (q.length) {
    const v = q.shift();
    const neigh = g.get(v) || [];
    for (const edge of neigh) {
      const u = (typeof edge === 'string') ? edge : (edge && typeof edge === 'object' ? (edge.to ?? edge) : edge);
      if (u && !seen.has(u)) { seen.add(u); q.push(u); }
    }
  }
  return seen;
}

// Map a component to a CU way by line-only reachability. Returns { cuId, wayIndex } or null.
function findCircuitForComponent(components, wires, comp) {
  if (!comp) return null;
  const gL = buildTypedSubgraph(components, wires, LineTermTypes);
  const compLineTerms = comp.terminals.filter((t) => LineTermTypes.has(t.t)).map((t) => t.id);
  if (!compLineTerms.length) return null;
  const reach = new Set();
  for (const tid of compLineTerms) {
    const r = bfsSet(gL, tid);
    for (const x of r) reach.add(x);
  }
  for (const c of components) {
    if (c.type !== ComponentTypes.CONSUMER_UNIT && c.type !== ComponentTypes.CONSUMER_UNIT_SPLIT) continue;
    const wayTerms = c.terminals.filter((t) => String(t.name).startsWith("LOUT"));
    for (const t of wayTerms) {
      if (reach.has(t.id)) {
        const m = /LOUT(\d+)/.exec(t.name);
        const wayIndex = m ? (parseInt(m[1], 10) - 1) : null;
        return { cuId: c.id, wayIndex };
      }
    }
  }
  return null;
}

function degreeIn(g, nodeId) {
  return (g.get(nodeId) || []).length;
}

function socketLineTermIds(c) {
  // Return all Line-type terminal IDs in a socket-like component
  if (![ComponentTypes.SOCKET_1G, ComponentTypes.SOCKET_2G, ComponentTypes.SOCKET_2G_SWITCHED, ComponentTypes.SOCKET_RCD_1G].includes(c.type)) return [];
  return c.terminals.filter((t)=>LineTermTypes.has(t.t)).map((t)=>t.id);
}

function componentTerminalAbsPos(component, term) {
  return { x: component.x + term.dx, y: component.y + term.dy };
}

function buildAdjacency(components, wires) {
  const adj = new Map();
  const addEdge = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };

  for (const w of wires) addEdge(w.a, w.b);

  // Internal links (based on component state)
  for (const c of components) {
    if (typeof c.internalLinks === "function") {
      const links = c.internalLinks(c);
      for (const [n1, n2] of links) {
        const t1 = c.terminals.find((t) => t.name === n1);
        const t2 = c.terminals.find((t) => t.name === n2);
        if (t1 && t2) addEdge(t1.id, t2.id);
      }
    } else if (Array.isArray(c.internalLinks)) {
      for (const [n1, n2] of c.internalLinks) {
        const t1 = c.terminals.find((t) => t.name === n1);
        const t2 = c.terminals.find((t) => t.name === n2);
        if (t1 && t2) addEdge(t1.id, t2.id);
      }
    }
  }
  return adj;
}

function bfs(adj, startId) {
  const visited = new Set([startId]);
  const q = [startId];
  while (q.length) {
    const v = q.shift();
    for (const nxt of adj.get(v) || []) {
      if (visited.has(nxt)) continue;
      visited.add(nxt);
      q.push(nxt);
    }
  }
  return visited;
}

function termIdByName(component, name) {
  return component.terminals.find((t) => t.name === name)?.id;
}

// ---------- Small UI helpers ----------
const isActivateKey = (e) => e.key === 'Enter' || e.key === ' ';

// Swatch component to correctly display gradients in HTML palette
const Swatch = ({ style }) => {
  const stroke = style?.stroke || '';
  if (String(stroke).startsWith('url(')) {
    // Render a tiny SVG with its own gradient id to avoid collisions
    return (
      <svg width="24" height="8" aria-hidden>
        <defs>
          <linearGradient id="swatchEarth" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#15803d" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>
        <rect width="24" height="8" rx="2" fill="url(#swatchEarth)" />
      </svg>
    );
  }
  return <span className="inline-block w-6 h-1" style={{ background: stroke }} />;
};

// ---------- Preset circuits ----------
const Presets = {
  GOOD_RING: {
    label: "Good ring circuit (2 sockets, 1 supply)",
    make: () => {
      const sup = makeSupply(40, 40);
      const s1 = makeSocket2G(200, 60);
      const s2 = makeSocket2G(400, 60);
      const wires = [];
      const addSized = (a,b,kind,sizeMm2,cableType) => {
        wires.push({
          id: newId(), a, b, kind,
          sizeMm2,
          ampacityA: getAmpacity(sizeMm2),
          cableType,
          label: `${formatSize(sizeMm2)} ${cableType}`
        });
      };
      // L/N/E ring
      addSized(termIdByName(sup,"L"), termIdByName(s1,"L"), ConductorKinds.L, 2.5, 'T&E');
      addSized(termIdByName(s1,"L"), termIdByName(s2,"L"), ConductorKinds.L, 2.5, 'T&E');
      addSized(termIdByName(s2,"L"), termIdByName(sup,"L"), ConductorKinds.L, 2.5, 'T&E');

      addSized(termIdByName(sup,"N"), termIdByName(s1,"N"), ConductorKinds.N, 2.5, 'T&E');
      addSized(termIdByName(s1,"N"), termIdByName(s2,"N"), ConductorKinds.N, 2.5, 'T&E');
      addSized(termIdByName(s2,"N"), termIdByName(sup,"N"), ConductorKinds.N, 2.5, 'T&E');

      // CPC sized per typical T&E (1.5 mm²)
      addSized(termIdByName(sup,"E"), termIdByName(s1,"E"), ConductorKinds.E, 1.5, 'T&E');
      addSized(termIdByName(s1,"E"), termIdByName(s2,"E"), ConductorKinds.E, 1.5, 'T&E');
      addSized(termIdByName(s2,"E"), termIdByName(sup,"E"), ConductorKinds.E, 1.5, 'T&E');

      return {components:[sup,s1,s2], wires};
    }
  },

  BROKEN_NEUTRAL: {
    label: "Broken neutral at lamp",
    make: () => {
      const sup = makeSupply(40, 40);
      const lamp = makeLamp(220, 60);
      const wires = [];
      const add = (a,b,kind) => wires.push({id:newId(),a,b,kind});
      add(termIdByName(sup,"L"), termIdByName(lamp,"L"), ConductorKinds.L);
      add(termIdByName(sup,"E"), termIdByName(lamp,"E"), ConductorKinds.E);
      // Missing neutral connection!
      return {components:[sup,lamp], wires};
    }
  },

  SPUR_OFF_SPUR: {
    label: "Spur off spur (non-compliant)",
    make: () => {
      const sup = makeSupply(40,40);
      const s1 = makeSocket2G(200,40);
      const s2 = makeSocket2G(360,40);
      const s3 = makeSocket2G(520,40);
      const wires = [];
      const addSized = (a,b,kind,sizeMm2,cableType) => wires.push({ id:newId(), a,b, kind, sizeMm2, ampacityA:getAmpacity(sizeMm2), cableType, label:`${formatSize(sizeMm2)} ${cableType}` });
      // Straight line chain (spur off spur)
      addSized(termIdByName(sup,"L"), termIdByName(s1,"L"), ConductorKinds.L, 2.5, 'T&E');
      addSized(termIdByName(s1,"L"), termIdByName(s2,"L"), ConductorKinds.L, 2.5, 'T&E');
      addSized(termIdByName(s2,"L"), termIdByName(s3,"L"), ConductorKinds.L, 2.5, 'T&E');

      addSized(termIdByName(sup,"N"), termIdByName(s1,"N"), ConductorKinds.N, 2.5, 'T&E');
      addSized(termIdByName(s1,"N"), termIdByName(s2,"N"), ConductorKinds.N, 2.5, 'T&E');
      addSized(termIdByName(s2,"N"), termIdByName(s3,"N"), ConductorKinds.N, 2.5, 'T&E');

      addSized(termIdByName(sup,"E"), termIdByName(s1,"E"), ConductorKinds.E, 1.5, 'T&E');
      addSized(termIdByName(s1,"E"), termIdByName(s2,"E"), ConductorKinds.E, 1.5, 'T&E');
      addSized(termIdByName(s2,"E"), termIdByName(s3,"E"), ConductorKinds.E, 1.5, 'T&E');

      return {components:[sup,s1,s2,s3], wires};
    }
  }
};

// === NEW PRESETS ========================================================
Presets.RING_FROM_CU = {
  label: "Consumer Unit → 32A MCB → Ring final (2 sockets)",
  make: () => {
    const cu = makeConsumerUnit(40, 260, { ways: 10 });
    const s1 = makeSocket2G(360, 260);
    const s2 = makeSocket2G(560, 260);
    const wires = []; 
    const addSized = (a,b,kind,sizeMm2,cableType)=> wires.push({ id:newId(), a,b, kind, sizeMm2, ampacityA:getAmpacity(sizeMm2), cableType, label:`${formatSize(sizeMm2)} ${cableType}` });
    const lout3 = cu.terminals.find(t => t.name === "LOUT3")?.id;
    const n1 = cu.terminals.find(t => t.name === "N1")?.id;
    const e1 = cu.terminals.find(t => t.name === "E1")?.id;
    const s1L = s1.terminals.find(t=>t.t===TerminalTypes.LIN)?.id;
    const s2L = s2.terminals.find(t=>t.t===TerminalTypes.LIN)?.id;
    const s1N = s1.terminals.find(t=>t.t===TerminalTypes.NIN)?.id;
    const s2N = s2.terminals.find(t=>t.t===TerminalTypes.NIN)?.id;
    const s1E = s1.terminals.find(t=>t.t===TerminalTypes.EIN)?.id;
    const s2E = s2.terminals.find(t=>t.t===TerminalTypes.EIN)?.id;
    addSized(lout3, s1L, ConductorKinds.L, 2.5, 'T&E'); addSized(s1L, s2L, ConductorKinds.L, 2.5, 'T&E'); addSized(s2L, lout3, ConductorKinds.L, 2.5, 'T&E');
    addSized(n1, s1N, ConductorKinds.N, 2.5, 'T&E');    addSized(s1N, s2N, ConductorKinds.N, 2.5, 'T&E'); addSized(s2N, n1, ConductorKinds.N, 2.5, 'T&E');
    addSized(e1, s1E, ConductorKinds.E, 1.5, 'T&E');    addSized(s1E, s2E, ConductorKinds.E, 1.5, 'T&E'); addSized(s2E, e1, ConductorKinds.E, 1.5, 'T&E');
    return { components: [cu, s1, s2], wires };
  }
};

Presets.SPLIT_LOAD_DEMO = {
  label: "Split‑load Consumer Unit → 32A ring + 6A lights",
  make: () => {
    const cu = makeConsumerUnitSplit(40, 260, {
      ways: 10,
      rcbo: [false,false,false,false,false, false,false,false,false,false],
      labels: ["Up lights","Down lights","Kitchen ring","Sockets ring","Cooker","Immersion","Garage","Oven","Spare","Spare"]
    });
    const s1 = makeSocket2G(420, 260);
    const s2 = makeSocket2G(620, 260);
    const lamp = makeLamp(420, 80);
    const wires = []; 
    const addSized = (a,b,kind,sizeMm2,cableType)=> wires.push({ id:newId(), a,b, kind, sizeMm2, ampacityA:getAmpacity(sizeMm2), cableType, label:`${formatSize(sizeMm2)} ${cableType}` });
    const L3 = cu.terminals.find(t=>t.name==="LOUT3")?.id;
    const N3 = cu.terminals.find(t=>t.name==="NOUT3")?.id;
    const E1 = cu.terminals.find(t=>t.name==="E1")?.id;
    const s1LIN = s1.terminals.find(t=>t.name==="LIN")?.id;
    const s2LIN = s2.terminals.find(t=>t.name==="LIN")?.id;
    const s1NIN = s1.terminals.find(t=>t.name==="NIN")?.id;
    const s2NIN = s2.terminals.find(t=>t.name==="NIN")?.id;
    const s1EIN = s1.terminals.find(t=>t.name==="EIN")?.id;
    const s2EIN = s2.terminals.find(t=>t.name==="EIN")?.id;
    addSized(L3, s1LIN, ConductorKinds.L, 2.5, 'T&E'); addSized(s1LIN, s2LIN, ConductorKinds.L, 2.5, 'T&E'); addSized(s2LIN, L3, ConductorKinds.L, 2.5, 'T&E');
    addSized(N3, s1NIN, ConductorKinds.N, 2.5, 'T&E'); addSized(s1NIN, s2NIN, ConductorKinds.N, 2.5, 'T&E'); addSized(s2NIN, N3, ConductorKinds.N, 2.5, 'T&E');
    addSized(E1, s1EIN, ConductorKinds.E, 1.5, 'T&E'); addSized(s1EIN, s2EIN, ConductorKinds.E, 1.5, 'T&E'); addSized(s2EIN, E1, ConductorKinds.E, 1.5, 'T&E');
    // Make Way1 RCBO, wire lamp to Way1
    cu.state.ways[0].rcbo = true;
    // const L1 = cu.terminals.find(t=>t.name==="LOUT1")?.id; // learner to wire
    const N1 = cu.terminals.find(t=>t.name==="NOUT1")?.id;
    // Size lighting radials at 1.0 mm² for demo (leave live for learner to connect)
    addSized(N1, lamp.terminals.find(t=>t.name==="N")?.id, ConductorKinds.N, 1.0, 'T&E');
    addSized(E1, lamp.terminals.find(t=>t.name==="E")?.id, ConductorKinds.E, 1.0, 'T&E');
    return { components: [cu, s1, s2, lamp], wires };
  }
};

// === LESSON TEMPLATES ===================================================
Presets.LESSON_UPSTAIRS_LIGHTS = {
  label: "Lesson: Wire upstairs lights (2‑way)",
  make: () => {
    // CU with one lighting way
    const cu = makeConsumerUnitSplit(40, 260, { ways: 10, labels: ["Up Lights","—","—","—","—","—","—","—","—","—"] });
    // Ceiling rose + two 2-way switches
    const rose = makeCeilingRose(360, 120);
    const sw1  = makeSwitch2Way(260, 220);
    const sw2  = makeSwitch2Way(460, 220);
    // Give learner a neutral/earth landing; leave switched live unwired on purpose
    const wires = []; const add=(a,b,k)=>wires.push({id:newId(),a,b,kind:k});
    const N1 = cu.terminals.find(t=>t.name==="NOUT1")?.id ?? cu.terminals.find(t=>/^N_A/.test(t.name))?.id;
    const E1 = cu.terminals.find(t=>t.name==="E1")?.id;
    add(N1, rose.terminals.find(t=>t.name==="N1")?.id, ConductorKinds.N);
    add(E1, rose.terminals.find(t=>t.name==="E1")?.id, ConductorKinds.E);
    // Leave learner to connect: L1 → COM of first switch → strappers → COM → SWL at rose.
    return { components:[cu, rose, sw1, sw2], wires };
  }
};

Presets.LESSON_BLANK_CU = {
  label: "Lesson: Blank CU (label & allocate ways)",
  make: () => ({ components:[ makeConsumerUnitSplit(40,260,{ways:10, labels:Array(10).fill("—")}) ], wires:[] })
};

// Collapsible Component
const Collapsible = ({ id, title, children, collapsedMap, setCollapsedMap }) => {
  const isCollapsed = collapsedMap[id] || false;
  
  const toggleCollapsed = () => {
    const newCollapsed = { ...collapsedMap, [id]: !isCollapsed };
    setCollapsedMap(newCollapsed);
    localStorage.setItem('collapsedSections', JSON.stringify(newCollapsed));
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={toggleCollapsed}
        className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        aria-expanded={!isCollapsed}
      >
        <span>{title}</span>
        <span className={`transform transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}>
          ▶
        </span>
      </button>
      <div 
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isCollapsed ? 'max-h-0' : 'max-h-[2000px]'
        }`}
      >
        <div className="p-3">
          {children}
        </div>
      </div>
    </div>
  );
};

// ---------------- Grouped Toolbox (clean, modern, accessible) ----------------
// Utilitarian design with subtle depth, search, collapsible groups, and dense mode.
// Icons: lightweight inline SVGs to avoid extra deps.

const Icon = {
  Power: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 3v6m6.36-1.36a9 9 0 11-12.72 0"/></svg>
  ),
  Lightbulb: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 18h6m-5 3h4M8 11a4 4 0 118 0c0 1.657-1 2.5-2 3.5S13 16 13 17h-2c0-1-1-1.843-2-2.5S8 12.657 8 11z"/></svg>
  ),
  Home: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 10l9-7 9 7v9a2 2 0 01-2 2h-4a2 2 0 01-2-2V12H9v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-9z"/></svg>
  ),
  Cable: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 8c3 0 3 8 6 8s3-8 6-8 3 8 6 8"/></svg>
  ),
  Wrench: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a4 4 0 01-5.66 5.66L3 18l3 3 6.04-6.04a4 4 0 005.66-5.66L15 5l-.3 1.3z"/></svg>
  ),
  Search: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><circle cx="11" cy="11" r="7" strokeWidth="2"/><path d="M21 21l-4.3-4.3" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  Zap: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"/></svg>
  ),
  Plug: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 6v4m12-4v4M8 10h8v3a4 4 0 01-4 4H8v-7z"/></svg>
  )
};

const TOOLBOX_GROUPS = [
  {
    id: "power",
    label: "Power & Distribution",
    icon: Icon.Power,
    items: [
      { id: "supply", label: "Supply", kind: "supply", tags: ["origin","incoming"] },
  { id: "cu10", label: "Consumer Unit (10‑way)", kind: "consumer_unit" },
  { id: "cu10split", label: "Consumer Unit — Split‑load (10‑way)", kind: "consumer_unit_split", tags:["rcbo","dual rcd","split"] },
  { id: "cooker45", label: "Cooker Control Unit (45A DP)", kind: "cooker_control", tags:["cooker","range"] },
    ],
  },
  {
    id: "lighting",
    label: "Lighting",
    icon: Icon.Lightbulb,
    items: [
      { id: "rose", label: "Ceiling rose", kind: "ceiling_rose", tags:["loop‑in"] },
  { id: "lamp", label: "Lamp (luminaire)", kind: "lamp", tags:["luminaire"] },
  { id: "1g1w", label: "1‑gang switch (1‑way)", kind: "switch_1g_1w" },
  { id: "1g2w", label: "1‑gang switch (2‑way)", kind: "switch_1g_2w" },
  { id: "intermediate", label: "Intermediate switch", kind: "switch_intermediate" },
    ],
  },
  {
    id: "sockets_fcu",
    label: "Sockets & FCUs",
    icon: Icon.Home,
    items: [
      { id: "socket1g", label: "1‑gang socket", kind: "socket_1g" },
      { id: "socket2g", label: "2‑gang socket", kind: "socket_2g" },
      { id: "socket2gsw", label: "2‑gang socket (switched)", kind: "socket_2g_switched" },
  { id: "fcu_un", label: "Unswitched FCU", kind: "fcu_unswitched" },
  { id: "fcu_sw", label: "Switched FCU", kind: "fcu_switched" },
    ],
  },
  {
    id: "connectors",
    label: "Connectors",
    icon: Icon.Cable,
    items: [
  { id: "connL3", label: "Line connector block (3‑way)", kind: "connector_L3" },
  { id: "connN3", label: "Neutral connector block (3‑way)", kind: "connector_N3" },
  { id: "connE3", label: "Earth (CPC) connector block (3‑way)", kind: "connector_E3" },
    ],
  },
  {
    id: "wago",
    label: "Wago 221",
    icon: Icon.Wrench,
    items: [
  { id: "wL3", label: "Wago 221 — Line (3‑way)", kind: "wago_L3" },
  { id: "wN3", label: "Wago 221 — Neutral (3‑way)", kind: "wago_N3" },
  { id: "wE3", label: "Wago 221 — Earth (3‑way)", kind: "wago_E3" },
  { id: "wL5", label: "Wago 221 — Line (5‑way)", kind: "wago_L5" },
  { id: "wN5", label: "Wago 221 — Neutral (5‑way)", kind: "wago_N5" },
  { id: "wE5", label: "Wago 221 — Earth (5‑way)", kind: "wago_E5" },
    ],
  },
  {
    id: "outdoor",
    label: "Outdoor",
    icon: Icon.Plug,
    items: [
      { id: "outdoor_socket_rcd", label: "Outdoor socket (RCD, IP66)", kind: "outdoor_socket_rcd", tags:["RCD","IP66","outdoor"] },
      { id: "outdoor_jb_ip66", label: "Outdoor JB (IP66)", kind: "outdoor_jb_ip66", tags:["IP66","junction","outdoor"] },
      { id: "garden_light", label: "Garden light", kind: "garden_light", tags:["requires RCD","outdoor"] },
    ],
  },
  {
    id: "ev",
    label: "EV Charging",
    icon: Icon.Zap,
    items: [
      { id: "evse_1p", label: "EV charger (7.2 kW)", kind: "evse_1p_7kw", tags:["EV","RCD","RDC-DD","Open-PEN"] },
      { id: "evse_3p", label: "EV charger (3‑phase 11/22 kW)", kind: "evse_3p_11_22", tags:["EV","3‑phase","RCD","Open-PEN"] },
    ],
  },
];

const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const matchQuery = (item, q) => {
  if (!q) return true;
  const hay = normalise(item.label + " " + (item.tags?.join(" ") ?? ""));
  return q.split(/\s+/).every((term) => hay.includes(term));
};

function ToolboxRow({ item, onAdd, compact }) {
  const isWago = String(item.kind).startsWith("wago_");
  return (
    <button
      type="button"
      className={`group flex items-center gap-2 rounded-full border px-3 py-2 text-left shadow-sm ring-1 ring-slate-200 bg-white hover:bg-accent hover:text-white transition active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${compact ? "h-8 text-xs px-2" : "h-9 text-sm"}`}
      onClick={() => onAdd(item)}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/json", JSON.stringify({ type: "toolbox-item", item }));
      }}
      draggable
      aria-label={`Add ${item.label}`}
    >
      {/* Drag affordance */}
      <span className="inline-flex -ml-1 pr-1 text-slate-400 group-hover:text-white" aria-hidden>
        ⋮⋮
      </span>
      <span className={`flex-1 truncate ${isWago ? "text-amber-700 group-hover:text-white" : "text-slate-700"}`}>{item.label}</span>
    </button>
  );
}

function GroupedToolbox({ onAdd, defaultOpen = ["power","lighting"], denseDefault = false }) {
  const [query, setQuery] = useState("");
  const [dense, setDense] = useState(denseDefault);
  const [open, setOpen] = useState(() => new Set(defaultOpen));
  const q = normalise(query);

  const filtered = useMemo(() => {
    return TOOLBOX_GROUPS.map(g => ({...g, items: g.items.filter(it => matchQuery(it, q))})).filter(g => g.items.length > 0);
  }, [q]);

  const toggle = (id) => {
    setOpen(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800">
          <Icon.Plug className="h-5 w-5" />
          <h3 className="text-base font-semibold">Toolbox</h3>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" className="accent-accent" checked={dense} onChange={(e)=>setDense(e.target.checked)} />
            Dense
          </label>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Icon.Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          placeholder={'Search (e.g. "rose", "Wago 5")'}
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white placeholder-slate-400 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Search toolbox"
        />
      </div>

      <div className="h-px bg-slate-200 my-1" />

      {/* Groups */}
      <div className="rounded-2xl ring-1 ring-slate-200 bg-white/80 backdrop-blur p-1 shadow-sm">
        {filtered.map((group) => {
          const GIcon = group.icon || Icon.Plug;
          const isOpen = open.has(group.id);
          return (
            <div key={group.id} className="rounded-xl">
              <button
                type="button"
                onClick={()=>toggle(group.id)}
                className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-slate-50 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-expanded={isOpen}
              >
                <GIcon className="h-4 w-4 text-slate-700" />
                <span className="flex-1 text-[15px] font-medium text-slate-800">{group.label}</span>
                <span className="text-slate-400" aria-hidden>{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="px-2 pb-2">
                  <div className={`grid gap-1 ${dense ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {group.items.map((it)=>(
                      <ToolboxRow key={it.id} item={it} onAdd={onAdd} compact={dense} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer tip */}
      <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><Icon.Zap className="h-3 w-3" />Tip: Drag items to canvas or click to insert</span>
            </div>
    </div>
  );
}


// ---------- Main React Component ----------
export default function App() {
  // --- All state declarations ---
  const DISCLAIMER_KEY = 'wirelab_disclaimer_v1';
  const [ackDisclaimer, setAckDisclaimer] = useState(() => {
    try { return localStorage.getItem(DISCLAIMER_KEY) === 'yes'; } catch { return false; }
  });
  const [components, setComponents] = useState(() => [makeSupply(40, 40), makeLamp(360, 40)]);
  const [wires, setWires] = useState([]); // wires: {id, a, b, kind}
  const [pending, setPending] = useState(null); // terminalId | null
  // Multi-selection: components and wires
  const [selection, setSelection] = useState({ components: [], wires: [] });
  const [currentKind, setCurrentKind] = useState(ConductorKinds.GEN);
  const [probeA, setProbeA] = useState(null);   // stores a terminalId
  const [probeB, setProbeB] = useState(null);   // stores a terminalId
  const [probePick, setProbePick] = useState(null); // 'A' | 'B' | null
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [wiresOnTop, setWiresOnTop] = useState(true);
  const [wireHalo, setWireHalo] = useState(true);
  const [fadeBoxes, setFadeBoxes] = useState(false);
  const [wireThickness, setWireThickness] = useState(4);
  // Simulation & cable selections
  const [simMode, setSimMode] = useState('free'); // 'free' | 'learning' | 'assessment'
  const [currentWireSize, setCurrentWireSize] = useState(2.5); // mm² for single wires
  const [currentCableType, setCurrentCableType] = useState('T&E');
  const [bundleSize, setBundleSize] = useState(2.5); // mm² for L/N cores in bundle
  const [region, setRegion] = useState('UK'); // 'UK' | 'EU'
  const [showWireLengths, setShowWireLengths] = useState(false);
  const [defaultLengthM, setDefaultLengthM] = useState(5); // used when creating singles
  const [drag, setDrag] = useState(null); // {id, dx, dy, mode:'single'|'multi'}
  // Theme
  const [darkMode, setDarkMode] = useState(false);
  // Floor plan state
  const { floorPlan, setFloorPlan, actions: floorPlanActions } = useFloorPlanState();
  // Quick test tools
  const [quickTool, setQuickTool] = useState(null); // null | 'pen' | 'scissors'
  const [penHoverWireId, setPenHoverWireId] = useState(null);
  const [scissorsHoverPoint, setScissorsHoverPoint] = useState(null); // {x, y, wireId} for cut preview
  // Tool cursor helpers
  const toolCursorClass = useMemo(() => quickTool === 'pen' ? 'tool-cursor-pen' : quickTool === 'scissors' ? 'tool-cursor-scissors' : '', [quickTool]);
  // Runtime-generate PNG cursors (Chromium/Edge don't render SVG cursors reliably)
  const [penCursorPng, setPenCursorPng] = useState(null);
  const [scissorsCursorPng, setScissorsCursorPng] = useState(null);
  useEffect(() => {
    const makePng = (svgUrl, size = 32) => new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = document.createElement('canvas');
          canvas.width = size * dpr;
          canvas.height = size * dpr;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = svgUrl;
      } catch (e) {
        reject(e);
      }
    });
    let cancelled = false;
    (async () => {
      try {
        const [penPng, sciPng] = await Promise.all([
          makePng(VOLTAGE_PEN_CURSOR, 32),
          makePng(SCISSORS_CURSOR, 32)
        ]);
        if (!cancelled) { setPenCursorPng(penPng); setScissorsCursorPng(sciPng); }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);
  // Tunable hotspots so the tip aligns with the red cut dot / probe tip
  const PEN_HOTSPOT = { x: 12, y: 4 };      // adjust if pen tip feels off
  const SCISSOR_HOTSPOT = { x: 12, y: 10 }; // nudged closer to pointer; tweak for pixel-perfect alignment
  const cursorCSS = useMemo(() => `
    /* Apply tool cursors only when not panning or space-grab */
    .tool-cursor-pen:not(.panning):not(.space-grab), .tool-cursor-pen:not(.panning):not(.space-grab) * { cursor: ${penCursorPng ? `url(${penCursorPng}) ${PEN_HOTSPOT.x} ${PEN_HOTSPOT.y}, pointer` : 'pointer'} !important; }
    .tool-cursor-scissors:not(.panning):not(.space-grab), .tool-cursor-scissors:not(.panning):not(.space-grab) * { cursor: ${scissorsCursorPng ? `url(${scissorsCursorPng}) ${SCISSOR_HOTSPOT.x} ${SCISSOR_HOTSPOT.y}, crosshair` : 'crosshair'} !important; }
    /* Pan/space overrides */
    .panning, .panning * { cursor: grabbing !important; }
    .space-grab:not(.panning), .space-grab:not(.panning) * { cursor: grab !important; }
  `, [penCursorPng, scissorsCursorPng, PEN_HOTSPOT.x, PEN_HOTSPOT.y, SCISSOR_HOTSPOT.x, SCISSOR_HOTSPOT.y]);
  // Fun deaths overlay system
  const [funDeathsEnabled, setFunDeathsEnabled] = useState(false);
  const [funDeathsTreatNEAsDeadly, setFunDeathsTreatNEAsDeadly] = useState(false);
  const [youDiedOpen, setYouDiedOpen] = useState(false);
  const lastSafeRef = useRef(null); // {components, wires} snapshot
  // NEW: snooze re-open until wiring changes
  const deathSnoozeRef = useRef(null);
  // Hash the danger-driving state (wires + critical bits of components)
  const dangerHash = useMemo(() => {
    return JSON.stringify({
      wires: wires.map(w => [w.id, w.a, w.b, w.fault, w.sizeMm2, w.lengthM]),
      comps: components.map(c => [c.id, c.type, c.state?.mainOn, c.state?.ways?.map(w=>w?.closed)]),
      neDeadly: funDeathsTreatNEAsDeadly
    });
  }, [components, wires, funDeathsTreatNEAsDeadly]);
  const snoozeDeathUntilChange = useCallback(() => {
    deathSnoozeRef.current = dangerHash;
  }, [dangerHash]);
  // Marquee select
  const [marquee, setMarquee] = useState(null); // {x0,y0,x1,y1} in world coords
  // Viewport (pan/zoom)
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, k: 1 });
  const rootGRef = useRef(null);
  // NEW: inline label editor for CU ways
  const [labelEdit, setLabelEdit] = useState(null); // { compId, i, value } | null
  // Hotkeys help toggle
  const [showHotkeys, setShowHotkeys] = useState(false);
  // Collapsed sections state
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('collapsedSections');
    return saved ? JSON.parse(saved) : {};
  });

  // Collapse/Expand helpers for panels
  const LEFT_SECTION_IDS = [
    'toolbox',
    'quick-tests',
    'wires',
    'cable-bundles',
    'actions',
    'display',
  ];
  const RIGHT_SECTION_IDS = [
    'analysis-checks',
    'sizing-rules',
    'presets',
    'meter',
    'earth-continuity',
    'regulations',
  ];

  const setCollapsedFor = (ids, value) => {
    setCollapsed(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = value; });
      localStorage.setItem('collapsedSections', JSON.stringify(next));
      return next;
    });
  };

  // Add a component at a default drop position; factory is (x,y)=>component
  const addComponent = useCallback((maker) => {
    const drop = { x: 120, y: 120 };
    const c = maker(drop.x, drop.y);
    setComponents(cs => [...cs, c]);
  }, [setComponents]);

  // Map toolbox kinds to makers and add to canvas
  const addToolboxItem = useCallback((it) => {
    const kind = it.kind;
    let maker = null;
    switch (kind) {
      case 'supply': maker = makeSupply; break;
      case 'consumer_unit': maker = (x,y)=> makeConsumerUnit(x,y,{ ways: 10 }); break;
      case 'consumer_unit_split': maker = (x,y)=> makeConsumerUnitSplit(x,y,{ ways: 10 }); break;
      case 'cooker_control': maker = makeCookerControlUnit; break;
      case 'ceiling_rose': maker = makeCeilingRose; break;
      case 'lamp': maker = makeLamp; break;
      case 'switch_1g_1w': maker = makeSwitch1Way; break;
      case 'switch_1g_2w': maker = makeSwitch2Way; break;
      case 'switch_intermediate': maker = makeSwitchIntermediate; break;
      case 'socket_1g': maker = makeSocket1G; break;
      case 'socket_2g': maker = makeSocket2G; break;
      case 'socket_2g_switched': maker = makeSocket2GSwitched; break;
      case 'fcu_unswitched': maker = makeFCUUnswitched; break;
      case 'fcu_switched': maker = makeFCUSwitched; break;
      case 'connector_L3': maker = makeConnectorL3; break;
      case 'connector_N3': maker = makeConnectorN3; break;
      case 'connector_E3': maker = makeConnectorE3; break;
      case 'wago_L3': maker = (x,y)=> makeWago3('L',x,y); break;
      case 'wago_N3': maker = (x,y)=> makeWago3('N',x,y); break;
      case 'wago_E3': maker = (x,y)=> makeWago3('E',x,y); break;
      case 'wago_L5': maker = (x,y)=> makeWago5('L',x,y); break;
      case 'wago_N5': maker = (x,y)=> makeWago5('N',x,y); break;
      case 'wago_E5': maker = (x,y)=> makeWago5('E',x,y); break;
      case 'outdoor_socket_rcd': maker = makeOutdoorSocketRCD; break;
      case 'outdoor_jb_ip66': maker = makeOutdoorJunctionBox; break;
      case 'garden_light': maker = makeGardenLight; break;
      case 'evse_1p_7kw': maker = makeEVSE1P; break;
      case 'evse_3p_11_22': maker = makeEVSE3P; break;
      default: break;
    }
    if (maker) addComponent(maker);
  }, [addComponent]);
  // Space key for pan mode
  const [spacePressed, setSpacePressed] = useState(false);
  
  // --- Refs ---
  const svgRef = useRef(null);

  // --- Constants ---
  const gridSize = 20;
  const PROBE_A_COLOR = "#ef4444"; // red
  const PROBE_B_COLOR = "#111827"; // near-black
  const PROBE_R = 7;               // marker radius

  // UI and component helpers (inside component)
  const updateComponent = useCallback((id, fn) => {
    setComponents((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  }, [setComponents]);
  // NEW: commit label change
  const commitWayLabel = useCallback((compId, i, value) => {
    updateComponent(compId, (prev) => {
      const ways = prev.state?.ways?.slice() ?? [];
      if (ways[i]) ways[i] = { ...ways[i], label: (value ?? "").trim() || ways[i].label };
      return { ...prev, state: { ...prev.state, ways } };
    });
    setLabelEdit(null);
  }, [updateComponent]);
  // Selection helpers
  const clearSelection = useCallback(() => {
    setSelection({ components: [], wires: [] });
  }, []);

  const isSelected = useCallback((kind, id) => {
    const list = kind === "component" ? selection.components : selection.wires;
    return list.includes(id);
  }, [selection]);

  const replaceSelection = useCallback((kind, id) => {
    setSelection({
      components: kind === "component" ? [id] : [],
      wires: kind === "wire" ? [id] : [],
    });
  }, []);

  const toggleSelection = useCallback((kind, id) => {
    setSelection((sel) => {
      const key = kind === "component" ? "components" : "wires";
      const next = sel[key].includes(id)
        ? sel[key].filter((x) => x !== id)
        : [...sel[key], id];
      return { ...sel, [key]: next };
    });
  }, []);


  // --- Probe marker visuals ---



  // --- History state ---
  
  // Deep clone helper for safe snapshots
  function deepCloneState(st) {
    try { return structuredClone(st); }
    catch { return JSON.parse(JSON.stringify(st)); }
  }
  // Push current state to undo stack and clear redo (deep cloned)
  const pushHistory = useCallback(() => {
    const snap = deepCloneState({ components, wires });
    setUndoStack(stack => [...stack, snap]);
    setRedoStack([]);
  }, [components, wires]);

  // Undo/redo handlers
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevState = undoStack[undoStack.length - 1];
    setRedoStack(stack => [...stack, {components, wires}]);
    setUndoStack(stack => stack.slice(0, -1));
    setComponents(prevState.components);
    setWires(prevState.wires);
    clearSelection();
    setPending(null);
  }, [components, wires, undoStack, clearSelection]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack(stack => [...stack, {components, wires}]);
    setRedoStack(stack => stack.slice(0, -1));
    setComponents(nextState.components);
    setWires(nextState.wires);
    clearSelection();
    setPending(null);
  }, [components, wires, redoStack, clearSelection]);

  // ------- Duplicate selection (components + internal wires) -------
  const duplicateSelection = useCallback(() => {
    const compIds = new Set(selection.components);
    if (compIds.size === 0) return;
    pushHistory();
    // clone components with fresh ids
    const clones = [];
    const termIdMap = new Map(); // oldTermId -> newTermId
    for (const c of components) {
      if (!compIds.has(c.id)) continue;
      // deep-ish clone with new ids
      const newCompId = newId();
      const newTerms = c.terminals.map(t => {
        const nt = { ...t, id: newId() };
        termIdMap.set(t.id, nt.id);
        return nt;
      });
      const clone = {
        ...c,
        id: newCompId,
        x: c.x + 40, y: c.y + 40,
        terminals: newTerms,
        // keep state / internalLinks as-is (functions remain references)
      };
      clones.push(clone);
    }
    // wires fully inside selection → replicate with mapped terminals
    const newWires = wires
      .filter(w => {
        const ta = terminalById(components, w.a);
        const tb = terminalById(components, w.b);
        return ta && tb && compIds.has(ta.comp.id) && compIds.has(tb.comp.id);
      })
      .map(w => {
        const a2 = termIdMap.get(w.a), b2 = termIdMap.get(w.b);
        if (!a2 || !b2) return null;
        return { ...w, id: newId(), a: a2, b: b2, ctrl: w.ctrl ?? 0, bundle: undefined };
      })
      .filter(Boolean);
    setComponents(cs => [...cs, ...clones]);
    setWires(ws => [...ws, ...newWires]);
    // select new clones
    setSelection({ components: clones.map(c => c.id), wires: newWires.map(w => w.id) });
  }, [components, wires, selection, pushHistory]);

  // SVG → string
  const exportSVGString = () => {
    const svg = svgRef.current;
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    // remove transient glow filters that some renderers dislike (optional)
    clone.querySelectorAll('[filter]').forEach(n => n.removeAttribute('filter'));
    const s = new XMLSerializer().serializeToString(clone);
    return `<?xml version="1.0" standalone="no"?>\n` + s;
  };

  // Save SVG file
  const downloadSVG = () => {
    const s = exportSVGString();
    if (!s) return;
    const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'wiring-trainer.svg'; a.click();
    URL.revokeObjectURL(url);
  };

  // Save PNG (renders the SVG string to a canvas)
  const downloadPNG = async (scale = 2) => {
    const s = exportSVGString();
    if (!s) return;
    const svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    const img = new Image();
    // permit gradients / external hrefs
    img.crossOrigin = 'anonymous';
    await new Promise(res => { img.onload = res; img.src = svg64; });
    const bbox = svgRef.current.getBBox();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(bbox.width * scale);
    canvas.height = Math.ceil(bbox.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale,0,0,scale, -bbox.x*scale, -bbox.y*scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'wiring-trainer.png'; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  // world viewport
  const [view, setView] = useState({ x:0, y:0, w:1200, h:860 }); // match your canvas size
  const [viewMode, setViewMode] = useState('installers'); // 'installers' | 'schematic'
  const [meterMode, setMeterMode] = useState('ohms'); // 'ohms' | 'volts'
  const [loadCurrentA, setLoadCurrentA] = useState(10); // For ΔV under load
  
  // Cable bundle workflow
  const [bundleMode, setBundleMode] = useState(null); // null | "T&E" | "3C+E" | "SWA"
  const [bundlePending, setBundlePending] = useState(null); // temporary bundle terminals
  const [autoTidy, setAutoTidy] = useState(false);
  
  // Inspection checklist (reserved for future use)
  
  // ------- Helpers: coordinate transforms -------
  const toWorld = useCallback((evt) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    
    // Get SVG bounding rect
    const rect = svg.getBoundingClientRect();
    
    // Support mouse and touch events
    const touch = evt && (evt.touches?.[0] || evt.changedTouches?.[0]);
    const clientX = touch ? touch.clientX : evt.clientX;
    const clientY = touch ? touch.clientY : evt.clientY;
    
    // Convert to SVG coordinates using viewBox
    const x = (clientX - rect.left) * (view.w / rect.width) + view.x;
    const y = (clientY - rect.top) * (view.h / rect.height) + view.y;
    
    // Transform through the viewport transform
    const transformedX = (x - viewTransform.x) / viewTransform.k;
    const transformedY = (y - viewTransform.y) / viewTransform.k;
    
    console.log('toWorld:', { 
  clientX, clientY, 
      viewBox: { x: view.x, y: view.y, w: view.w, h: view.h },
      transform: viewTransform,
      svgCoords: { x, y },
      worldCoords: { x: transformedX, y: transformedY }
    });
    
    return { x: transformedX, y: transformedY };
  }, [view, viewTransform]);
  
  const zoomAt = (mx, my, factor) => {
    setView(v => {
      const svg = svgRef.current;
      if (!svg) return v;
      const pt = svg.createSVGPoint();
      pt.x = mx; pt.y = my;
      const ctm = svg.getScreenCTM();
      const p = pt.matrixTransform(ctm.inverse());
      const w2 = v.w / factor, h2 = v.h / factor;
      const x2 = p.x - (p.x - v.x) / factor;
      const y2 = p.y - (p.y - v.y) / factor;
      return { x:x2, y:y2, w:w2, h:h2 };
    });
  };

  const panRef = useRef({ panning:false, ox:0, oy:0, vx:0, vy:0, startTime:0, panTimeout:null });
  const pinchRef = useRef({ active:false, lastDist:0, lastMid:{ x:0, y:0 } });
  const startPan = (e) => {
    // Only start pan if space is pressed and left-clicking on SVG background
    if (!spacePressed || e.button !== 0 || e.target !== e.currentTarget) return;
    
    console.log('Starting pan:', { spacePressed, button: e.button, viewTransform });
    panRef.current = { 
      panning:true, 
      ox:e.clientX, 
      oy:e.clientY, 
      vx:viewTransform.x, 
      vy:viewTransform.y, 
      startTime:Date.now(),
      panTimeout:null
    };
  };
  const doPan = (e) => {
    if (!panRef.current.panning) return;
    const dx = e.clientX - panRef.current.ox;
    const dy = e.clientY - panRef.current.oy;
    console.log('Panning:', { dx, dy, panning: panRef.current.panning });
    setViewTransform(v => ({ 
      ...v, 
      x: panRef.current.vx + dx, 
      y: panRef.current.vy + dy 
    }));
  };
  const endPan = () => { 
    if (panRef.current.panTimeout) {
      clearTimeout(panRef.current.panTimeout);
      panRef.current.panTimeout = null;
    }
    panRef.current.panning = false; 
    panRef.current.startTime = 0; // Cancel any pending pan start
  };

  // URL state handling
  useEffect(() => {
    // Check for state in URL on load
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get('state');
    if (stateParam) {
      try {
        const state = JSON.parse(decodeURIComponent(stateParam));
        if (state.components && state.wires) {
          setComponents(state.components);
          setWires(state.wires);
          clearSelection();
        }
      } catch (e) {
        console.warn('Failed to load state from URL:', e);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Share state via URL
  const shareState = useCallback(() => {
    const state = { components, wires };
    const stateParam = encodeURIComponent(JSON.stringify(state));
    const url = `${window.location.origin}${window.location.pathname}?state=${stateParam}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Share link copied to clipboard!');
    });
  }, [components, wires]);

  // Multi-remove: components and/or wires (placed here so effects below can depend on it)
  const removeSelected = useCallback(() => {
    const hasAny = selection.components.length || selection.wires.length;
    if (!hasAny) return;

    pushHistory();

    const removeCompIds = new Set(selection.components);
    const removeWireIds = new Set(selection.wires);

    // collect terminal IDs from components to purge attached wires
    const termIdsToPurge = new Set();
    for (const c of components) {
      if (!removeCompIds.has(c.id)) continue;
      for (const t of c.terminals) termIdsToPurge.add(t.id);
    }

    setComponents((cs) => cs.filter((c) => !removeCompIds.has(c.id)));
    setWires((ws) =>
      ws.filter(
        (w) =>
          !removeWireIds.has(w.id) &&
          !termIdsToPurge.has(w.a) &&
          !termIdsToPurge.has(w.b)
      )
    );

    clearSelection();
    setPending(null);
  }, [selection, components, pushHistory, setComponents, setWires, clearSelection]);

  // Wire cutting function
  const cutWireAt = (wire, point, options = {}) => {
    const { snapTolerance = 8, createVisibleJunction = false } = options;
    
    const a = terminalById(components, wire.a);
    const b = terminalById(components, wire.b);
    if (!a || !b) return null;
    
    const pa = componentTerminalAbsPos(a.comp, a.term);
    const pb = componentTerminalAbsPos(b.comp, b.term);
    
    // Check if cut point is too close to endpoints
    const distToA = Math.hypot(point.x - pa.x, point.y - pa.y);
    const distToB = Math.hypot(point.x - pb.x, point.y - pb.y);
    
    if (distToA < snapTolerance || distToB < snapTolerance) {
      return null; // Too close to endpoints, don't cut
    }
    
    const projection = projectPointOnSegment(point, pa, pb);
    const cutPoint = { x: projection.x, y: projection.y };
    
    // Determine terminal type from original endpoint terminal type (preferred),
    // falling back to wire kind only when it maps to a known terminal family.
    const mapKindToTerm = (k) => {
      if (k === ConductorKinds.L) return TerminalTypes.L;
      if (k === ConductorKinds.N) return TerminalTypes.N;
      if (k === ConductorKinds.E) return TerminalTypes.E;
      return null;
    };
    const fromEndpointType = a.term?.t;
    const byKind = mapKindToTerm(wire.kind);
    const terminalType = fromEndpointType || byKind || TerminalTypes.L;
    
    // Create junction component with TWO terminals for proper connection
    const junctionId = newId();
    const terminal1Id = newId();
    const terminal2Id = newId();
    
    const junction = {
      id: junctionId,
      type: ComponentTypes.JUNCTION,
      x: cutPoint.x,
      y: cutPoint.y,
      label: 'J',
      hidden: !createVisibleJunction,
      showHandles: true,
      terminals: [
        { 
          id: terminal1Id, 
          dx: -2, 
          dy: 0, 
          t: terminalType,
          name: terminalType + '1'
        },
        { 
          id: terminal2Id, 
          dx: 2, 
          dy: 0, 
          t: terminalType,
          name: terminalType + '2'
        }
      ],
      // Internal link between the two terminals for electrical continuity
      internalLinks: [[terminalType + '1', terminalType + '2']]
    };
    
    // Create two new wires connecting through the junction
    const wire1 = {
      ...wire,
      id: newId(),
      b: terminal1Id // Connect to first junction terminal
      // lengthM intentionally omitted so geometry drives resistance/length live
    };
    
    const wire2 = {
      ...wire,
      id: newId(),
      a: terminal2Id // Connect from second junction terminal
      // lengthM intentionally omitted so geometry drives resistance/length live
    };
    
    console.log('Cutting wire at point:', cutPoint);
    console.log('Creating junction with terminals:', junction.terminals);
    console.log('Creating wire segments:', { wire1: wire1.id, wire2: wire2.id });
    
    return {
      junction,
      removedWireId: wire.id,
      newWires: [wire1, wire2]
    };
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        // Duplicate selection
        e.preventDefault();
        duplicateSelection();
      } else if (e.key === 'Escape') {
        if (quickTool) {
          setQuickTool(null);
          setScissorsHoverPoint(null);
        } else {
          clearSelection();
        }
      } else if (e.key.toLowerCase() === 'g') {
        setShowGrid(v => !v);
      } else if (e.key.toLowerCase() === 's') {
        setSnapToGrid(v => !v);
      } else if (e.key.toLowerCase() === 'h') {
        setWireHalo(v => !v);
      } else if (e.key.toLowerCase() === 't') {
        setAutoTidy(v => !v);
      } else if (e.key.toLowerCase() === 'x') {
        console.log('X key pressed, toggling scissors mode');
        setQuickTool(current => {
          const newTool = current === 'scissors' ? null : 'scissors';
          console.log('QuickTool changed from', current, 'to', newTool);
          return newTool;
        });
      } else if (e.key.toLowerCase() === 'v') {
        // Toggle Voltage Pen tester
        setQuickTool(current => (current === 'pen' ? null : 'pen'));
        setPenHoverWireId(null);
      } else if (e.key === ' ') {
        e.preventDefault();
        console.log('Space key pressed');
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === ' ') {
        console.log('Space key released');
        setSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [undo, redo, duplicateSelection, clearSelection, quickTool]);

  // Delete/Backspace removes selection when focus isn't in a text input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          removeSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeSelected]);

  // --- Probe marker visuals ---
  function renderProbeMarker(tid, color, label) {
    const pos = terminalAbsPosById(components, tid);
    if (!pos) return null;
    return (
      <g key={`probe-${label}`} pointerEvents="none" filter="url(#probeGlow)">
  <circle cx={pos.x} cy={pos.y} r={PROBE_R + 3} fill="#ffffff" opacity="0.95" />
        <circle cx={pos.x} cy={pos.y} r={PROBE_R} fill={color} stroke="#111827" strokeWidth="1.5" />
        <text x={pos.x} y={pos.y + 4}
              fontSize="10" textAnchor="middle"
              fill="#ffffff" style={{fontWeight:600}}>
          {label}
        </text>
      </g>
    );
  }

  // State import/export functions
  const exportState = () => {
    return JSON.stringify({ components, wires }, null, 2);
  };

  const importState = (json) => {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data.components) && Array.isArray(data.wires)) {
  setComponents(data.components);
  setWires(data.wires);
  clearSelection();
  setPending(null);
        // Reset probe state
        setProbeA(null);
        setProbeB(null);
        setProbePick(null);
      } else {
        alert("Invalid state format.");
      }
    } catch (e) {
      alert("Error parsing JSON: " + e.message);
    }
  };

  // Convenience getters for supply terminals (assumes first supply)
  const supply = components.find((c) => c.type === ComponentTypes.SUPPLY);
  const supplyL = supply ? termIdByName(supply, "L") : null;
  const supplyN = supply ? termIdByName(supply, "N") : null;
  const supplyE = supply ? termIdByName(supply, "E") : null;

  const adj = useMemo(() => buildAdjacency(components, wires), [components, wires]);

  // --------- Simulation & checks ---------
  const analysis = useMemo(() => {
    const results = { shorts: [], lamps: [], earth: [], ring: {}, spurs: [], wireIssues: [], neShort: false };
    if (!supply) return results;

    const reachFrom = (tid) => bfs(adj, tid);
    const reachL = supplyL ? reachFrom(supplyL) : new Set();
    const reachN = supplyN ? reachFrom(supplyN) : new Set();
    const reachE = supplyE ? reachFrom(supplyE) : new Set();

    if (supplyL && reachL.has(supplyN)) results.shorts.push({ between: "L–N", path: true });
    if (supplyL && reachL.has(supplyE)) results.shorts.push({ between: "L–E", path: true });

    // NEW: detect Neutral–Earth path (warn-level by default)
    const neShort = supplyN && reachN.has(supplyE);
    if (neShort) {
      // keep as a separate flag (not in results.shorts) so "fun deaths" can decide
      results.neShort = true;
    }

    // --- Stricter ring/spur validator ---
    const msg = [];
    const gLw = buildWeightedSubgraph(components, wires, LineTermTypes, 'L');
    const gNw = buildWeightedSubgraph(components, wires, NeutralTermTypes, 'N');
    const gEw = buildWeightedSubgraph(components, wires, EarthTermTypes, 'E');

    const ringL = hasCycleThrough(gLw, supplyL);
    const ringN = hasCycleThrough(gNw, supplyN);
    const ringE = hasCycleThrough(gEw, supplyE);

    results.ring = { L: ringL, N: ringN, E: ringE };

    // Consistency across conductors
    if (ringL && !ringN) msg.push("Ring present on Line but not Neutral.");
    if (ringL && !ringE) msg.push("Ring present on Line but not Earth (CPC).");

    // Identify which line component (connected set) is the 'ring side'
    const ringReachL = bfsSet(gLw, supplyL);

    // Socket classification
    const ringSockets = [];
    const spurSockets = [];
    const isolatedSockets = [];
    for (const c of components) {
      const tids = socketLineTermIds(c);
      if (tids.length === 0) continue;

      const inRing = tids.filter(tid => ringReachL.has(tid) && degreeIn(gLw, tid) > 0);
      if (inRing.length >= 2) {
        ringSockets.push(c);
      } else if (inRing.length === 1) {
        spurSockets.push(c);
      } else {
        // not touching ring component at all
        const deg = tids.reduce((s,tid)=> s + degreeIn(gLw, tid), 0);
        if (deg > 0) spurSockets.push(c); else isolatedSockets.push(c);
      }
    }

    // Spur-off-spur heuristic: sockets not in ring whose *line* connected component
    // (within gLw) contains >1 socket → branch/chain of accessories off the ring.
    function socketsInSameComponent(startTid) {
      const seen = bfsSet(gLw, startTid);
      const ids = new Set(seen);
      return components.filter(cx => socketLineTermIds(cx).some(t => ids.has(t)));
    }
    const spurChains = [];
    for (const s of spurSockets) {
      const tids = socketLineTermIds(s);
      const t = tids.find(tid => degreeIn(gLw, tid) > 0); // any connected line node
      if (!t) continue;
      const members = socketsInSameComponent(t);
      if (members.length > 1) spurChains.push({ anchor: s, members: members.map(m => m.label) });
    }

    // Build messages
    if (results.neShort) {
      msg.push("Fault detected: Neutral–Earth (N–E). Likely RCD trip / touch voltage hazard.");
    }
    if (!ringL) msg.push("No Line ring detected.");
    if (!ringN) msg.push("No Neutral ring detected.");
    if (!ringE) msg.push("No Earth ring detected.");

    if (spurSockets.length) {
      msg.push(`Spurs detected: ${spurSockets.map(s=>s.label).join(", ")}.`);
    }
    if (isolatedSockets.length) {
      msg.push(`Isolated sockets (not connected to Line ring): ${isolatedSockets.map(s=>s.label).join(", ")}.`);
    }
    for (const sc of spurChains) {
      msg.push(`Spur branch with multiple accessories near ${sc.anchor.label}: ${sc.members.join(" → ")}.`);
    }

    // --- Learning/Assessment: wire size checks ---
    const sizeMsgs = [];
    wires.forEach(w => {
      const ta = terminalById(components, w.a);
      const tb = terminalById(components, w.b);
      if (!ta || !tb) return;
      const req = wireRequiredMinCSA(components, w, region);
      const ok = !(w.sizeMm2 && req && w.sizeMm2 + 1e-6 < req);
      if (!ok) {
        const from = `${ta.comp.label || ta.comp.type}`;
        const to = `${tb.comp.label || tb.comp.type}`;
        sizeMsgs.push(`Wire ${w.label || ''} between ${from} and ${to} is undersized: needs ≥ ${req} mm²`);
      }
    });
    if (sizeMsgs.length) msg.push(...sizeMsgs.map(s=>`Cable sizing: ${s}`));

    results.validator = { messages: msg, spurSockets: spurSockets.map(s=>s.id), isolatedSockets: isolatedSockets.map(s=>s.id) };

    for (const c of components) {
      if (c.type !== ComponentTypes.LAMP) continue;
      const lId = termIdByName(c, "L");
      const nId = termIdByName(c, "N");
      const eId = termIdByName(c, "E");
      const on = !!(lId && nId && reachL.has(lId) && reachN.has(nId) && results.shorts.length === 0);
      const eok = !!(eId && reachE.has(eId));
      results.lamps.push({ id: c.id, on });
      results.earth.push({ id: c.id, ok: eok });
    }

    // Earth continuity: evaluate any device that has an Earth terminal (excl. lamps already handled)
    for (const c of components) {
      if (c.type === ComponentTypes.LAMP) continue;
      const eTerms = c.terminals.filter((t) => t.t === TerminalTypes.E);
      if (eTerms.length > 0) {
        const ok = eTerms.some((t) => reachE.has(t.id));
        results.earth.push({ id: c.id, ok });
      }
    }

    return results;
  }, [adj, components, supply, supplyL, supplyN, supplyE, region, wires]);

  // Quick fault summary for the death overlay
  const deathSummary = useMemo(() => {
    const msgs = [];

    // Helper: find first edge beyond start in path between start and goal in the global graph
    const firstLinkDesc = (start, goal) => {
      if (!start || !goal || !adj) return null;
      // BFS with prev to reconstruct a minimal hop path (unweighted)
      const q = [start];
      const prev = new Map([[start, null]]);
      while (q.length) {
        const v = q.shift();
        if (v === goal) break;
        const nbrs = adj.get(v) || new Set();
        for (const u of nbrs) {
          if (!prev.has(u)) { prev.set(u, v); q.push(u); }
        }
      }
      if (!prev.has(goal)) return null;
      const path = [];
      for (let v = goal; v != null; v = prev.get(v)) { path.push(v); if (v === start) break; }
      path.reverse();
      if (path.length < 2) return null;
      const a = path[0], b = path[1];
      const wire = wires.find(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
      const ta = terminalById(components, a);
      const tb = terminalById(components, b);
      if (wire) {
        const wl = wire.label || `${wire.kind} ${wire.id.slice(-4)}`;
        // Prefer a nearby component name for context
        const near = (ta?.comp?.label || ta?.comp?.type || '');
        return `wire “${wl}”${near ? ` near ${near}` : ''}`;
      }
      // Likely an internal link within a component
      if (ta?.comp && tb?.comp && ta.comp.id === tb.comp.id) {
        const nmA = ta.term?.name || '';
        const nmB = tb.term?.name || '';
        const cl = ta.comp.label || ta.comp.type;
        return `internal link in ${cl}${nmA && nmB ? ` (${nmA}↔${nmB})` : ''}`;
      }
      // Fallback: name the next component/terminal
      const nextName = tb?.comp?.label || tb?.comp?.type || 'component';
      return `via ${nextName}`;
    };

    if (analysis.shorts?.some(s => s.between === "L–N")) {
      const d = firstLinkDesc(supplyL, supplyN);
      msgs.push(`Short: Line–Neutral (L–N)${d ? ` — first link: ${d}` : ''}`);
    }
    if (analysis.shorts?.some(s => s.between === "L–E")) {
      const d = firstLinkDesc(supplyL, supplyE);
      msgs.push(`Short: Line–Earth (L–E)${d ? ` — first link: ${d}` : ''}`);
    }
    if (analysis.neShort) {
      const d = firstLinkDesc(supplyN, supplyE);
      msgs.push(`Fault: Neutral–Earth (N–E)${d ? ` — first link: ${d}` : ''}`);
    }
    const undersized = (analysis.validator?.messages || []).filter(m => m.toLowerCase().includes('undersized'));
    if (undersized.length) msgs.push("Cable sizing: undersized conductors present");
    return msgs;
  }, [analysis, adj, components, wires, supplyL, supplyN, supplyE]);

  // Danger detection and "You Died" trigger
  useEffect(() => {
    if (!funDeathsEnabled) return;
    
    // Check for dangerous conditions
    const hasDangerousShort = analysis.shorts.some(s => s.between === 'L–E' || s.between === 'L–N');
  const hasUndersizedWires = analysis.validator?.messages?.some(m => m.includes('undersized')) || false;
    const hasCriticalIssues = analysis.validator?.messages?.length > 3; // Multiple issues
  const neIsDeadly = funDeathsTreatNEAsDeadly && analysis.neShort;
  const isDangerous = hasDangerousShort || neIsDeadly || (hasUndersizedWires && hasCriticalIssues);

    // Track last safe state (no dangerous conditions)
    if (!isDangerous && (components.length > 1 || wires.length > 0)) {
      lastSafeRef.current = { components: [...components], wires: [...wires] };
    }

    // Trigger overlay for dangerous conditions unless snoozed for this graph state
    if (isDangerous) {
      const snoozedFor = deathSnoozeRef.current;
      const snoozeActive = snoozedFor && snoozedFor === dangerHash;
      if (!snoozeActive && !youDiedOpen) setYouDiedOpen(true);
    } else {
      // clear snooze when safe again
      deathSnoozeRef.current = null;
    }
  }, [analysis, components, wires, funDeathsEnabled, funDeathsTreatNEAsDeadly, youDiedOpen, dangerHash]);

  // Quick-test reach sets for L/N/E families (used by voltage pen)
  const reachSets = useMemo(() => {
    const reach = (g, s) => bfsSet(g, s);
    const gL = buildTypedSubgraph(components, wires, LineTermTypes);
    const gN = buildTypedSubgraph(components, wires, NeutralTermTypes);
    const gE = buildTypedSubgraph(components, wires, EarthTermTypes);
    const rL = supplyL ? reach(gL, supplyL) : new Set();
    const rN = supplyN ? reach(gN, supplyN) : new Set();
    const rE = supplyE ? reach(gE, supplyE) : new Set();
    return { rL, rN, rE };
  }, [components, wires, supplyL, supplyN, supplyE]);

  // --------- UI helpers ---------

  const onTerminalClick = (tid) => {
    if (quickTool) return; // disable wiring while quick tool active
    // --- Probe pick takes priority over wiring ---
    if (probePick) {
      if (probePick === 'A') setProbeA(tid);
      else setProbeB(tid);
      setProbePick(null);
      return;
    }

    // --- Bundle mode workflow ---
    if (bundleMode) {
      if (!bundlePending) {
        // First terminal clicked - start bundle
        const preset = CablePresets[bundleMode];
        if (preset && preset.cores) {
          setBundlePending({ from: tid, preset });
        }
      } else {
        // Second terminal clicked - complete bundle
        const { from, preset } = bundlePending;
        if (from !== tid && preset && preset.cores) {
          pushHistory();
          
          // Find the components that contain these terminals
          const fromComp = components.find(c => c.terminals.some(t => t.id === from));
          const toComp = components.find(c => c.terminals.some(t => t.id === tid));
          
          if (fromComp && toComp) {
            const newWires = preset.cores.map(core => {
              // Map conductor kind to terminal type
              let terminalType;
              if (core.kind === ConductorKinds.L) terminalType = TerminalTypes.L;
              else if (core.kind === ConductorKinds.N) terminalType = TerminalTypes.N;
              else if (core.kind === ConductorKinds.E) terminalType = TerminalTypes.E;
              else terminalType = TerminalTypes.L; // fallback
              
              // Find matching terminals on both components
              const fromTerminal = fromComp.terminals.find(t => t.t === terminalType) || fromComp.terminals.find(t => t.id === from);
              const toTerminal = toComp.terminals.find(t => t.t === terminalType) || toComp.terminals.find(t => t.id === tid);
              // Size per core: honor any fixed size on the preset, else derive from bundleSize (with CPC reduction for T&E)
              const lineSize = bundleSize;
              let coreSize = core.fixedSizeMm2 ?? (core.kind === ConductorKinds.E && preset.family === 'T&E' ? cpcSizeForBundle(lineSize) : lineSize);
              const ampacityA = getAmpacity(coreSize);
              const label = `${formatSize(coreSize)} ${preset.family || 'Cable'}`;

              return {
                id: newId(),
                a: fromTerminal.id,
                b: toTerminal.id,
                kind: core.kind,
                fault: null,
                bundle: preset.name,
                sizeMm2: coreSize,
                ampacityA,
                cableType: preset.family || 'Cable',
                label
              };
            });
            setWires(ws => [...ws, ...newWires]);
          }
        }
        // Clear pending but keep bundle mode active for more cables
        setBundlePending(null);
        // Don't clear bundleMode - let user create multiple bundles
      }
      return;
    }

    // Handle wire connections
    if (pending && pending === tid) {
      setPending(null);
      return;
    }
    if (!pending) {
      setPending(tid);
    } else {
      if (
        pending !== tid &&
        !wires.some((w) => (w.a === pending && w.b === tid) || (w.a === tid && w.b === pending))
      ) {
        // Learning mode: require size selection first
        if (simMode === 'learning' && !currentWireSize) {
          alert('Choose a wire size before drawing (e.g. 1.0, 1.5, 2.5, 6.0 mm²)');
          setPending(null);
          return;
        }
        pushHistory();
        const sizeMm2 = currentWireSize || 2.5;
        const ampacityA = getAmpacity(sizeMm2);
        const label = `${formatSize(sizeMm2)} ${currentCableType}`;
  const tempWire = { id: 'TEMP', a: pending, b: tid, kind: currentKind, sizeMm2 };
  const req = wireRequiredMinCSA(components, tempWire, region);
        if (simMode === 'learning' && req && sizeMm2 + 1e-6 < req) {
          const ta = terminalById(components, pending);
          const tb = terminalById(components, tid);
          const from = ta?.comp?.label || ta?.comp?.type || 'Device';
          const to = tb?.comp?.label || tb?.comp?.type || 'Device';
          alert(`Incorrect: ${from} → ${to} should use ≥ ${req} mm² (picked ${sizeMm2} mm²). For sockets, use 2.5 mm².`);
        }
  setWires((ws) => [...ws, { id: newId(), a: pending, b: tid, kind: currentKind, fault: null, sizeMm2, ampacityA, cableType: currentCableType, label, lengthM: defaultLengthM }]);
      }
      setPending(null);
    }
  };

  const recolourSelectedWire = (kind) => {
    if (selection.wires.length !== 1) return;
    const targetId = selection.wires[0];
    pushHistory();
    setWires((ws) => ws.map((w) => (w.id === targetId ? { ...w, kind } : w)));
  };

  const toggleSwitch = (c) => {
    setComponents((cs) =>
      cs.map((x) => {
        if (x.id !== c.id) return x;
        if (x.type === ComponentTypes.SWITCH_1WAY) return { ...x, state: { on: !x.state.on } };
        if (x.type === ComponentTypes.SWITCH_2WAY) return { ...x, state: { pos: x.state.pos === 0 ? 1 : 0 } };
        if (x.type === ComponentTypes.SWITCH_INTERMEDIATE)
          return { ...x, state: { pos: x.state.pos === 0 ? 1 : 0 } };
        return x;
      })
    );
  };

  const onComponentToggle = (componentId) => {
    setComponents((cs) =>
      cs.map((x) => {
        if (x.id !== componentId) return x;
        if (x.type === ComponentTypes.CCU_45A) return { ...x, state: { on: !x.state?.on } };
        // Add other toggleable component types here if needed
        return x;
      })
    );
  };

  const onMouseDownComponent = (c, evt) => {
    const { x: mx, y: my } = toWorld(evt);
    const multi = selection.components.includes(c.id) && selection.components.length > 1;
    if (multi) {
      // store per-component offsets
      const offsets = selection.components.map(cid => {
        const cc = components.find(k => k.id === cid);
        return { id: cid, dx: mx - (cc?.x ?? 0), dy: my - (cc?.y ?? 0) };
      });
      setDrag({ id: c.id, dx: mx - c.x, dy: my - c.y, mode: 'multi', offsets });
    } else {
      setDrag({ id: c.id, dx: mx - c.x, dy: my - c.y, mode: 'single' });
    }
  };

  // Drag a terminal on a specific component (used for junction endpoints)
  const onMouseDownTerminal = (compId, termId, evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  // const start = toWorld(evt); // unused
    const comp = components.find(c => c.id === compId);
    if (!comp) return;
    const term = comp.terminals.find(t => t.id === termId);
    if (!term) return;
    const startDX = term.dx;
    const startDY = term.dy;
    let moved = false;
    const move = (e) => {
      if (e && e.cancelable) e.preventDefault();
      const p = toWorld(e);
      // We want absolute follow: set dx/dy so terminal lands under cursor
      const targetDX = p.x - comp.x;
      const targetDY = p.y - comp.y;
      if (Math.abs(targetDX - startDX) + Math.abs(targetDY - startDY) > 0.5) moved = true;
      setComponents(cs => cs.map(c => {
        if (c.id !== compId) return c;
        const terms = c.terminals.map(t => t.id === termId ? { ...t, dx: targetDX, dy: targetDY } : t);
        return { ...c, terminals: terms };
      }));
    };
    const up = (e) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);

      // Determine drop intent (attach to terminal or splice into wire)
      const p = toWorld(e);
      const SNAP_PX = 14; // proximity threshold in screen/world px

      // Helper: find nearest terminal id within tolerance (excluding the dragged one)
      const nearestTerminal = () => {
        let best = null;
        for (const c of components) {
          for (const t of c.terminals) {
            const tid = t.id;
            if (tid === termId) continue; // skip self
            const pos = terminalAbsPosById(components, tid);
            if (!pos) continue;
            const d = Math.hypot(pos.x - p.x, pos.y - p.y);
            if (d <= SNAP_PX && (!best || d < best.d)) best = { tid, d };
          }
        }
        return best;
      };

      // Helper: find wire under drop point
      const nearestWireHit = () => {
        const hit = hitTestWireAtPoint(wires, components, { x: p.x, y: p.y }, 12);
        // Avoid splicing the same wire that already uses this terminal
        if (!hit) return null;
        const connectedIds = new Set(wires.filter(w => w.a === termId || w.b === termId).map(w => w.id));
        if (connectedIds.has(hit.wireId)) return null;
        return hit;
      };

      // Evaluate targets
      const tHit = nearestTerminal();
      const wHit = tHit ? null : nearestWireHit(); // prefer terminal over wire

      // If anything changed (dragged, attached, spliced), push one history entry
      const needHistory = moved || !!tHit || !!wHit;
      if (needHistory) pushHistory();

      if (tHit) {
        // Rewire any wires connected to this dragged terminal to the target terminal
        const targetTid = tHit.tid;
        setWires(ws => ws.map(w =>
          w.a === termId ? { ...w, a: targetTid } : (w.b === termId ? { ...w, b: targetTid } : w)
        ));
        // Break the internal short in the original junction so the two ends are no longer auto-bridged
        setComponents(cs => cs.map(c => {
          if (c.id !== compId) return c;
          const hiddenHandleIds = Array.isArray(c.hiddenHandleIds) ? c.hiddenHandleIds : [];
          return { ...c, internalLinks: [], hiddenHandleIds: [...new Set([...hiddenHandleIds, termId])] };
        }));
      } else if (wHit) {
        // Splice into the target wire by cutting it and inserting a new hidden junction
        const targetWire = wires.find(ww => ww.id === wHit.wireId);
        if (targetWire) {
          const res = cutWireAt(targetWire, { x: wHit.hitPoint.x, y: wHit.hitPoint.y }, { createVisibleJunction: false });
          // Add the new junction and replace target wire with two new wires
          setComponents(cs => [...cs, { ...res.junction, hidden: true, showHandles: false }]);
          setWires(ws => {
            // First, replace the target wire with new segments
            let next = ws.filter(w => w.id !== res.removedWireId);
            next.push(...res.newWires);
            // Then, rewire the dragged endpoint to one terminal of the new junction (use first terminal)
            const joinTid = res.junction.terminals[0].id;
            next = next.map(w => w.a === termId ? { ...w, a: joinTid } : (w.b === termId ? { ...w, b: joinTid } : w));
            return next;
          });
          // Break internal link on the original junction and hide this handle
          setComponents(cs => cs.map(c => {
            if (c.id !== compId) return c;
            const hiddenHandleIds = Array.isArray(c.hiddenHandleIds) ? c.hiddenHandleIds : [];
            return { ...c, internalLinks: [], hiddenHandleIds: [...new Set([...hiddenHandleIds, termId])] };
          }));
        }
      }
      // Otherwise: just a drag move (already applied in move handler)
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  };

  const onMouseMoveSVG = (evt) => {
    // Handle scissors hover tracking even when not dragging
    if (quickTool === 'scissors') {
      const { x: mx, y: my } = toWorld(evt);
      const hit = hitTestWireAtPoint(wires, components, { x: mx, y: my }, 18);
      if (hit) {
        setScissorsHoverPoint({ x: hit.hitPoint.x, y: hit.hitPoint.y, wireId: hit.wireId });
        console.log('Scissors hover hit:', hit);
      } else {
        setScissorsHoverPoint(null);
      }
    } else {
      setScissorsHoverPoint(null);
    }
    
    if (!drag && !marquee) return;
    const { x: mx, y: my } = toWorld(evt);
    if (drag) {
      if (drag.mode === 'multi' && drag.offsets) {
        setComponents(cs => cs.map(c => {
          const o = drag.offsets.find(v => v.id === c.id);
          if (!o) return c;
          let x = mx - o.dx, y = my - o.dy;
          if (snapToGrid) { x = Math.round(x / gridSize) * gridSize; y = Math.round(y / gridSize) * gridSize; }
          return { ...c, x, y };
        }));
      } else {
        let x = mx - drag.dx, y = my - drag.dy;
        if (snapToGrid) { x = Math.round(x / gridSize) * gridSize; y = Math.round(y / gridSize) * gridSize; }
        setComponents((cs) => cs.map((c) => (c.id === drag.id ? { ...c, x, y } : c)));
      }
      return;
    }
    // marquee
    if (marquee) {
      setMarquee(m => ({ ...m, x1: mx, y1: my }));
    }
  };

  const onMouseUpSVG = () => {
    if (marquee) {
      const { x0, y0, x1, y1 } = marquee;
      const minx = Math.min(x0, x1), maxx = Math.max(x0, x1);
      const miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
      // components intersecting rect
      const compIds = components
        .filter(c => {
          const w = (c.type.startsWith("CONNECTOR") || c.type.startsWith("WAGO")) ? 150 : 150;
          const h = (c.type.startsWith("CONNECTOR") || c.type.startsWith("WAGO")) ? 120 : 110;
          return !(c.x > maxx || c.x + w < minx || c.y > maxy || c.y + h < miny);
        })
        .map(c => c.id);
      // wires with both endpoints inside
      const wireIds = wires.filter(w => {
        const pa = terminalAbsPosById(components, w.a);
        const pb = terminalAbsPosById(components, w.b);
        const ina = pa && pa.x >= minx && pa.x <= maxx && pa.y >= miny && pa.y <= maxy;
        const inb = pb && pb.x >= minx && pb.x <= maxx && pb.y >= miny && pb.y <= maxy;
        return ina && inb;
      }).map(w => w.id);
      setSelection({ components: compIds, wires: wireIds });
      setMarquee(null);
    }
    setDrag(null);
  };

  // Wire rendering helper
  const renderWire = (w) => {
    const a = terminalById(components, w.a);
    const b = terminalById(components, w.b);
    if (!a || !b) return null;
    const pa = componentTerminalAbsPos(a.comp, a.term);
    const pb = componentTerminalAbsPos(b.comp, b.term);
    // Base style from logical kind (GEN/L/N/E)
    const style = ConductorStyle[w.kind || ConductorKinds.GEN];
    const isSel = isSelected("wire", w.id);
    // Thickness modulated by wire size (slight visual cue)
    const baseSW = isSel ? Math.max(6, wireThickness) : wireThickness;
    const sw = Math.max(2, Math.round(baseSW * sizeFactor(w.sizeMm2)));
    const faultDash = w.fault==='open' ? "2 6" : w.fault==='hr' ? "6 3" : style.dash;
    
    // Calculate curve control point
    const cpx = (pa.x + pb.x) / 2;
    const baseBow = autoTidy ? ((pa.x < pb.x ? 1 : -1) * 10) : 0;
    const cpy = (pa.y + pb.y) / 2 + baseBow + (w.ctrl || 0);
    // Helper: evaluate quadratic Bezier point at t
    const qAt = (t) => {
      const mt = 1 - t;
      const x = mt*mt*pa.x + 2*mt*t*cpx + t*t*pb.x;
      const y = mt*mt*pa.y + 2*mt*t*cpy + t*t*pb.y;
      return { x, y };
    };
    // If switched-live marker is present: render visually as neutral body with brown sleeves
    const isSwitchedLive = !!w.switchedLive;
    if (w.switchedLive) {
      console.log('Rendering switched live wire:', w.id, { switchedLive: w.switchedLive, kind: w.kind });
    }
    const bodyStroke = isSwitchedLive ? ConductorStyle[ConductorKinds.N].stroke : style.stroke;
    const sleeveStroke = ConductorStyle[ConductorKinds.L].stroke; // brown
    // sleeve length along curve (fractional). Slightly longer for thicker wires
    const undersized = isWireUndersized(components, w, region);
    const tSleeve = Math.min(0.18, 0.08 + (sw / 50));
    return (
      <g
        key={w.id}
        onClick={(e) => {
          if (quickTool === 'scissors') return; // ignore selection while cutting
          if (e.shiftKey) toggleSelection("wire", w.id);
          else replaceSelection("wire", w.id);
        }}
        filter={isSel ? "url(#selGlow)" : undefined}
        style={{ cursor: quickTool==='scissors' ? 'crosshair' : 'pointer' }}
      >
        {/* Tooltip on hover with size/ampacity */}
        <title>{`${w.label || ''}${w.label ? ' — ' : ''}${w.ampacityA ? `Ampacity ${w.ampacityA} A` : ''}${undersized ? ' — ⚠ undersized' : ''}`}</title>
        {wireHalo && (
          <path 
            d={`M${pa.x},${pa.y} Q${cpx},${cpy} ${pb.x},${pb.y}`} 
            strokeWidth={sw + 4} 
            stroke="#ffffff" 
            strokeOpacity={0.9} 
            strokeLinecap="round" 
            fill="none" 
          />
        )}
        <path
          d={`M${pa.x},${pa.y} Q${cpx},${cpy} ${pb.x},${pb.y}`}
          strokeWidth={sw}
          stroke={bodyStroke}
          strokeDasharray={faultDash}
          strokeLinecap="round"
          fill="none"
          data-wire-kind={w.kind}
          data-stroke={bodyStroke}
          onMouseEnter={() => { if (quickTool==='pen') setPenHoverWireId(w.id); }}
          onMouseLeave={() => { if (penHoverWireId===w.id) setPenHoverWireId(null); }}
        />
        {/* Optional length annotation */}
        {showWireLengths && (
          <g>
            <rect x={cpx-22} y={cpy-20} width={44} height={14} rx={3} fill="#ffffff" stroke="#cbd5e1" />
            <text x={cpx} y={cpy-10} fontSize={10} textAnchor="middle" fill="#374151">{(w.lengthM ?? (Math.hypot(pb.x-pa.x, pb.y-pa.y)/PX_PER_M)).toFixed(1)} m</text>
          </g>
        )}
        {undersized && (
          <path
            d={`M${pa.x},${pa.y} Q${cpx},${cpy} ${pb.x},${pb.y}`}
            strokeWidth={Math.max(2, Math.floor(sw/2))}
            stroke="#ef4444"
            strokeDasharray="6 4"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />
        )}
        {isSwitchedLive && (
          <g>
            {/* Brown sleeves near both ends to indicate re-identified neutral used as live */}
            {(() => {
              const p1 = qAt(tSleeve);
              return (
                <path
                  d={`M${pa.x},${pa.y} L${p1.x},${p1.y}`}
                  strokeWidth={sw}
                  stroke={sleeveStroke}
                  strokeLinecap="round"
                  fill="none"
                />
              );
            })()}
            {(() => {
              const t = 1 - tSleeve;
              const p2 = qAt(t);
              return (
                <path
                  d={`M${pb.x},${pb.y} L${p2.x},${p2.y}`}
                  strokeWidth={sw}
                  stroke={sleeveStroke}
                  strokeLinecap="round"
                  fill="none"
                />
              );
            })()}
          </g>
        )}
        {/* Midpoint handle for quick re-route (only when selected) */}
        {isSel && !quickTool && (
          <circle
            cx={cpx} cy={cpy} r={6}
            fill="#ffffff" stroke="#2563eb" strokeWidth={2}
            onMouseDown={(e) => {
              e.stopPropagation();
              const start = toWorld(e);
              const startCtrl = w.ctrl || 0;
              const move = (ev) => {
                const p = toWorld(ev);
                const dy = p.y - start.y;
                setWires(ws => ws.map(ww => ww.id === w.id ? { ...ww, ctrl: startCtrl + dy } : ww));
              };
              const up = () => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up);
            }}
          />
        )}
      </g>
    );
  };

  // YouDiedModal component
  const YouDiedModal = ({ open, onClose, onReset, onUndoToLastSafe, onViewIssues, summary }) => {
    useEffect(() => {
      if (!open) return;
      const onKey = (e) => e.key === 'Escape' && onClose();
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;
    return (
      <div className="ydied-backdrop" role="dialog" aria-modal="true" style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div className="ydied-card" style={{
          background: '#1a1a1a',
          color: '#ff5555',
          maxWidth: '520px',
          width: '92%',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          textAlign: 'center',
          border: '2px solid #ff5555'
        }}>
          <div style={{
            fontSize: '48px',
            letterSpacing: '0.2em',
            fontWeight: '800',
            marginBottom: '12px',
            textShadow: '0 0 20px #ff5555'
          }}>YOU DIED</div>
          <p style={{
            color: '#ffdddd',
            margin: '0 0 24px',
            fontSize: '18px'
          }}>⚡ A hazardous electrical fault was detected! This could be fatal in real life.</p>
          {Array.isArray(summary) && summary.length > 0 && (
            <ul style={{ textAlign:'left', margin:'0 0 16px', color:'#ffdddd' }}>
              {summary.slice(0,3).map((s, i) => (
                <li key={i} style={{ fontSize: 14, lineHeight: 1.35 }}>• {s}</li>
              ))}
            </ul>
          )}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <button 
              className="btn-primary"
              onClick={onUndoToLastSafe}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: '2px solid #ff5555',
                background: '#441111',
                color: '#ffdddd',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}>
              ↶ Undo to Last Safe
            </button>
            <button 
              onClick={onViewIssues}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: '1px solid #999',
                background: '#333',
                color: '#eee',
                cursor: 'pointer',
                fontSize: '16px'
              }}>
              🔍 View Issues
            </button>
            <button 
              onClick={onReset}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: '1px solid #999',
                background: '#333',
                color: '#eee',
                cursor: 'pointer',
                fontSize: '16px'
              }}>
              🔄 Reset Circuit
            </button>
            <button 
              onClick={onClose}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: '1px solid #666',
                background: 'transparent',
                color: '#ccc',
                cursor: 'pointer',
                fontSize: '16px'
              }}>
              ✕ Close
            </button>
          </div>
          <p style={{
            fontSize: '12px',
            color: '#999',
            marginTop: '16px',
            fontStyle: 'italic'
          }}>⚠️ Educational simulation only. Never attempt real electrical work without proper training and certification.</p>
        </div>
      </div>
    );
  };

  // ---------- Render ----------
  const themeCSS = `
    .app-light { 
      --bg: #f5f7fb; 
      --text: #0f172a;
      --panel-bg: rgba(255,255,255,0.78);
      --panel-border: #e2e8f0;
      --grid-dot: #cbd5e1;
      --vignette-color: #000000;
      --vignette-opacity: 0.06;
      --btn-bg: #ffffff;
      --btn-bg-hover: #f8fafc;
      --btn-border: #e2e8f0;
      --btn-text: #0f172a;
    }
    .app-dark {
      --bg: #0b0f1a; 
      --text: #e5e7eb;
      --panel-bg: rgba(17,24,39,0.86);
      --panel-border: #3b4758;
      --grid-dot: #374151;
      --vignette-color: #ffffff;
      --vignette-opacity: 0.07;
      --btn-bg: #1f2937;
      --btn-bg-hover: #2b3646;
      --btn-border: #475569;
      --btn-text: #e5e7eb;
    }
    /* Themed buttons inside panels: only change background so variant colors (e.g., danger) remain visible */
    .app-dark .themed-panel button { 
      background: var(--btn-bg) !important; 
    }
    .app-dark .themed-panel button:hover { 
      background: var(--btn-bg-hover) !important; 
    }
    /* Neutral buttons: align border/text with theme in dark mode without touching danger variants */
    .app-dark .themed-panel .neutral-btn { 
      border-color: var(--btn-border) !important; 
      color: var(--btn-text) !important; 
    }
  `;
  return (
    <div className={`min-h-screen ${darkMode ? 'app-dark' : 'app-light'}`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Disclaimer Gate */}
      {!ackDisclaimer && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="max-w-xl w-full rounded-2xl shadow-lg p-5 themed-panel" style={{ background: 'var(--panel-bg)', boxShadow: '0 0 0 1px var(--panel-border)' }}>
            <h2 className="text-lg font-semibold mb-2">Safety & Disclaimer</h2>
            <div className="text-sm text-slate-700 space-y-2">
              <p>This app is a fun, educational, interactive tool only. It simplifies complex topics and may be inaccurate or incomplete.</p>
              <p><strong>Do not rely on it for real work.</strong> Electrical work can be dangerous and is regulated. If in doubt, always consult a qualified, certified professional and follow local regulations (e.g., BS 7671, Building Regulations Part P).</p>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded border neutral-btn bg-white px-3 py-1.5 text-sm"
                onClick={() => { window.location.href = 'https://niceic.com/'; }}
              >Decline</button>
              <button
                className="rounded border border-green-600 bg-green-600 text-white px-3 py-1.5 text-sm"
                onClick={() => { try { localStorage.setItem('wirelab_disclaimer_v1', 'yes'); } catch {} setAckDisclaimer(true); }}
              >I Understand</button>
            </div>
          </div>
        </div>
      )}
      {/* Custom CSS for slider styling and theme */}
      <style dangerouslySetInnerHTML={{ __html: sliderStyle + "\n" + cursorCSS + "\n" + themeCSS }} />
      
      {/* Banner Section */}
      <div className="flex justify-center px-4 py-2">
        <div className="w-full max-w-7xl h-20 md:h-28 lg:h-32 overflow-hidden rounded-lg">
          <img
            src={bannerImg}
            alt="Banner"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
      
  {/* Mobile quick controls */}
  <div className="px-4 pt-2 pb-0 md:hidden">
    <div className="flex items-center justify-end gap-2">
      <button
        className="text-xs px-2 py-1 rounded border neutral-btn bg-white hover:bg-slate-50"
        onClick={() => setCollapsedFor([...LEFT_SECTION_IDS, ...RIGHT_SECTION_IDS], true)}
      >Hide panels</button>
      <button
        className="text-xs px-2 py-1 rounded border neutral-btn bg-white hover:bg-slate-50"
        onClick={() => setCollapsedFor([...LEFT_SECTION_IDS, ...RIGHT_SECTION_IDS], false)}
      >Show panels</button>
    </div>
  </div>

  {/* Main Content */}
  <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-[360px_1fr] lg:grid-cols-[380px_1fr_360px] items-start font-sans overflow-x-auto">
      {/* Sidebar */}
      <div
        className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] overflow-y-auto lg:pr-2 overscroll-contain backdrop-blur rounded-2xl shadow-sm p-3 w-full min-w-0 md:w-[360px] md:min-w-[360px] lg:w-[380px] lg:min-w-[380px] lg:col-start-1 self-start themed-panel"
        role="region"
        aria-label="Toolbox panel"
        style={{ background: 'var(--panel-bg)', boxShadow: '0 0 0 1px var(--panel-border)' }}
      >
        {/* Panel controls */}
        <div className="flex items-center justify-end mb-2">
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-2 py-1 rounded border neutral-btn bg-white hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => setCollapsedFor(LEFT_SECTION_IDS, true)}
              title="Collapse all sections"
            >
              Collapse all
            </button>
            <button
              className="text-xs px-2 py-1 rounded border neutral-btn bg-white hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => setCollapsedFor(LEFT_SECTION_IDS, false)}
              title="Show all sections"
            >
              Show all
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <Collapsible id="toolbox" title="🔧 Toolbox" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <GroupedToolbox onAdd={addToolboxItem} />
          </Collapsible>

          {/* Quick Test Tools */}
          <Collapsible id="quick-tests" title="🧰 Handy Tools" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="space-y-2 text-sm">
              <button
                className={`w-full rounded-md border px-3 py-2 text-left transition-all ${quickTool==='pen' ? 'border-red-500 bg-red-50 text-red-700 shadow-md' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                onClick={() => {
                  setQuickTool(quickTool === 'pen' ? null : 'pen');
                  setPenHoverWireId(null); // Clear hover state when toggling
                }}
                title="Voltage pen tester (V key): hover over wires to detect if live"
              >
                ⚡ Voltage Pen {quickTool==='pen' ? '(ACTIVE)' : 'Tester'}
              </button>
              <div className="text-xs text-slate-500">Hover over a wire to check if it’s live (Line connected).</div>

              {/* Wire cutters tool */}
              <button
                className={`w-full rounded-md border px-3 py-2 text-left transition-all ${quickTool==='scissors' ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                onClick={() => setQuickTool(quickTool === 'scissors' ? null : 'scissors')}
                title="Click to activate wire cutters (X key)"
              >
                ✂️ Wire Cutters {quickTool === 'scissors' ? '(ACTIVE)' : ''}
              </button>
              <div className="text-xs text-slate-500">Cut wires at the click point. Press X to toggle.</div>
            </div>
          </Collapsible>

          

          {/* Wires */}
          <Collapsible id="wires" title="🧵 Wires" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            {/* Simulation mode */}
            <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
              <label className="inline-flex items-center gap-1 col-span-3">
                <span className="text-slate-600">Mode:</span>
                <select
                  className="flex-1 border rounded px-2 py-1"
                  value={simMode}
                  onChange={(e)=>setSimMode(e.target.value)}
                >
                  <option value="free">Free</option>
                  <option value="learning">Learning</option>
                  <option value="assessment">Assessment</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-1 col-span-3">
                <span className="text-slate-600">Region:</span>
                <select
                  className="border rounded px-2 py-1"
                  value={region}
                  onChange={(e)=>setRegion(e.target.value)}
                >
                  <option value="UK">UK</option>
                  <option value="EU">EU</option>
                </select>
              </label>
            </div>
            {/* Single wire size selection */}
            <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
              <span className="text-slate-600">Wire size/type:</span>
              <div className="flex items-center gap-2">
                <select className="border rounded px-2 py-1"
                        value={currentWireSize}
                        onChange={(e)=>setCurrentWireSize(parseFloat(e.target.value))}>
                  {WIRE_SIZES.map(s=> <option key={s} value={s}>{s} mm²</option>)}
                </select>
                <select className="border rounded px-2 py-1"
                        value={currentCableType}
                        onChange={(e)=>setCurrentCableType(e.target.value)}>
                  <option value="T&E">T&E</option>
                  <option value="Singles">Singles</option>
                  <option value="Flex">Flex</option>
                </select>
                <span className="text-slate-500">{getAmpacity(currentWireSize)} A</span>
              </div>
            </div>
            {/* Default length for new wires */}
            <div className="mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
              <span className="text-slate-600">Default length:</span>
              <input type="number" className="border rounded px-2 py-1 w-20" min="0.1" step="0.1"
                     value={defaultLengthM} onChange={(e)=>setDefaultLengthM(parseFloat(e.target.value)||0)} />
              <span className="text-slate-500">m</span>
            </div>
            <div className="grid grid-cols-2 auto-rows-min gap-2">
              {Object.values(ConductorKinds).map((k) => (
                <button
                  key={k}
                  className={`rounded-2xl ring-1 px-3 py-2 text-left bg-white shadow-sm hover:bg-slate-50 transition ${
                    currentKind === k ? `ring-2 ${conductorRing[k]}` : "ring-slate-200"
                  }`}
                  onClick={() => setCurrentKind(k)}
                >
                  <div className="text-xs opacity-70">{k}</div>
                  <div className="flex items-center gap-2">
                    <Swatch style={ConductorStyle[k]} />
                    <span className="text-sm">{ConductorStyle[k].label}</span>
                  </div>
                </button>
              ))}
            </div>
            {/* Switched live re-identification for selected wire */}
            <div className="mt-3 p-2 rounded-lg bg-slate-50 border border-slate-200">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={selection.wires.length === 1 ? !!wires.find(w=>w.id===selection.wires[0])?.switchedLive : false}
                  disabled={selection.wires.length !== 1}
                  onChange={(e) => {
                    if (selection.wires.length !== 1) return;
                    const id = selection.wires[0];
                    const checked = e.target.checked;
                    console.log('Toggling switched live:', { id, checked, wireCount: selection.wires.length });
                    pushHistory();
                    setWires(ws => {
                      const updated = ws.map(w => {
                        if (w.id !== id) return w;
                        if (checked) {
                          // Mark as switched live; ensure logic is Live
                          console.log('Setting wire as switched live:', w.id);
                          return { ...w, kind: ConductorKinds.L, switchedLive: true };
                        } else {
                          console.log('Removing switched live from wire:', w.id);
                          const { switchedLive, ...rest } = w;
                          return rest;
                        }
                      });
                      console.log('Updated wires:', updated.filter(w => w.switchedLive));
                      return updated;
                    });
                  }}
                />
                <span>
                  Switched live (neutral sleeved brown)
                </span>
              </label>
              <div className="text-[11px] text-slate-500 mt-1">
                Visual only: shows blue body with brown sleeves at ends; treated as Live for checks.
              </div>
            </div>
          </Collapsible>

          

          {/* Cable Bundles */}
          <Collapsible id="cable-bundles" title="📦 Cable Bundles" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="grid grid-cols-[auto_1fr] gap-2 items-center text-xs mb-2">
              <span className="text-slate-600">Bundle core size:</span>
              <div className="flex items-center gap-2">
                <select className="border rounded px-2 py-1"
                        value={bundleSize}
                        onChange={(e)=>setBundleSize(parseFloat(e.target.value))}>
                  {WIRE_SIZES.map(s=> <option key={s} value={s}>{s} mm²</option>)}
                </select>
                <span className="text-slate-500">E core auto {formatSize(cpcSizeForBundle(bundleSize))}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {Object.keys(CablePresets).map((cableType) => {
                const preset = CablePresets[cableType];
                return (
                  <button
                    key={cableType}
                    className={`rounded-xl px-2 py-1 text-xs ring-1 transition ${
                      bundleMode === cableType 
                        ? "ring-2 ring-blue-500 bg-blue-50" 
                        : "ring-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setBundleMode(bundleMode === cableType ? null : cableType);
                      setBundlePending(null);
                    }}
                    title={`${preset.name} — ${preset.hint || bundleHint(cableType)}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        {preset.cores.map((core, i) => (
                          <span
                            key={i}
                            style={{
                              display: 'inline-block',
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: ConductorStyle[core.kind]?.stroke || '#6b7280',
                              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)'
                            }}
                          />
                        ))}
                        {cableType.includes('SWA') && (
                          <span aria-hidden="true" className="ml-0.5">🛡️</span>
                        )}
                      </span>
                      <span>{cableType}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {bundleMode && (
              <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                {bundlePending 
                  ? `Click destination terminal to complete ${bundleMode} bundle` 
                  : `${bundleMode} mode: Click first terminal to start bundle`
                }
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <label className="flex items-center gap-1 text-sm">
                <input 
                  type="checkbox" 
                  checked={autoTidy} 
                  onChange={(e) => setAutoTidy(e.target.checked)}
                />
                Auto-tidy curves
              </label>
            </div>
          </Collapsible>

          {/* Actions */}
          <Collapsible id="actions" title="⚡ Actions" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="space-y-3">
              
              {/* Edit Actions */}
              <div className="bg-slate-50 rounded-lg p-2">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">✏️ Edit</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" 
                    onClick={undo}
                    disabled={undoStack.length === 0}
                    title="Undo last change (Ctrl+Z)"
                  >
                    ↩️ Undo
                  </button>
                  <button 
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" 
                    onClick={redo}
                    disabled={redoStack.length === 0}
                    title="Redo last undone change (Ctrl+Y)"
                  >
                    ↪️ Redo
                  </button>
                  <button 
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs hover:bg-slate-50 transition-colors" 
                    onClick={removeSelected}
                    title="Delete selected components/wires"
                  >
                    🗑️ Delete
                  </button>
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs hover:bg-slate-50 transition-colors"
                    onClick={() => {
                      pushHistory();
                      setWires([]);
                      clearSelection();
                      setPending(null);
                    }}
                    title="Remove all wires from circuit"
                  >
                    🧹 Clear
                  </button>
                </div>
              </div>

              {/* View Controls */}
              <div className="bg-blue-50 rounded-lg p-2">
                <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">👁️ View</h4>
                <div className="space-y-2">
                  {/* Zoom Controls */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Zoom</span>
                      <span className="font-mono text-slate-600">{Math.round(viewTransform.k * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3"
                      step="0.1"
                      value={viewTransform.k}
                      onChange={(e) => {
                        const k = parseFloat(e.target.value);
                        setViewTransform(v => ({ ...v, k }));
                      }}
                      className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer slider"
                      title={`Zoom level: ${Math.round(viewTransform.k * 100)}%`}
                    />
                  </div>
                  {/* View Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs hover:bg-blue-50 transition-colors" 
                      onClick={() => { setView({ x:0, y:0, w:1200, h:860 }); setViewTransform({ x: 0, y: 0, k: 1 }); }}
                      title="Reset view to center and default zoom"
                    >
                      🎯 Reset
                    </button>
                    <button
                      className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs hover:bg-blue-50 transition-colors"
                      onClick={() => {
                        if (components.length === 0) return;
                        const pads = 40;
                        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
                        for (const c of components) {
                          const w = (String(c.type).startsWith("CONNECTOR") || String(c.type).startsWith("WAGO")) ? 150 : 150;
                          const h = (String(c.type).startsWith("CONNECTOR") || String(c.type).startsWith("WAGO")) ? 120 : 110;
                          minx = Math.min(minx, c.x); miny = Math.min(miny, c.y);
                          maxx = Math.max(maxx, c.x + w); maxy = Math.max(maxy, c.y + h);
                        }
                        for (const w of wires) {
                          const pa = terminalAbsPosById(components, w.a);
                          const pb = terminalAbsPosById(components, w.b);
                          if (pa) { minx = Math.min(minx, pa.x); miny = Math.min(miny, pa.y); maxx = Math.max(maxx, pa.x); maxy = Math.max(maxx, pa.y); }
                          if (pb) { minx = Math.min(minx, pb.x); miny = Math.min(miny, pb.y); maxx = Math.max(maxx, pb.x); maxy = Math.max(maxy, pb.y); }
                        }
                        const vb = svgRef.current.getBoundingClientRect();
                        const ww = maxx - minx + pads*2, hh = maxy - miny + pads*2;
                        const sx = vb.width / ww, sy = vb.height / hh;
                        const k = Math.max(0.2, Math.min(1.5, Math.min(sx, sy)));
                        const cx = (vb.width - k * (minx - pads + maxx + pads)) / 2;
                        const cy = (vb.height - k * (miny - pads + maxy + pads)) / 2;
                        setViewTransform({ x: cx, y: cy, k });
                      }}
                      title="Zoom to fit all content"
                    >
                      📐 Fit
                    </button>
                  </div>
                  {/* View Options */}
                  <div className="grid grid-cols-1 gap-1 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={showGrid} onChange={(e)=>setShowGrid(e.target.checked)} className="rounded" />
                      <span>Show Grid</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={snapToGrid} onChange={(e)=>setSnapToGrid(e.target.checked)} className="rounded" />
                      <span>Snap to Grid</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={viewMode==='schematic'} onChange={e=>setViewMode(e.target.checked?'schematic':'installers')} className="rounded" />
                      <span>Schematic Mode</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* File Operations */}
              <div className="bg-green-50 rounded-lg p-2">
                <h4 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">💾 File</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="rounded-lg border border-green-200 bg-white px-2 py-1.5 text-xs hover:bg-green-50 transition-colors"
                    onClick={() => {
                      const text = exportState();
                      const blob = new Blob([text], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'circuit.json';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    title="Export circuit as JSON file"
                  >
                    📄 JSON
                  </button>
                  <button
                    className="rounded-lg border border-green-200 bg-white px-2 py-1.5 text-xs hover:bg-green-50 transition-colors"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'application/json';
                      input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            importState(e.target.result);
                          };
                          reader.readAsText(file);
                        }
                      };
                      input.click();
                    }}
                    title="Import circuit from JSON file"
                  >
                    📁 Import
                  </button>
                  <button 
                    className="rounded-lg border border-green-200 bg-white px-2 py-1.5 text-xs hover:bg-green-50 transition-colors" 
                    onClick={downloadSVG}
                    title="Export as SVG image"
                  >
                    🖼️ SVG
                  </button>
                  <button 
                    className="rounded-lg border border-green-200 bg-white px-2 py-1.5 text-xs hover:bg-green-50 transition-colors" 
                    onClick={()=>downloadPNG(2)}
                    title="Export as PNG image"
                  >
                    📸 PNG
                  </button>
                  <button
                    className="rounded-lg border border-green-200 bg-white px-2 py-1.5 text-xs hover:bg-green-50 transition-colors col-span-2"
                    onClick={shareState}
                    title="Copy sharable URL to clipboard"
                  >
                    🔗 Share Circuit
                  </button>
                </div>
              </div>

              {/* Safety (Fun Deaths) */}
              <div className="bg-rose-50 rounded-lg p-2">
                <h4 className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-2">⚡ Safety</h4>
                <div className="space-y-2">
                  <button
                    className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      funDeathsEnabled
                        ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                    onClick={() => setFunDeathsEnabled((v) => !v)}
                    aria-pressed={funDeathsEnabled}
                    title="Enable educational safety warnings"
                  >
                    💀 Fun Deaths {funDeathsEnabled ? '(ON)' : '(OFF)'}
                  </button>
                  {funDeathsEnabled && (
                    <div className="pl-1">
                      <button
                        className={`rounded border px-2 py-1 text-xs transition-colors ${
                          funDeathsTreatNEAsDeadly
                            ? 'border-rose-500 bg-rose-50 text-rose-700'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                        onClick={() => setFunDeathsTreatNEAsDeadly((v) => !v)}
                        aria-pressed={funDeathsTreatNEAsDeadly}
                        title="Treat Neutral–Earth faults as deadly"
                      >
                        ☠️ Treat N–E faults as deadly
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Wire Tools - Only show when wire is selected */}
              {selection.wires.length === 1 && (
                <div className="bg-orange-50 rounded-lg p-2">
                  <h4 className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">🔌 Wire Tools</h4>
                  <div className="space-y-2">
                    {/* Wire Color */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">Color:</span>
                      <div className="flex gap-1">
                        {Object.values(ConductorKinds).map((k) => (
                          <button
                            key={`re-${k}`}
                            className="rounded-full border-2 border-white shadow-sm w-5 h-5 hover:scale-110 transition-transform"
                            title={ConductorStyle[k].label}
                            onClick={() => recolourSelectedWire(k)}
                            style={{ background: ConductorStyle[k].stroke }}
                          />
                        ))}
                      </div>
                    </div>
                    {/* Wire Fault */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">Fault:</span>
                      <div className="flex gap-1">
                        <button 
                          className="rounded border border-orange-200 bg-white px-2 py-1 text-xs hover:bg-orange-50 transition-colors"
                          onClick={()=>{
                            const id = selection.wires[0];
                            pushHistory();
                            setWires(ws => ws.map(w => w.id===id ? {...w, fault:null} : w));
                          }}
                        >
                          None
                        </button>
                        <button 
                          className="rounded border border-orange-200 bg-white px-2 py-1 text-xs hover:bg-orange-50 transition-colors"
                          onClick={()=>{
                            const id = selection.wires[0];
                            pushHistory();
                            setWires(ws => ws.map(w => w.id===id ? {...w, fault:'open'} : w));
                          }}
                        >
                          Open
                        </button>
                        <button 
                          className="rounded border border-orange-200 bg-white px-2 py-1 text-xs hover:bg-orange-50 transition-colors"
                          onClick={()=>{
                            const id = selection.wires[0];
                            pushHistory();
                            setWires(ws => ws.map(w => w.id===id ? {...w, fault:'hr'} : w));
                          }}
                        >
                          High-R
                        </button>
                      </div>
                    </div>
                    {/* Wire Length */}
                    {(() => {
                      const wsel = wires.find(ww => ww.id === selection.wires[0]);
                      const currentLen = wsel?.lengthM;
                      return (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium">Length:</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            className="w-20 border rounded px-2 py-1"
                            value={currentLen ?? ''}
                            placeholder={(wsel && (()=>{ const pa=terminalAbsPosById(components,wsel.a); const pb=terminalAbsPosById(components,wsel.b); return pa && pb ? (Math.hypot(pb.x-pa.x,pb.y-pa.y)/PX_PER_M).toFixed(1) : ''; })())}
                            onChange={(e) => {
                              const val = e.target.value;
                              const num = val === '' ? undefined : parseFloat(val);
                              const id = selection.wires[0];
                              pushHistory();
                              setWires(ws => ws.map(w => w.id===id ? { ...w, lengthM: (num===undefined || isNaN(num)) ? undefined : num } : w));
                            }}
                          />
                          <span>m</span>
                          <button
                            className="rounded border border-orange-200 bg-white px-2 py-1 text-xs hover:bg-orange-50 transition-colors"
                            title="Use auto length from drawing"
                            onClick={() => {
                              const id = selection.wires[0];
                              pushHistory();
                              setWires(ws => ws.map(w => w.id===id ? ({ ...w, lengthM: undefined }) : w));
                            }}
                          >
                            Auto
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Component Properties */}
              {selection.components.length === 1 && (() => {
                const comp = components.find(c => c.id === selection.components[0]);
                if (!comp) return null;
                const installed = comp.meta?.installed ?? 'new';
                const circuit = findCircuitForComponent(components, wires, comp);
                return (
                  <div className="bg-slate-50 rounded-lg p-2">
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">🧩 Component</h4>
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                        <span className="text-slate-600">Installation:</span>
                        <select
                          className="border rounded px-2 py-1"
                          value={installed}
                          onChange={(e) => {
                            const val = e.target.value;
                            pushHistory();
                            setComponents(cs => cs.map(c => c.id === comp.id ? { ...c, meta: { ...(c.meta || {}), installed: val } } : c));
                          }}
                        >
                          <option value="new">New (to be installed)</option>
                          <option value="existing">Existing (pre-installed)</option>
                        </select>
                      </div>
                      {circuit && (
                        <div className="text-slate-600">
                          <span className="font-medium">Circuit:</span>{' '}
                          <span>
                            {(() => {
                              const cu = components.find(c => c.id === circuit.cuId);
                              const way = (circuit.wayIndex != null) ? `Way ${circuit.wayIndex + 1}` : 'Unknown way';
                              return `${cu?.label || 'Consumer Unit'} — ${way}`;
                            })()}
                          </span>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500">
                        Unset metadata defaults to “new”. Mark pre-existing items as Existing.
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* EVSE Inspector - Only when a single EV charger is selected */}
              {selection.components.length === 1 && (() => {
                const comp = components.find(c => c.id === selection.components[0]);
                if (!comp) return null;
                if (comp.type !== ComponentTypes.EVSE_1P_7kW && comp.type !== ComponentTypes.EVSE_3P_11_22kW) return null;
                const has6mA = comp.state?.has6mA ?? true;
                const earthing = comp.state?.earthing ?? 'PME';
                return (
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">🚗 EV Charger</h4>
                    <div className="space-y-2 text-xs">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="accent-emerald-600"
                          checked={has6mA}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            pushHistory();
                            setComponents(cs => cs.map(c => c.id === comp.id ? { ...c, state: { ...c.state, has6mA: checked } } : c));
                          }}
                        />
                        <span>Integral 6 mA DC detection (RDC-DD)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="font-medium">Earthing:</span>
                        <select
                          className="border rounded px-2 py-1"
                          value={earthing}
                          onChange={(e) => {
                            const val = e.target.value;
                            pushHistory();
                            setComponents(cs => cs.map(c => c.id === comp.id ? { ...c, state: { ...c.state, earthing: val } } : c));
                          }}
                        >
                          <option value="PME">PME (TN-C-S)</option>
                          <option value="TT">TT</option>
                        </select>
                      </label>
                      <div className="text-[11px] text-slate-600">
                        These flags influence the Regulations tags: Type B vs Type A+RDC-DD, and Open-PEN vs TT notes.
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Help */}
              <div className="bg-purple-50 rounded-lg p-2">
                <h4 className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">❓ Help</h4>
                <button
                  className="w-full rounded-lg border border-purple-200 bg-white px-2 py-2 text-xs hover:bg-purple-50 transition-colors flex items-center justify-between"
                  onClick={() => setShowHotkeys(!showHotkeys)}
                  title="Show/hide keyboard shortcuts"
                >
                  <span>⌨️ Shortcuts</span>
                  <span className="text-purple-400">{showHotkeys ? '▼' : '▶'}</span>
                </button>
              </div>

            </div>
          </Collapsible>

          {/* Display Settings */}
          <Collapsible id="display" title="🎨 Display Settings" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={wiresOnTop} onChange={(e)=>setWiresOnTop(e.target.checked)} /> Wires on top
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={wireHalo} onChange={(e)=>setWireHalo(e.target.checked)} /> Wire outline
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showWireLengths} onChange={(e)=>setShowWireLengths(e.target.checked)} /> Show wire lengths
              </label>
              <label className="flex items-center gap-2 col-span-2">
                <input type="checkbox" checked={fadeBoxes} onChange={(e)=>setFadeBoxes(e.target.checked)} /> Fade component boxes
              </label>
              <label className="flex items-center gap-2 col-span-2">
                <input type="checkbox" checked={darkMode} onChange={(e)=>setDarkMode(e.target.checked)} /> Dark mode
              </label>
              
              <label className="flex items-center gap-2 col-span-2">
                Wire thickness
                <input className="flex-1" type="range" min={2} max={10} step={1} value={wireThickness} onChange={(e)=>setWireThickness(parseInt(e.target.value))} />
                <span className="w-8 text-right tabular-nums text-xs">{wireThickness}px</span>
              </label>
            </div>
          </Collapsible>
          {/* Floor plan panel (embedded inside shared Collapsible to match controls) */}
          <Collapsible id="floor-plan" title="📐 Floor Plan" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <FloorPlanPanel embedded floorPlan={floorPlan} actions={floorPlanActions} canvas={{ width: view.w, height: view.h }} />
          </Collapsible>
          </div>
        </div>
      {/* End sticky sidebar wrapper */}

  {/* Center column wrapper: groups help + canvas into one grid item */}
  <div className="space-y-4 min-w-0 self-start lg:col-start-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain">

      {/* Top Toolbar: Undo / Redo / Restart */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button
          title="Undo last action"
          onClick={undo}
          disabled={!undoStack.length}
          className="rounded border neutral-btn bg-white px-2 py-1 text-xs disabled:opacity-50"
        >↶ Undo</button>
        <button
          title="Redo"
          onClick={redo}
          disabled={!redoStack.length}
          className="rounded border neutral-btn bg-white px-2 py-1 text-xs disabled:opacity-50"
        >↷ Redo</button>
        <button
          title="Delete selected components/wires"
          onClick={removeSelected}
          disabled={selection.components.length === 0 && selection.wires.length === 0}
          className="rounded border neutral-btn bg-white px-2 py-1 text-xs disabled:opacity-50"
        >🗑️ Delete</button>
        <button
          title="Restart circuit (supply + lamp)"
          onClick={() => {
            pushHistory();
            setComponents([makeSupply(40, 40), makeLamp(360, 40)]);
            setWires([]);
            clearSelection();
            setPending(null);
          }}
          className="rounded border neutral-btn bg-white px-2 py-1 text-xs"
        >🔄 Restart</button>
      </div>

      {/* Hotkeys Help Panel */}
      {showHotkeys && (
        <div className="mt-4 p-4 bg-gray-50 border rounded-2xl">
          <h3 className="font-medium mb-3">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">Ctrl+Z</kbd> Undo</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">Ctrl+Y</kbd> Redo</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">Ctrl+D</kbd> Duplicate selection</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">Escape</kbd> Exit tool / clear selection</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">Space+Drag</kbd> Pan canvas</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">Mouse Wheel</kbd> Zoom</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">G</kbd> Toggle grid</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">S</kbd> Toggle snap</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">H</kbd> Toggle wire halo</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">T</kbd> Toggle auto-tidy</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">V</kbd> Toggle ⚡ Voltage Pen</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">X</kbd> Toggle ✂️ Wire Cutters</div>
            <div><kbd className="px-2 py-1 bg-gray-200 rounded text-xs font-mono">Delete/Backspace</kbd> Delete selection</div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Tip: Hold <strong>Space + drag</strong> to pan the canvas. 
            Click and drag on empty canvas to create marquee selection. 
            Drag multiple selected components together. 
            Click wire midpoint handles to adjust curves. 
            Press <strong>X</strong> to toggle Wire Cutters and <strong>Esc</strong> to exit tools.
          </p>
        </div>
      )}

      {/* Canvas */}
  <div className={`relative rounded-2xl p-2 overflow-x-auto overflow-y-auto ${toolCursorClass} ${panRef.current?.panning ? 'panning' : ''} ${(!panRef.current?.panning && spacePressed) ? 'space-grab' : ''} themed-panel`}
    style={{ background: 'var(--panel-bg)', boxShadow: '0 0 0 1px var(--panel-border)' }}>
        <svg
          ref={svgRef}
          className="min-w-[1400px] h-[860px]"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          style={{ touchAction: 'none' }}
          onWheel={(e)=>{ e.preventDefault(); const f = e.deltaY<0 ? 1.1 : 1/1.1; zoomAt(e.clientX, e.clientY, f); }}
          onMouseMove={(e)=>{ 
            // Pan takes priority if active
            if (panRef.current.panning) {
              e.preventDefault();
              e.stopPropagation();
              doPan(e);
            } else {
              onMouseMoveSVG(e);
            }
          }}
          onMouseUp={(e)=>{ endPan(); onMouseUpSVG(); }}
          onTouchMove={(e)=>{
            // Pinch zoom handling (two fingers)
            if (e.touches && e.touches.length === 2) {
              const [t1, t2] = [e.touches[0], e.touches[1]];
              const dx = t2.clientX - t1.clientX;
              const dy = t2.clientY - t1.clientY;
              const dist = Math.hypot(dx, dy);
              const mid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
              if (!pinchRef.current.active) {
                pinchRef.current.active = true;
                pinchRef.current.lastDist = dist;
                pinchRef.current.lastMid = mid;
              } else {
                const rel = dist / (pinchRef.current.lastDist || dist);
                if (rel && isFinite(rel) && rel > 0) {
                  zoomAt(mid.x, mid.y, rel);
                  pinchRef.current.lastDist = dist;
                  pinchRef.current.lastMid = mid;
                }
              }
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            if (panRef.current.panning || drag || marquee) {
              e.preventDefault();
              e.stopPropagation();
            }
            if (panRef.current.panning) {
              doPan(e);
            } else {
              onMouseMoveSVG(e);
            }
          }}
          onTouchEnd={(e)=>{ pinchRef.current.active=false; endPan(); onMouseUpSVG(); }}
          onTouchCancel={(e)=>{ pinchRef.current.active=false; endPan(); onMouseUpSVG(); }}
          onMouseLeave={endPan}
          onMouseDown={(e) => {
            // Handle clicks (scissors should work even when clicking on wires/elements)
            console.log('Mouse down:', { target: e.target, currentTarget: e.currentTarget, spacePressed });

            // 1) Scissors tool: attempt to cut wire at click point regardless of target
            if (quickTool === 'scissors') {
              // Prevent underlying selection handlers from firing when cutting
              e.preventDefault();
              e.stopPropagation();

              console.log('Scissors click detected');
              const p = toWorld(e);
              console.log('Click point:', p);
              const hit = hitTestWireAtPoint(wires, components, p, 12);
              console.log('Hit test result:', hit);
              if (hit) {
                const targetWire = wires.find(w => w.id === hit.wireId);
                console.log('Target wire:', targetWire);
                if (targetWire) {
                  const cutResult = cutWireAt(targetWire, p, { createVisibleJunction: false });
                  console.log('Cut result:', cutResult);
                  if (cutResult) {
                    // Push to undo stack
                    pushHistory();

                    // Apply the cut: remove old wire, add junction and new wires
                    setWires(ws => ws.filter(w => w.id !== cutResult.removedWireId).concat(cutResult.newWires));
                    setComponents(cs => [...cs, cutResult.junction]);

                    // Clear scissors mode and hover point after successful cut
                    setQuickTool(null);
                    setScissorsHoverPoint(null);
                    console.log('Wire cut successfully! Junction created with ID:', cutResult.junction.id);
                  } else {
                    console.log('Cut failed - too close to endpoints or other issue');
                  }
                } else {
                  console.log('Target wire not found');
                }
              } else {
                console.log('No wire hit detected');
              }
              return; // handled
            }

            // 2) Background-only interactions (pan / marquee)
            if (e.target === e.currentTarget) {
              if (spacePressed) {
                // Space + click to pan
                e.preventDefault();
                startPan(e);
              } else {
                // Normal click for marquee selection
                const p = toWorld(e);
                setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                clearSelection();
              }
            }
          }}
          onTouchStart={(e) => {
            // Two-finger pinch start
            if (e.touches && e.touches.length === 2) {
              const [t1, t2] = [e.touches[0], e.touches[1]];
              const dx = t2.clientX - t1.clientX;
              const dy = t2.clientY - t1.clientY;
              const dist = Math.hypot(dx, dy);
              const mid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
              pinchRef.current.active = true;
              pinchRef.current.lastDist = dist;
              pinchRef.current.lastMid = mid;
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // Single-finger: scissors and marquee mirror mouse down
            if (quickTool === 'scissors') {
              e.preventDefault();
              e.stopPropagation();
              const p = toWorld(e);
              const hit = hitTestWireAtPoint(wires, components, p, 12);
              if (hit) {
                const targetWire = wires.find(w => w.id === hit.wireId);
                if (targetWire) {
                  const cutResult = cutWireAt(targetWire, p, { createVisibleJunction: false });
                  if (cutResult) {
                    pushHistory();
                    setWires(ws => ws.filter(w => w.id !== cutResult.removedWireId).concat(cutResult.newWires));
                    setComponents(cs => [...cs, cutResult.junction]);
                    setQuickTool(null);
                    setScissorsHoverPoint(null);
                  }
                }
              }
              return;
            }
            if (e.target === e.currentTarget) {
              e.preventDefault();
              const p = toWorld(e);
              setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              clearSelection();
            }
          }}
          onClick={(e) => {
            if (quickTool) return; // block canvas clicks while quick tool active
            if (e.target === e.currentTarget) clearSelection();
          }}
        >
          <defs>
            {/* green‑yellow stripes for CPC */}
            <linearGradient id="earthStripes" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#15803d" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#15803d" />
            </linearGradient>
            {/* High-visibility dot grid */}
            <pattern id="gridDots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="1.2" style={{ fill: 'var(--grid-dot)' }} />
            </pattern>
            {/* grid pattern */}
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="1" />
            </pattern>
            {/* selection glow */}
            <filter id="selGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#3b82f6" floodOpacity="0.9" />
            </filter>
            {/* slight card-like shadow for components */}
            <filter id="cardShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#0f172a" floodOpacity="0.18" />
            </filter>
            {/* lamp glow */}
            <radialGradient id="lampGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
            </radialGradient>
            {/* probe marker glow */}
            <filter id="probeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.0" result="pg" />
              <feMerge>
                <feMergeNode in="pg" /><feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* soft vignette */}
            <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
              <stop offset="85%" stopColor="white" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--vignette-color)" stopOpacity="var(--vignette-opacity)" />
            </radialGradient>
          </defs>

          {/* Grid background (static in screen coords) */}
          {showGrid && <rect x="0" y="0" width="100%" height="100%" fill="url(#gridDots)" pointerEvents="none" />}
          {/* Subtle vignette overlay */}
          <rect x="0" y="0" width="100%" height="100%" fill="url(#vignette)" pointerEvents="none" />

          {/* Viewport wrapper for pan/zoom */}
          <g ref={rootGRef} transform={`translate(${viewTransform.x},${viewTransform.y}) scale(${viewTransform.k})`}>
            {/* Floor plan image at bottom of content space */}
            <FloorPlanImage floorPlan={floorPlan} setFloorPlan={setFloorPlan} gridSnap={snapToGrid ? gridSize : 0} />

            {/* Interactive content (disabled when editing floor plan) */}
            <g style={{ pointerEvents: (floorPlan && !floorPlan.locked) ? 'none' : 'auto' }}>
              {/* Wires behind (optional) */}
              {!wiresOnTop && wires.map((w) => renderWire(w))}

              {/* Components */}
              {components.map((c) => (
            <g key={c.id} transform={`translate(${c.x}, ${c.y})`}>
              {c.type === ComponentTypes.JUNCTION ? (
                // Junctions do not have a big box; use a tiny, mostly invisible hit area
                <g>
                  {/* very small invisible rect to allow hit/drag if needed */}
      <rect x={-6} y={-6} width={12} height={12} rx={4} fill="transparent" stroke="none"
        onMouseDown={(e) => onMouseDownComponent(c, e)}
        onTouchStart={(e) => { e.preventDefault(); onMouseDownComponent(c, e); }}
                        onClick={(e) => { if (e.shiftKey) toggleSelection("component", c.id); else replaceSelection("component", c.id); }}
                        style={{cursor:'move'}} />
                </g>
              ) : (
                <>
                  <rect
                    x={0}
                    y={0}
                    width={c.type.startsWith("CONNECTOR") || c.type.startsWith("WAGO") ? 150 : 150}
                    height={c.type.startsWith("CONNECTOR") || c.type.startsWith("WAGO") ? 120 : 110}
                    rx={16}
                    className="fill-white"
                    stroke={isSelected("component", c.id) ? "#2563eb" : compStroke(c.type)}
                    strokeWidth={2}
                    onMouseDown={(e) => onMouseDownComponent(c, e)}
                    onTouchStart={(e) => { e.preventDefault(); onMouseDownComponent(c, e); }}
                    onClick={(e) => {
                      if (e.shiftKey) toggleSelection("component", c.id);
                      else replaceSelection("component", c.id);
                    }}
                    filter={isSelected("component", c.id) ? "url(#selGlow)" : "url(#cardShadow)"}
                    style={{ fillOpacity: fadeBoxes ? 0.9 : 1, cursor: 'move' }}
                  />
                  <text x={8} y={-8} className="text-[10px] fill-gray-700">
                    {c.label}
                  </text>
                </>
              )}

              {/* Terminals */}
              {c.type !== ComponentTypes.JUNCTION && c.terminals.map((t) => {
                const pos = { x: t.dx, y: t.dy };
                const globalId = t.id;
                const pendingHere = pending === globalId;
                return (
                  <g
                    key={t.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={() => onTerminalClick(globalId)}
                    onTouchStart={(e) => { e.preventDefault(); onTerminalClick(globalId); }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Terminal ${t.name} of ${c.label}`}
                    onKeyDown={(e) => { if (isActivateKey(e)) { e.preventDefault(); onTerminalClick(globalId); } }}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      r={7}
                      className={pendingHere ? "fill-blue-200 stroke-blue-700" : "fill-white stroke-gray-900"}
                      strokeWidth={2}
                    />
                    <circle r={3} cx={-10} cy={0} fill={termDotFill(t.t)} />
                    <text y={-10} className="text-[9px] fill-gray-800">{t.name}</text>
                  </g>
                );
              })}

              {/* Junction: custom free-floating round endpoints */}
              {c.type === ComponentTypes.JUNCTION && (
                <g>
                  {(c.showHandles || !c.hidden) && c.terminals.map((t) => (
                    (Array.isArray(c.hiddenHandleIds) && c.hiddenHandleIds.includes(t.id)) ? null :
                    <g key={t.id} transform={`translate(${t.dx}, ${t.dy})`}>
                      {/* Outer grab ring: always rendered to allow dragging */}
                      <circle r={8} fill="#fff"
                              stroke={isSelected('component', c.id) ? '#2563eb' : '#9ca3af'}
                              strokeWidth={2}
                              onMouseDown={(e)=>onMouseDownTerminal(c.id, t.id, e)}
            onTouchStart={(e)=>{ e.preventDefault(); onMouseDownTerminal(c.id, t.id, e); }}
                              onClick={(e)=>{ e.stopPropagation(); if (e.shiftKey) toggleSelection('component', c.id); else replaceSelection('component', c.id); }}
                              style={{cursor:'grab', opacity: c.hidden ? 0.85 : 1}}
                              filter={isSelected('component', c.id) ? 'url(#selGlow)' : undefined}
                      />
                      {/* Inner colored core: only for visible junctions to avoid floating brown dots */}
                      {!c.hidden && <circle r={4} fill={termDotFill(t.t)} />}
                    </g>
                  ))}
                </g>
              )}

              {/* Symbols & interactive bits per component */}
              {c.type === ComponentTypes.JUNCTION && !c.hidden && (
                // Visible junction - small labelled dot at origin
                <g>
                  <circle cx={0} cy={0} r={6} fill="#fbbf24" stroke="#374151" strokeWidth={1}/>
                  <text x={0} y={-10} fontSize={8} textAnchor="middle" fill="#666">{c.label || 'J'}</text>
                </g>
              )}

              {c.type === ComponentTypes.SWITCH_1WAY && (
                viewMode === 'installers' ? (
                  <g>
                    {/* rocker (now keyboard/pointer accessible) */}
                    <g
                      tabIndex={0}
                      role="button"
                      aria-label={`Toggle ${c.label}`}
                      onClick={() => toggleSwitch(c)}
                      onKeyDown={(e) => { if (isActivateKey(e)) { e.preventDefault(); toggleSwitch(c); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect x={88} y={10} width={46} height={24} rx={12} className="fill-gray-200 stroke-gray-700" strokeWidth={2} />
                      <rect x={c.state.on ? 110 : 90} y={12} width={22} height={20} rx={10} className="fill-white stroke-gray-700" strokeWidth={1} />
                    </g>
                    {/* schematic line */}
                    <line x1={20} y1={20} x2={70} y2={60} stroke="#111827" strokeWidth={3} />
                    <circle cx={70} cy={60} r={5} fill="#111827" />
                    <text x={92} y={40} className="text-[9px] fill-gray-800">{c.state.on ? "COM→L1" : "open"}</text>
                  </g>
                ) : (
                  /* schematic symbol */
                  <g>
                    <g
                      tabIndex={0}
                      role="button"
                      aria-label={`Toggle ${c.label}`}
                      onClick={() => toggleSwitch(c)}
                      onKeyDown={(e) => { if (isActivateKey(e)) { e.preventDefault(); toggleSwitch(c); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <line x1={75} y1={45} x2={c.state.on ? 105 : 95} y2={c.state.on ? 45 : 35} stroke="#111827" strokeWidth={3} />
                      <circle cx={75} cy={45} r={3} fill="#111827" />
                      <circle cx={105} cy={45} r={3} fill="#111827" />
                    </g>
                    <text x={90} y={65} fontSize={10} textAnchor="middle" fill="#374151">1W</text>
                  </g>
                )
              )}

              {c.type === ComponentTypes.SWITCH_2WAY && (
                viewMode === 'installers' ? (
                  <g>
                    <g
                      tabIndex={0}
                      role="button"
                      aria-label={`Toggle ${c.label}`}
                      onClick={() => toggleSwitch(c)}
                      onKeyDown={(e) => { if (isActivateKey(e)) { e.preventDefault(); toggleSwitch(c); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect x={88} y={10} width={46} height={24} rx={12} className="fill-gray-200 stroke-gray-700" strokeWidth={2} />
                      <rect x={c.state.pos === 0 ? 110 : 90} y={12} width={22} height={20} rx={10} className="fill-white stroke-gray-700" strokeWidth={1} />
                    </g>
                    <line x1={20} y1={20} x2={70} y2={40} stroke="#111827" strokeWidth={3} />
                    <line x1={20} y1={70} x2={70} y2={40} stroke="#111827" strokeWidth={3} />
                    <text x={92} y={40} className="text-[9px] fill-gray-800">{c.state.pos === 0 ? "COM→L1" : "COM→L2"}</text>
                  </g>
                ) : (
                  /* schematic symbol */
                  <g>
                    <g
                      tabIndex={0}
                      role="button"
                      aria-label={`Toggle ${c.label}`}
                      onClick={() => toggleSwitch(c)}
                      onKeyDown={(e) => { if (isActivateKey(e)) { e.preventDefault(); toggleSwitch(c); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <line x1={75} y1={45} x2={c.state.pos === 0 ? 105 : 105} y2={c.state.pos === 0 ? 35 : 55} stroke="#111827" strokeWidth={3} />
                      <circle cx={75} cy={45} r={3} fill="#111827" />
                      <circle cx={105} cy={35} r={3} fill="#111827" />
                      <circle cx={105} cy={55} r={3} fill="#111827" />
                    </g>
                    <text x={90} y={70} fontSize={10} textAnchor="middle" fill="#374151">2W</text>
                  </g>
                )
              )}

              {c.type === ComponentTypes.SWITCH_INTERMEDIATE && (
                <g>
                  <g
                    tabIndex={0}
                    role="button"
                    aria-label={`Toggle ${c.label}`}
                    onClick={() => toggleSwitch(c)}
                    onKeyDown={(e) => { if (isActivateKey(e)) { e.preventDefault(); toggleSwitch(c); } }}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect x={88} y={10} width={46} height={24} rx={12} className="fill-gray-200 stroke-gray-700" strokeWidth={2} />
                    <rect x={c.state.pos === 0 ? 110 : 90} y={12} width={22} height={20} rx={10} className="fill-white stroke-gray-700" strokeWidth={1} />
                  </g>
                  <line x1={20} y1={20} x2={70} y2={20} stroke="#111827" strokeWidth={3} />
                  <line x1={20} y1={80} x2={70} y2={80} stroke="#111827" strokeWidth={3} />
                  <text x={92} y={40} className="text-[9px] fill-gray-800">{c.state.pos === 0 ? "straight" : "cross"}</text>
                </g>
              )}

              {c.type === ComponentTypes.LAMP && (
                viewMode === 'installers' ? (
                  <g>
                    {/* bulb outline */}
                    <path d="M110 30c-8 0-14 6-14 14 0 6 4 11 9 13v6h10v-6c5-2 9-7 9-13 0-8-6-14-14-14z" className="fill-white stroke-gray-900" strokeWidth={2} />
                    {/* glow when ON */}
                    {(() => {
                      const res = analysis.lamps.find((l) => l.id === c.id);
                      return res?.on ? (
                        <g>
                          <circle cx={110} cy={44} r={26} fill="url(#lampGlow)" />
                        </g>
                      ) : null;
                    })()}
                  </g>
                ) : (
                  /* schematic symbol */
                  <g>
                    <circle cx={110} cy={44} r={10} fill="none" stroke="#111827" strokeWidth={2}/>
                    <line x1={110} y1={34} x2={110} y2={54} stroke="#111827" strokeWidth={2}/>
                    {(() => {
                      const res = analysis.lamps.find((l) => l.id === c.id);
                      return res?.on ? (
                        <circle cx={110} cy={44} r={12} fill="none" stroke="#fbbf24" strokeWidth={3}/>
                      ) : null;
                    })()}
                  </g>
                )
              )}

              {c.type === ComponentTypes.CEILING_ROSE && (
                <g>
                  <rect width={150} height={100} rx={16}
                        className="fill-white" stroke={isSelected("component", c.id) ? "#2563eb" : "#9ca3af"} 
                        filter={isSelected("component", c.id) ? "url(#selGlow)" : "url(#cardShadow)"}
                        onMouseDown={(e)=>onMouseDownComponent(c,e)} 
                        onClick={(e) => {
                          if (e.shiftKey) toggleSelection("component", c.id);
                          else replaceSelection("component", c.id);
                        }}
                        style={{cursor:'move'}}/>
                  <text x={8} y={-8} className="text-[10px] fill-gray-700">{c.label}</text>
                  {/* three bays */}
                  <text x={10} y={14} fontSize={10} fill="#92400e">Loop (L)</text>
                  <text x={60} y={14} fontSize={10} fill="#1e3a8a">Neutral</text>
                  <text x={110} y={14} fontSize={10} fill="#15803d">Earth</text>
                  {/* lamp labels */}
                  <text x={56} y={84} fontSize={10} fill="#374151">Lamp N</text>
                  <text x={6}  y={94} fontSize={10} fill="#374151">SW L</text>

                  {c.terminals.map(t=>(
                    <Terminal key={t.id} terminal={t} onClick={onTerminalClick} probeA={probeA} probeB={probeB}/>
                  ))}
                </g>
              )}

              {c.type === ComponentTypes.CCU_45A && (
                <g>
                  {/* Main housing */}
                  <rect width={160} height={100} rx={8}
                        className="fill-white" stroke={isSelected("component", c.id) ? "#2563eb" : "#9ca3af"} 
                        filter={isSelected("component", c.id) ? "url(#selGlow)" : "url(#cardShadow)"}
                        onMouseDown={(e)=>onMouseDownComponent(c,e)} 
                        onClick={(e) => {
                          if (e.shiftKey) toggleSelection("component", c.id);
                          else replaceSelection("component", c.id);
                        }}
                        style={{cursor:'move'}}/>

                  {/* Switch lever */}
                  <rect x={68} y={20} width={24} height={40} rx={4} className="fill-red-100 stroke-red-600" strokeWidth={2}/>
                  <rect x={72} y={c.state?.on ? 26 : 46} width={16} height={12} rx={2} className="fill-red-600"/>
                  <text x={61} y={15} fontSize={10} className="fill-red-700">DP</text>
                  <text x={96} y={15} fontSize={10} className="fill-red-700">45A</text>
                  
                  {/* Neon indicator */}
                  <circle cx={80} cy={75} r={6} className={c.state?.on ? "fill-orange-400" : "fill-gray-300"} stroke="#374151"/>
                  <text x={88} y={79} fontSize={8} className="fill-gray-600">NEON</text>
                  
                  {/* Click area for switch */}
                  <rect x={68} y={20} width={24} height={40} fill="transparent" style={{cursor:'pointer'}}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onComponentToggle(c.id); 
                        }}/>

                  {c.terminals.map(t=>(
                    <Terminal key={t.id} terminal={t} onClick={onTerminalClick} probeA={probeA} probeB={probeB}/>
                  ))}
                </g>
              )}

              {/* Generic connector visuals with subtle styles */}
              {c.type === ComponentTypes.CONNECTOR_L3 && (
                <g>
                  <rect x={95} y={12} width={40} height={86} rx={8} className="fill-amber-50 stroke-amber-800" strokeWidth={2} />
                  {[0,1,2].map((i)=> <circle key={i} cx={115} cy={22 + i*30} r={3} fill="#92400e" />)}
                  <text x={98} y={56} className="text-[9px] fill-amber-900" transform="rotate(-90 98 56)">L LOOP</text>
                </g>
              )}
              {c.type === ComponentTypes.CONNECTOR_N3 && (
                <g>
                  <rect x={95} y={12} width={40} height={86} rx={8} className="fill-blue-50 stroke-blue-800" strokeWidth={2} />
                  {[0,1,2].map((i)=> <circle key={i} cx={115} cy={22 + i*30} r={3} fill="#1e3a8a" />)}
                  <text x={98} y={56} className="text-[9px] fill-blue-900" transform="rotate(-90 98 56)">N LOOP</text>
                </g>
              )}
              {c.type === ComponentTypes.CONNECTOR_E3 && (
                <g>
                  <rect x={95} y={12} width={40} height={86} rx={8} className="fill-green-50 stroke-green-800" strokeWidth={2} />
                  {[0,1,2].map((i)=> <circle key={i} cx={115} cy={22 + i*30} r={3} fill="url(#earthStripes)" />)}
                  <text x={98} y={56} className="text-[9px] fill-green-900" transform="rotate(-90 98 56)">CPC</text>
                </g>
              )}

              {/* Wago visuals: translucent body, orange levers, terminal dots */}
              {(c.type === ComponentTypes.WAGO_L3 || c.type === ComponentTypes.WAGO_N3 || c.type === ComponentTypes.WAGO_E3) && (
                <g>
                  <rect x={90} y={14} width={46} height={82} rx={8} className="fill-gray-100 stroke-gray-400" strokeWidth={2} />
                  {/* levers */}
                  {[0,1,2].map((i)=> (
                    <g key={i}>
                      <rect x={92} y={20 + i*26} width={42} height={12} rx={3} className="fill-orange-500 stroke-orange-700" strokeWidth={1} />
                      <rect x={94} y={22 + i*26} width={10} height={8} rx={2} className="fill-white/70" />
                    </g>
                  ))}
                  {/* terminal colour dots */}
                  {[0,1,2].map((i)=> (
                    <circle key={`d${i}`} cx={113} cy={26 + i*26} r={3} fill={
                      c.type.includes('L') ? '#92400e' : c.type.includes('N') ? '#1e3a8a' : undefined
                    } style={c.type.includes('E') ? { fill: 'url(#earthStripes)' } : undefined} />
                  ))}
                  <text x={92} y={58} className="text-[9px] fill-gray-700" transform="rotate(-90 92 58)">Wago 221</text>
                </g>
              )}
              {(c.type === ComponentTypes.WAGO_L5 || c.type === ComponentTypes.WAGO_N5 || c.type === ComponentTypes.WAGO_E5) && (
                <g>
                  <rect x={90} y={10} width={46} height={100} rx={8} className="fill-gray-100 stroke-gray-400" strokeWidth={2} />
                  {[0,1,2,3,4].map((i)=> (
                    <g key={i}>
                      <rect x={92} y={16 + i*18} width={42} height={10} rx={3} className="fill-orange-500 stroke-orange-700" strokeWidth={1} />
                      <rect x={94} y={18 + i*18} width={10} height={6} rx={2} className="fill-white/70" />
                    </g>
                  ))}
                  {[0,1,2,3,4].map((i)=> (
                    <circle key={`d5${i}`} cx={113} cy={21 + i*18} r={3} fill={
                      c.type.includes('L') ? '#92400e' : c.type.includes('N') ? '#1e3a8a' : undefined
                    } style={c.type.includes('E') ? { fill: 'url(#earthStripes)' } : undefined} />
                  ))}
                  <text x={92} y={62} className="text-[9px] fill-gray-700" transform="rotate(-90 92 62)">Wago 221</text>
                </g>
              )}

              {/* Double socket (2G) */}
              {c.type === ComponentTypes.SOCKET_2G && (
                viewMode === 'installers' ? (
                  <g>
                    <rect width={120} height={100} rx={10} fill={fadeBoxes ? "#f3f4f6" : "#ffffff"} stroke="#9ca3af" />
                    {/* Twin outlets (visual) */}
                    <rect x={40} y={20} width={24} height={16} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                    <rect x={40} y={64} width={24} height={16} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                    {/* Label */}
                    <text x={6} y={114} fontSize={12} fill="#374151">{c.label}</text>
                    {/* Terminals */}
                    {c.terminals.map((t)=>(
                      <Terminal 
                        key={t.id}
                        terminal={t}
                        onClick={onTerminalClick}
                        probeA={probeA}
                        probeB={probeB}
                      />
                    ))}
                  </g>
                ) : (
                  /* schematic symbol */
                  <g>
                    <rect x={85} y={30} width={40} height={50} fill="none" stroke="#111827" strokeWidth={2}/>
                    <text x={105} y={90} fontSize={10} textAnchor="middle" fill="#374151">2G</text>
                    {/* Terminals */}
                    {c.terminals.map((t)=>(
                      <Terminal 
                        key={t.id}
                        terminal={t}
                        onClick={onTerminalClick}
                        probeA={probeA}
                        probeB={probeB}
                      />
                    ))}
                  </g>
                )
              )}

              {/* Double socket with switch (2G) */}
              {c.type === ComponentTypes.SOCKET_2G_SWITCHED && (
                <g>
                  <rect width={140} height={100} rx={10} fill={fadeBoxes ? "#f3f4f6" : "#ffffff"} stroke="#9ca3af" />
                  {/* Two outlet apertures */}
                  <rect x={46} y={20} width={26} height={16} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                  <rect x={46} y={64} width={26} height={16} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                  {/* Switch rocker */}
                  <g role="button" tabIndex={0}
                     aria-label={`Socket switch ${c.state?.on ? "on" : "off"}`}
                     onKeyDown={(e)=>{ if(isActivateKey(e)) toggleSwitch(c); }}
                     onClick={()=>toggleSwitch(c)}
                     style={{cursor:'pointer'}}>
                    <rect x={88} y={20} width={36} height={22} rx={4} fill="#e5e7eb" stroke="#cbd5e1" />
                    <rect x={c.state?.on ? 108 : 90} y={22} width={16} height={18} rx={3} className="fill-white stroke-gray-700" strokeWidth={1} />
                    <text x={92} y={59} fontSize={10} fill="#374151">{c.state?.on ? "ON" : "OFF"}</text>
                  </g>
                  <text x={6} y={114} fontSize={12} fill="#374151">{c.label}</text>
                  {c.terminals.map((t)=>(
                    <Terminal 
                      key={t.id}
                      terminal={t}
                      onClick={onTerminalClick}
                      probeA={probeA}
                      probeB={probeB}
                    />
                  ))}
                </g>
              )}

              {/* Single socket (1G) */}
              {c.type === ComponentTypes.SOCKET_1G && (
                viewMode === 'installers' ? (
                  <g onMouseDown={(e)=>onMouseDownComponent(c,e)}>
                    <rect width={100} height={110} rx={10} fill={fadeBoxes ? "#f3f4f6" : "#ffffff"} stroke="#9ca3af" />
                    {/* Outlet aperture (visual) */}
                    <rect x={38} y={40} width={24} height={16} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                    <text x={6} y={124} fontSize={12} fill="#374151">{c.label}</text>
                    {c.terminals.map((t)=>(
                      <g key={t.id}
                         role="button" tabIndex={0}
                         onKeyDown={(e)=>{ if(isActivateKey(e)) onTerminalClick(t.id); }}
                         onClick={()=>onTerminalClick(t.id)}
                         aria-label={`${t.name} terminal`} style={{cursor:'pointer'}}>
                        <circle cx={t.dx} cy={t.dy} r={6} fill={termDotFill(t.t)} stroke="#111827" />
                        <text x={t.dx+10} y={t.dy+4} fontSize={11} fill="#374151">{t.name}</text>
                      </g>
                    ))}
                  </g>
                ) : (
                  /* schematic symbol */
                  <g onMouseDown={(e)=>onMouseDownComponent(c,e)}>
                    <rect x={75} y={35} width={30} height={40} fill="none" stroke="#111827" strokeWidth={2}/>
                    <text x={90} y={85} fontSize={10} textAnchor="middle" fill="#374151">1G</text>
                    {c.terminals.map((t)=>(
                      <g key={t.id}
                         role="button" tabIndex={0}
                         onKeyDown={(e)=>{ if(isActivateKey(e)) onTerminalClick(t.id); }}
                         onClick={()=>onTerminalClick(t.id)}
                         aria-label={`${t.name} terminal`} style={{cursor:'pointer'}}>
                        <circle cx={t.dx} cy={t.dy} r={6} fill={termDotFill(t.t)} stroke="#111827" />
                        <text x={t.dx+10} y={t.dy+4} fontSize={11} fill="#374151">{t.name}</text>
                      </g>
                    ))}
                  </g>
                )
              )}

              {/* RCD Socket (1G) */}
              {c.type === ComponentTypes.SOCKET_RCD_1G && (
                <g onMouseDown={(e)=>onMouseDownComponent(c,e)}>
                  <rect width={160} height={110} rx={10} fill={fadeBoxes ? "#f3f4f6" : "#ffffff"} stroke="#9ca3af" />
                  {/* Test / Reset buttons */}
                  <g style={{cursor:'pointer'}} role="button" tabIndex={0}
                     aria-label="RCD test" 
                     onClick={() => updateComponent(c.id, (x)=>({...x, state:{...x.state, tripped:true}}))}
                     onKeyDown={(e)=>{ if(isActivateKey(e)) updateComponent(c.id, (x)=>({...x, state:{...x.state, tripped:true}})); }}>
                    <rect x={80} y={18} width={28} height={18} rx={4} fill="#e5e7eb" stroke="#cbd5e1" />
                    <text x={94} y={31} fontSize={10} textAnchor="middle" fill="#374151">TEST</text>
                  </g>
                  <g style={{cursor:'pointer'}} role="button" tabIndex={0}
                     aria-label="RCD reset" 
                     onClick={() => updateComponent(c.id, (x)=>({...x, state:{...x.state, tripped:false}}))}
                     onKeyDown={(e)=>{ if(isActivateKey(e)) updateComponent(c.id, (x)=>({...x, state:{...x.state, tripped:false}})); }}>
                    <rect x={112} y={18} width={36} height={18} rx={4} fill="#e5e7eb" stroke="#cbd5e1" />
                    <text x={130} y={31} fontSize={10} textAnchor="middle" fill="#374151">RESET</text>
                  </g>
                  {/* Indicator */}
                  <circle cx={70} cy={26} r={5} fill={c.state?.tripped ? "#ef4444" : "#10b981"} stroke="#065f46" />
                  <text x={6} y={124} fontSize={12} fill="#374151">{c.label} {c.state?.tripped ? "(tripped)" : ""}</text>
                  {c.terminals.map((t)=>(
                    <g key={t.id}
                       role="button" tabIndex={0}
                       onKeyDown={(e)=>{ if(isActivateKey(e)) onTerminalClick(t.id); }}
                       onClick={()=>onTerminalClick(t.id)}
                       aria-label={`${t.name} terminal`} style={{cursor:'pointer'}}>
                      <circle cx={t.dx} cy={t.dy} r={6} fill={termDotFill(t.t)} stroke="#111827" />
                      <text x={t.dx+10} y={t.dy+4} fontSize={11} fill="#374151">{t.name}</text>
                    </g>
                  ))}
                </g>
              )}

              {/* FCU (both switched and unswitched variants) */}
              {(c.type === ComponentTypes.FCU_UNSWITCHED || c.type === ComponentTypes.FCU_SWITCHED) && (
                <g>
                  <rect width={140} height={100} rx={10} fill={fadeBoxes ? "#f3f4f6" : "#ffffff"} stroke="#9ca3af" />
                  {/* Fuse window */}
                  <rect x={54} y={18} width={32} height={20} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                  <text x={70} y={32} fontSize={10} textAnchor="middle" fill="#374151">FUSE</text>
                  {/* Optional switch */}
                  {c.type === ComponentTypes.FCU_SWITCHED && (
                    <g role="button" tabIndex={0}
                       aria-label={`FCU switch ${c.state?.on ? "on" : "off"}`}
                       onKeyDown={(e)=>{ if(isActivateKey(e)) toggleSwitch(c); }}
                       onClick={()=>toggleSwitch(c)}
                       style={{cursor:'pointer'}}>
                      <rect x={94} y={18} width={36} height={20} rx={4} fill="#e5e7eb" stroke="#cbd5e1" />
                      <rect x={c.state?.on ? 112 : 96} y={20} width={16} height={16} rx={3} className="fill-white stroke-gray-700" strokeWidth={1} />
                    </g>
                  )}
                  {/* Status text */}
                  <text x={6} y={114} fontSize={12} fill="#374151">
                    {c.label} {c.state?.fuseOk ? "" : "(fuse blown)"}
                  </text>
                  {c.terminals.map((t)=>(
                    <g key={t.id}
                       role="button"
                       tabIndex={0}
                       onKeyDown={(e)=>{ if(isActivateKey(e)) onTerminalClick(t.id); }}
                       onClick={()=>onTerminalClick(t.id)}
                       aria-label={`${t.name} terminal`}
                       style={{cursor:'pointer'}}>
                      <circle cx={t.dx} cy={t.dy} r={6} fill={termDotFill(t.t)} stroke="#111827" />
                      <text x={t.dx+10} y={t.dy+4} fontSize={11} fill="#374151">{t.name}</text>
                    </g>
                  ))}
                </g>
              )}

              {/* === Consumer Unit (all-MCB) — tidy layout === */}
              {c.type === ComponentTypes.CONSUMER_UNIT && (
                <g>
                  {/* pull the same constants (fallback if old saves lack _layout) */}
                  {(() => {
                    const L = c.state?._layout || {};
                    var BOX_W = L.BOX_W ?? 190, BOX_H = L.BOX_H ?? 240;
                    var WAY_Y0 = L.WAY_Y0 ?? 56, WAY_SP = L.WAY_SP ?? 14;
                    const N_BAR_Y = L.N_BAR_Y ?? 200; const E_BAR_Y = L.E_BAR_Y ?? 224;

                    return (
                      <g>
                        {/* outer box */}
                        <rect width={BOX_W} height={BOX_H} rx={14}
                              className="fill-white" 
                              stroke={isSelected("component", c.id) ? "#2563eb" : "#0f172a"} 
                              strokeWidth={2}
                              filter={isSelected("component", c.id) ? "url(#selGlow)" : "url(#cardShadow)"}
                              onMouseDown={(e)=>onMouseDownComponent(c,e)}
                              onClick={(e) => {
                                if (e.shiftKey) toggleSelection("component", c.id);
                                else replaceSelection("component", c.id);
                              }}
                              style={{cursor:'move'}} />
                        <text x={8} y={-8} className="text-[10px] fill-gray-700">{c.label}</text>

                        {/* lid */}
                        <rect x={8} y={8} width={BOX_W-16} height={22} rx={6} fill="#f3f4f6" stroke="#cbd5e1" />

                        {/* supply labels */}
                        <text x={10} y={22} fontSize={11} fill="#374151">L / N / E</text>
                        <text x={10} y={38} fontSize={11} fill="#374151">Supply</text>

                        {/* breaker rows (visual toggles) */}
                        {c.state.ways.map((w,i)=>{
                          const y = WAY_Y0 + i*WAY_SP;
                          return (
                            <g key={i}>
                              <g role="button" tabIndex={0} aria-label={`MCB ${i+1} ${w.closed ? "ON" : "OFF"}`}
                                 onClick={()=>{
                                   pushHistory(); // capture this toggle in history
                                   updateComponent(c.id, prev=>{
                                     const ways = prev.state.ways.map((ww,j)=> j===i ? {...ww, closed:!ww.closed} : ww);
                                     return {...prev, state:{...prev.state, ways}};
                                   });
                                 }}
                                 onKeyDown={(e)=>{ if(isActivateKey(e)) {
                                   pushHistory(); // capture this toggle in history
                                   updateComponent(c.id, prev=>{
                                     const ways = prev.state.ways.map((ww,j)=> j===i ? {...ww, closed:!ww.closed} : ww);
                                     return {...prev, state:{...prev.state, ways}};
                                   });
                                 }}}
                                 style={{cursor:'pointer'}}>
                                <rect x={64} y={y-8} width={48} height={14} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                                <rect x={w.closed ? 92 : 66} y={y-6} width={16} height={10} rx={2}
                                      className="fill-white stroke-gray-700" strokeWidth={1} />
                              </g>
                              <text x={118} y={y+3} fontSize={10} fill="#374151">{w.rating}</text>
                            </g>
                          );
                        })}

                        {/* captions for bars */}
                        <text x={10} y={N_BAR_Y-10} fontSize={10} fill="#1e3a8a">Neutral bar</text>
                        <text x={10} y={E_BAR_Y-10} fontSize={10} fill="#15803d">Earth bar</text>

                        {/* terminals (they're already positioned by the factory) */}
                        {c.terminals.map((t)=>(
                          <Terminal key={t.id} terminal={t} onClick={onTerminalClick} probeA={probeA} probeB={probeB}/>
                        ))}
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* === NEW: Consumer Unit (Split‑load, RCD A/B, RCBO, labels) === */}
              {c.type === ComponentTypes.CONSUMER_UNIT_SPLIT && (
                <g>
                  <rect width={330} height={330} rx={14}
                        className="fill-white" 
                        stroke={isSelected("component", c.id) ? "#2563eb" : "#0f172a"} 
                        strokeWidth={2}
                        filter={isSelected("component", c.id) ? "url(#selGlow)" : "url(#cardShadow)"}
                        onMouseDown={(e)=>onMouseDownComponent(c,e)}
                        onClick={(e) => {
                          if (e.shiftKey) toggleSelection("component", c.id);
                          else replaceSelection("component", c.id);
                        }}
                        style={{cursor:'move'}} />
                  <text x={8} y={-8} className="text-[10px] fill-gray-700">{c.label}</text>
                  <rect x={12} y={12} width={306} height={30} rx={6} fill="#f3f4f6" stroke="#cbd5e1" />
                  {/* Main */}
            <g role="button" tabIndex={0} aria-label={`Main switch ${c.state.mainOn ? "ON" : "OFF"}`}
              onClick={()=>{ pushHistory(); updateComponent(c.id, prev=>({...prev, state:{...prev.state, mainOn: !prev.state.mainOn}})); }}
              onKeyDown={(e)=>{ if(isActivateKey(e)) { pushHistory(); updateComponent(c.id, prev=>({...prev, state:{...prev.state, mainOn: !prev.state.mainOn}})); } }}
                     style={{cursor:'pointer'}}>
                    <rect x={18} y={18} width={60} height={21} rx={4} fill="#e5e7eb" stroke="#cbd5e1" />
                    <rect x={c.state.mainOn ? 48 : 21} y={21} width={24} height={15} rx={3} className="fill-white stroke-gray-700" strokeWidth={1} />
                    <text x={87} y={33} fontSize={13} fill="#374151">MAIN</text>
                  </g>
                  {/* RCD A/B */}
            <g role="button" tabIndex={0} aria-label={`RCD A ${c.state.rcdAOn ? "ON" : "OFF"}`}
              onClick={()=>{ pushHistory(); updateComponent(c.id, prev=>({...prev, state:{...prev.state, rcdAOn: !prev.state.rcdAOn}})); }}
              onKeyDown={(e)=>{ if(isActivateKey(e)) { pushHistory(); updateComponent(c.id, prev=>({...prev, state:{...prev.state, rcdAOn: !prev.state.rcdAOn}})); } }}
                     style={{cursor:'pointer'}}>
                    <rect x={18} y={48} width={69} height={21} rx={4} fill="#e5e7eb" stroke="#cbd5e1" />
                    <rect x={c.state.rcdAOn ? 60 : 21} y={51} width={24} height={15} rx={3} className="fill-white stroke-gray-700" strokeWidth={1} />
                    <text x={93} y={63} fontSize={13} fill="#374151">RCD A</text>
                  </g>
            <g role="button" tabIndex={0} aria-label={`RCD B ${c.state.rcdBOn ? "ON" : "OFF"}`}
              onClick={()=>{ pushHistory(); updateComponent(c.id, prev=>({...prev, state:{...prev.state, rcdBOn: !prev.state.rcdBOn}})); }}
              onKeyDown={(e)=>{ if(isActivateKey(e)) { pushHistory(); updateComponent(c.id, prev=>({...prev, state:{...prev.state, rcdBOn: !prev.state.rcdBOn}})); } }}
                     style={{cursor:'pointer'}}>
                    <rect x={138} y={48} width={69} height={21} rx={4} fill="#e5e7eb" stroke="#cbd5e1" />
                    <rect x={c.state.rcdBOn ? 180 : 141} y={51} width={24} height={15} rx={3} className="fill-white stroke-gray-700" strokeWidth={1} />
                    <text x={213} y={63} fontSize={13} fill="#374151">RCD B</text>
                  </g>
                  {/* All-RCBO quick toggle */}
                  <g role="button" tabIndex={0}
                     aria-label="Toggle RCBO on all ways"
                     onClick={()=>{
                       const anyOff = c.state.ways.some(w=>!w.rcbo);
                       pushHistory();
                       updateComponent(c.id, prev => ({
                         ...prev, state:{ ...prev.state, ways: prev.state.ways.map(w=>({ ...w, rcbo:anyOff })) }
                       }));
                     }}
                     onKeyDown={(e)=>{ if(isActivateKey(e)) {
                       const anyOff = c.state.ways.some(w=>!w.rcbo);
                       pushHistory();
                       updateComponent(c.id, prev => ({
                         ...prev, state:{ ...prev.state, ways: prev.state.ways.map(w=>({ ...w, rcbo:anyOff })) }
                       }));
                     }}}
                     style={{cursor:'pointer'}}>
                    <rect x={180} y={12} width={78} height={30} rx={9} fill="#eef2ff" stroke="#93c5fd" />
                    <text x={219} y={33} fontSize={13} textAnchor="middle" fill="#1f2937">All RCBO</text>
                  </g>
                  <text x={180} y={84} fontSize={13} fill="#374151">RCBO</text>
                  {/* Per-way rows */}
                  {c.state.ways.map((w, i) => {
                    const y = 33 + i * 24;
                    return (
                      <g key={i}>
                        {/* MCB */}
                        <g role="button" tabIndex={0} aria-label={`MCB ${i+1} ${w.closed ? "ON" : "OFF"}`}
                           onClick={()=>{
                             pushHistory(); // capture this toggle in history
                             updateComponent(c.id, prev=>{
                               const ways = prev.state.ways.map((ww,j)=> j===i ? {...ww, closed: !ww.closed} : ww);
                               return {...prev, state:{...prev.state, ways}};
                             });
                           }}
                           onKeyDown={(e)=>{ if(isActivateKey(e)) {
                             pushHistory(); // capture this toggle in history
                             updateComponent(c.id, prev=>{
                               const ways = prev.state.ways.map((ww,j)=> j===i ? {...ww, closed: !ww.closed} : ww);
                               return {...prev, state:{...prev.state, ways}};
                             });
                           }}}
                           style={{cursor:'pointer'}}>
                          <rect x={96} y={y-9} width={51} height={18} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                          <rect x={w.closed ? 126 : 99} y={y-6} width={18} height={12} rx={3} className="fill-white stroke-gray-700" strokeWidth={1} />
                        </g>
                        {/* RCBO flag */}
                        <g role="button" tabIndex={0} aria-label={`RCBO ${i+1} ${w.rcbo ? "ON" : "OFF"}`}
                           onClick={()=>{
                             updateComponent(c.id, prev=>{
                               const ways = prev.state.ways.map((ww,j)=> j===i ? {...ww, rcbo: !ww.rcbo} : ww);
                               return {...prev, state:{...prev.state, ways}};
                             });
                           }}
                           onKeyDown={(e)=>{ if(isActivateKey(e)) {
                             updateComponent(c.id, prev=>{
                               const ways = prev.state.ways.map((ww,j)=> j===i ? {...ww, rcbo: !ww.rcbo} : ww);
                               return {...prev, state:{...prev.state, ways}};
                             });
                           }}}
                           style={{cursor:'pointer'}}>
                          <rect x={168} y={y-9} width={27} height={18} rx={3} fill="#e5e7eb" stroke="#cbd5e1" />
                          <rect x={w.rcbo ? 177 : 171} y={y-6} width={12} height={12} rx={3} className="fill-white stroke-gray-700" strokeWidth={1} />
                        </g>
                        {/* Rating + inline label editor */}
                        <text x={12} y={y+15} fontSize={13} fill="#374151">{w.rating}</text>
                        {labelEdit?.compId === c.id && labelEdit.i === i ? (
                          <foreignObject x={36} y={y+3} width={120} height={21}>
                            <input xmlns="http://www.w3.org/1999/xhtml" type="text"
                              value={labelEdit.value} autoFocus
                              onChange={(e)=>setLabelEdit({...labelEdit, value: e.target.value})}
                              onBlur={()=>commitWayLabel(c.id, i, labelEdit.value)}
                              onKeyDown={(e)=>{ if(e.key==='Enter') commitWayLabel(c.id, i, labelEdit.value); if(e.key==='Escape') setLabelEdit(null); }}
                              style={{ width:'100%', height:'100%', fontSize:'13px', lineHeight:'21px', border:'1px solid #cbd5e1', borderRadius:'4px', padding:'0 4px', outline:'none', background:'white' }}
                            />
                          </foreignObject>
                        ) : (
                          <text x={36} y={y+15} fontSize={13} fill="#6b7280" style={{cursor:'text'}}
                                onClick={() => setLabelEdit({ compId: c.id, i, value: w.label })}>
                            {w.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {/* Bank separator + captions */}
                  {(() => {
                    const half = Math.floor(c.state.ways.length / 2);
                    const sepY = 22 + half * 16 - 6;
                    return (
                      <g>
                        <line x1={12} y1={sepY} x2={318} y2={sepY} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 3" />
                        <text x={12} y={sepY - 6} fontSize={13} fill="#6b7280">Bank A</text>
                        <text x={12} y={sepY + 18} fontSize={13} fill="#6b7280">Bank B</text>
                      </g>
                    );
                  })()}
                  {/* Bars captions */}
                  <text x={12} y={249} fontSize={13} fill="#1e3a8a">Neutral A</text>
                  <text x={12} y={273} fontSize={13} fill="#1e3a8a">Neutral B</text>
                  <text x={12} y={297} fontSize={13} fill="#15803d">Earth bar</text>
                  {/* Terminals */}
                  {c.terminals.map((t)=>(
                    <Terminal key={t.id} terminal={t} onClick={onTerminalClick} probeA={probeA} probeB={probeB}/>
                  ))}
                </g>
              )}
              </g>
            ))}

            {/* Wires on top (optional) */}
            {wiresOnTop && wires.map((w) => renderWire(w))}

            {/* Close interactive content group */}
            </g>

            {/* Scissors cut preview */}
            {quickTool === 'scissors' && scissorsHoverPoint && (
              <g className="cut-preview" pointerEvents="none">
                <circle 
                  cx={scissorsHoverPoint.x} 
                  cy={scissorsHoverPoint.y} 
                  r={6} 
                  fill="none" 
                  stroke="#ef4444" 
                  strokeWidth={2} 
                  strokeDasharray="4 2"
                />
                <circle 
                  cx={scissorsHoverPoint.x} 
                  cy={scissorsHoverPoint.y} 
                  r={2} 
                  fill="#ef4444" 
                />
              </g>
            )}

            {/* Probe markers (always on top) */}
            {probeA && renderProbeMarker(probeA, PROBE_A_COLOR, "A")}
            {probeB && renderProbeMarker(probeB, PROBE_B_COLOR, "B")}

            {/* Voltage pen HUD: show live status when hovering a wire */}
            {quickTool==='pen' && penHoverWireId && (() => {
              const w = wires.find(ww => ww.id === penHoverWireId);
              if (!w) return null;
              const a = terminalById(components, w.a);
              const b = terminalById(components, w.b);
              if (!a || !b) return null;
              const pa = componentTerminalAbsPos(a.comp, a.term);
              const pb = componentTerminalAbsPos(b.comp, b.term);
              const cpx = (pa.x + pb.x) / 2;
              const cpy = (pa.y + pb.y) / 2 - 25;
              
              // Check if wire endpoints are live (connected to supply L)
              const isLive = reachSets.rL.has(w.a) || reachSets.rL.has(w.b);
              const isNeutral = reachSets.rN.has(w.a) || reachSets.rN.has(w.b);
              const isEarth = reachSets.rE.has(w.a) || reachSets.rE.has(w.b);
              
              const status = isLive ? '⚡ LIVE' : isNeutral ? '🔵 NEUTRAL' : isEarth ? '🟢 EARTH' : '⚪ SAFE';
              const bgColor = isLive ? '#fecaca' : isNeutral ? '#bfdbfe' : isEarth ? '#bbf7d0' : '#f3f4f6';
              const textColor = isLive ? '#dc2626' : isNeutral ? '#1d4ed8' : isEarth ? '#059669' : '#6b7280';
              const strokeColor = isLive ? '#ef4444' : '#9ca3af';
              
              return (
                <g pointerEvents="none" filter={isLive ? "url(#probeGlow)" : undefined}>
                  <rect x={cpx-40} y={cpy-12} width={80} height={24} rx={12} 
                        fill={bgColor} stroke={strokeColor} strokeWidth={isLive ? 2 : 1} />
                  <text x={cpx} y={cpy+5} fontSize={12} textAnchor="middle" 
                        fill={textColor} style={{fontWeight: 'bold', fontFamily: 'monospace'}}>
                    {status}
                  </text>
                </g>
              );
            })()}

            {/* Marquee rectangle (world coords) */}
            {marquee && (
              <rect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="#3b82f6" fillOpacity="0.1" stroke="#3b82f6" strokeDasharray="4 3"
              />
            )}
          </g>
        </svg>

        
      </div>

  {/* Close center column wrapper */}
  </div>

  {/* Right panel: Checks, Presets, Save/Load, Meter, Lamps, Earth Continuity */}
  <div className="flex lg:col-start-3 lg:col-span-1">
      <div
        className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] overflow-y-auto lg:pl-2 overscroll-contain backdrop-blur rounded-2xl shadow-sm p-4 w-full min-w-0 lg:w-[360px] lg:min-w-[360px] lg:col-start-3 self-start themed-panel"
        role="region"
        aria-label="Analysis panel"
        style={{ background: 'var(--panel-bg)', boxShadow: '0 0 0 1px var(--panel-border)' }}
      >
        {/* Panel controls */}
        <div className="flex items-center justify-end mb-3">
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => setCollapsedFor(RIGHT_SECTION_IDS, true)}
              title="Collapse all sections"
            >
              Collapse all
            </button>
            <button
              className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => setCollapsedFor(RIGHT_SECTION_IDS, false)}
              title="Show all sections"
            >
              Show all
            </button>
          </div>
        </div>
        <div className="space-y-4">
          {/* Checks */}
          <Collapsible id="analysis-checks" title="🔍 Circuit Checks" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="space-y-3">
              {analysis.shorts.length > 0 ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 font-medium">⚡ Short detected</p>
                  <p className="text-red-600 text-sm mt-1">{analysis.shorts.map(s=>s.between).join(", ")}</p>
                </div>
              ) : (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700 font-medium">✅ No L–N/E shorts detected</p>
                </div>
              )}
              
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <h4 className="font-medium text-slate-800 mb-2">Ring Circuit Status</h4>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="text-center">
                    <div className="text-lg">{analysis.ring?.L ? "✅" : "❌"}</div>
                    <div className="text-xs text-slate-600">Line</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg">{analysis.ring?.N ? "✅" : "❌"}</div>
                    <div className="text-xs text-slate-600">Neutral</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg">{analysis.ring?.E ? "✅" : "❌"}</div>
                    <div className="text-xs text-slate-600">Earth</div>
                  </div>
                </div>
              </div>

              {analysis.validator?.messages?.length ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <h4 className="font-medium text-amber-800 mb-2">⚠️ Issues Found</h4>
                  <ul className="list-disc ml-5 space-y-1 text-sm text-amber-700">
                    {analysis.validator.messages.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              ) : (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-700 font-medium">✅ No validation issues</p>
                </div>
              )}
            </div>
          </Collapsible>

          {/* Sizing Rules (moved to right panel) */}
          <Collapsible id="sizing-rules" title="📏 Sizing Rules" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="text-xs text-slate-700 space-y-2">
              <div>
                <div className="font-semibold">Assumptions ({region})</div>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  <li>Lighting circuits: {region==='UK' ? '1.0' : '1.5'} mm² L/N, CPC {region==='UK' ? '1.0' : '1.5'} mm²</li>
                  <li>Sockets/ring finals: 2.5 mm² L/N, CPC 1.5 mm²</li>
                  <li>Cooker/45A isolator: 6.0 mm² L/N, CPC 2.5 mm²</li>
                </ul>
              </div>
              <div className="text-slate-500">Educational defaults; consult local regulations/tables.</div>
            </div>
          </Collapsible>

          {/* Presets */}
          <Collapsible id="presets" title="⚡ Circuit Presets" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-3">Load pre-configured circuit examples</p>
              <div className="space-y-2">
                {Object.entries(Presets).map(([key,p]) => (
                  <button key={key}
                    className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 hover:shadow-sm block w-full text-left text-sm font-medium transition-colors"
                    onClick={()=>{
                      const {components, wires} = p.make();
                      setComponents(components);
                      setWires(wires);
                      clearSelection();
                      setPending(null);
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </Collapsible>

          {/* Meter */}
          <Collapsible id="meter" title="🔌 Digital Meter" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="space-y-4">
              {/* Probe Controls */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <h4 className="font-medium text-slate-800 mb-3">Test Probes</h4>
                <div className="flex items-center gap-2 mb-3">
                  <button className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    probePick === 'A' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                    onClick={()=>setProbePick('A')}
                    aria-pressed={probePick==='A'}
                    title="Click a terminal to place Probe A">
                    🔴 Probe A
                  </button>
                  <button className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    probePick === 'B' ? 'border-black bg-gray-50 text-gray-700' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                    onClick={()=>setProbePick('B')}
                    aria-pressed={probePick==='B'}
                    title="Click a terminal to place Probe B">
                    ⚫ Probe B
                  </button>
                </div>
                
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span className="inline-flex items-center gap-2">
                      <span style={{background:PROBE_A_COLOR, width:12, height:12, borderRadius:999}} />
                      <span>Probe A</span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span style={{background:PROBE_B_COLOR, width:12, height:12, borderRadius:999}} />
                      <span>Probe B</span>
                    </span>
                  </div>
                  <button className="rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2 py-1 text-xs font-medium"
                    onClick={()=>{ setProbeA(null); setProbeB(null); }}
                    title="Clear probes">
                    Clear
                  </button>
                </div>
                
                <div className="text-xs text-gray-600 p-2 bg-blue-50 border border-blue-200 rounded">
                  <div className="font-medium mb-1">Status:</div>
                  <div>{probeA ? `A: ${probeA.slice(0,8)}…` : "A: Not connected"}</div>
                  <div>{probeB ? `B: ${probeB.slice(0,8)}…` : "B: Not connected"}</div>
                  <div className="mt-2 text-blue-600">💡 Tip: Select probe A or B, then click any terminal dot.</div>
                </div>
              </div>

              {/* Measurement Mode */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <h4 className="font-medium text-slate-800 mb-3">Measurement Mode</h4>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={meterMode==='ohms'} onChange={()=>setMeterMode('ohms')} className="text-blue-600" />
                    <span className="font-mono">Ω</span>
                    <span className="text-sm">Resistance</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={meterMode==='volts'} onChange={()=>setMeterMode('volts')} className="text-blue-600" />
                    <span className="font-mono">V</span>
                    <span className="text-sm">Voltage</span>
                  </label>
                </div>
                {/* Load current for ΔV (educational) */}
                <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
                  <span className="text-slate-600">Load current:</span>
                  <input type="range" min="0" max="32" step="0.5" value={loadCurrentA}
                         onChange={(e)=>setLoadCurrentA(parseFloat(e.target.value))}
                         className="w-full slider" />
                  <span className="w-16 text-right tabular-nums">{loadCurrentA.toFixed(1)} A</span>
                </div>
              </div>

              {/* Reading Display */}
              <div className="p-4 bg-black text-green-400 rounded-lg font-mono border-2 border-gray-600">
                <div className="text-xs text-green-300 mb-2 text-center">DIGITAL MULTIMETER</div>
                <div className="min-h-[120px] flex flex-col justify-center">
                  {(() => {
                    if (!probeA || !probeB) {
                      return (
                        <div className="text-center">
                          <div className="text-3xl font-bold text-red-400 mb-2">- - -</div>
                          <div className="text-xs text-green-300">Connect both probes</div>
                        </div>
                      );
                    }
                    
                    if (meterMode === 'ohms') {
                      const R = measureResistance(components, wires, probeA, probeB);
                      const fmt = (x) => x === Infinity ? "OL" : `${x.toFixed(2)}`;
                      const allOL = [R.L, R.N, R.E].every(v => v === Infinity);
                      
                      return (
                        <div className="space-y-2">
                          <div className="text-center text-3xl font-bold">
                            {fmt(R.L) === "OL" ? "OL" : `${fmt(R.L)} Ω`}
                          </div>
                          <div className="text-xs text-green-300 space-y-1">
                            <div>Line: {fmt(R.L)} Ω</div>
                            <div>Neutral: {fmt(R.N)} Ω</div>
                            <div>Earth: {fmt(R.E)} Ω</div>
                          </div>
                          {/* ΔV estimate under load for educational realism */}
                          {(() => {
                            const rLN = isFinite(R.L) && isFinite(R.N) ? (R.L + R.N) : (isFinite(R.L) ? R.L : isFinite(R.N) ? R.N : null);
                            if (rLN == null) return null;
                            const dV = loadCurrentA * rLN;
                            const pct = (SYSTEM_V > 0) ? (dV / SYSTEM_V * 100) : 0;
                            return (
                              <div className="mt-2 text-xs text-yellow-300 text-center">
                                ΔV @ {loadCurrentA.toFixed(1)} A ≈ {dV.toFixed(2)} V ({pct.toFixed(1)}%)
                              </div>
                            );
                          })()}
                          {allOL && (
                            <div className="text-xs text-yellow-400 text-center mt-2">
                              ⚠️ Check connections & breaker states
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      const V = measureVoltage(components, wires, probeA, probeB);
                      if (!V) {
                        return (
                          <div className="text-center">
                            <div className="text-3xl font-bold text-red-400 mb-2">0.00 V</div>
                            <div className="text-xs text-green-300">No supply present</div>
                          </div>
                        );
                      }
                      const f = (v) => v == null ? "—" : `${v.toFixed(1)}`;
                      return (
                        <div className="space-y-2">
                          <div className="text-center text-3xl font-bold">
                            {f(V.Vab)} V
                          </div>
                          <div className="text-xs text-green-300 space-y-1 text-center">
                            <div>Va: {f(V.Va)} V</div>
                            <div>Vb: {f(V.Vb)} V</div>
                            <div>Vab: {f(V.Vab)} V</div>
                          </div>
                          {/* Show ΔV estimate here as well for convenience */}
                          {(() => {
                            const R = measureResistance(components, wires, probeA, probeB);
                            const rLN = isFinite(R.L) && isFinite(R.N) ? (R.L + R.N) : (isFinite(R.L) ? R.L : isFinite(R.N) ? R.N : null);
                            if (rLN == null) return null;
                            const dV = loadCurrentA * rLN;
                            const pct = (SYSTEM_V > 0) ? (dV / SYSTEM_V * 100) : 0;
                            return (
                              <div className="mt-2 text-xs text-yellow-300 text-center">
                                ΔV @ {loadCurrentA.toFixed(1)} A ≈ {dV.toFixed(2)} V ({pct.toFixed(1)}%)
                              </div>
                            );
                          })()}
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>
          </Collapsible>

          {/* Earth Continuity */}
          <Collapsible id="earth-continuity" title="🌍 Earth Continuity" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="space-y-3">
              {(() => {
                const earthComponents = components.filter((c) => c.terminals.some((t) => t.t === TerminalTypes.E));
                
                if (earthComponents.length === 0) {
                  return (
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="text-sm text-gray-600 text-center">
                        No components requiring earthing found
                      </div>
                    </div>
                  );
                }
                
                const connectedCount = earthComponents.filter(dev => {
                  const earth = analysis.earth.find((e) => e.id === dev.id);
                  return earth?.ok;
                }).length;
                const totalCount = earthComponents.length;
                
                return (
                  <div className="space-y-3">
                    {/* Summary Card */}
                    <div className={`p-3 rounded-lg border ${
                      connectedCount === totalCount 
                        ? 'bg-green-50 border-green-200' 
                        : connectedCount === 0
                        ? 'bg-red-50 border-red-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Earth Continuity Status
                        </span>
                        <span className={`text-sm font-bold ${
                          connectedCount === totalCount 
                            ? 'text-green-700' 
                            : connectedCount === 0
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}>
                          {connectedCount}/{totalCount}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Components with proper earth connection
                      </div>
                    </div>

                    {/* Component List */}
                    <div className="space-y-2">
                      {earthComponents.map((dev) => {
                        const earth = analysis.earth.find((e) => e.id === dev.id);
                        const isConnected = earth?.ok;
                        
                        return (
                          <div 
                            key={dev.id} 
                            className={`p-2 rounded border text-sm ${
                              isConnected 
                                ? 'bg-green-50 border-green-200 text-green-800' 
                                : 'bg-red-50 border-red-200 text-red-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {dev.label} ({dev.id.slice(-4)})
                              </span>
                              <span className="text-xs font-bold">
                                {isConnected ? "✓ EARTHED" : "✗ NO EARTH"}
                              </span>
                            </div>
                            {!isConnected && (
                              <div className="text-xs mt-1 opacity-75">
                                Connect earth terminal to protective conductor (CPC)
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </Collapsible>

          {/* Regulations */}
          <Collapsible id="regulations" title="📜 Regulations (Part P & Certification)" collapsedMap={collapsed} setCollapsedMap={setCollapsed}>
            <div className="space-y-2 text-sm">
              {/* Render the same rows from RegulationsPanel inline */}
              {(() => {
                const hasCU = components.some(c => c.type === ComponentTypes.CONSUMER_UNIT || c.type === ComponentTypes.CONSUMER_UNIT_SPLIT);
                const outdoorItems = components.filter(c => c.meta?.environment === 'outdoor');

                const rows = [];

                // --- Circuit usage mapping (only loads) ---
                const LOAD_TYPES = new Set([
                  ComponentTypes.SOCKET_1G, ComponentTypes.SOCKET_2G, ComponentTypes.SOCKET_2G_SWITCHED, ComponentTypes.SOCKET_RCD_1G,
                  ComponentTypes.OUTDOOR_SOCKET_RCD, ComponentTypes.LAMP, ComponentTypes.GARDEN_LIGHT,
                  ComponentTypes.CEILING_ROSE,
                  ComponentTypes.EVSE_1P_7kW, ComponentTypes.EVSE_3P_11_22kW
                ]);
                const loadsByWay = new Map(); // key: `${cuId}:${wayIndex}` -> { cu, wayIndex, comps:[] }
                components.forEach(c => {
                  if (!LOAD_TYPES.has(c.type)) return;
                  const hit = findCircuitForComponent(components, wires, c);
                  if (!hit) return;
                  const key = `${hit.cuId}:${hit.wayIndex}`;
                  if (!loadsByWay.has(key)) {
                    const cu = components.find(x => x.id === hit.cuId);
                    loadsByWay.set(key, { cu, wayIndex: hit.wayIndex, comps: [] });
                  }
                  loadsByWay.get(key).comps.push(c);
                });

                // Flags for top-level summary
                let anyNewCircuit = false;
                let anyMinorWorks = false;

                // Per-way rows + toggle: "Existing circuit?"
                for (const { cu, wayIndex, comps: wayComps } of loadsByWay.values()) {
                  if (!cu) continue;
                  const wayState = cu?.state?.ways?.[wayIndex];
                  const isExisting = wayState?.isExisting !== false; // default true

                  rows.push({
                    title: `${cu.label || 'Consumer Unit'} — Way ${wayIndex + 1}`,
                    tags: [{ text: isExisting ? 'Existing circuit' : 'New circuit', kind: isExisting ? 'info' : 'notifiable' }],
                    kind: isExisting ? 'info' : 'notifiable',
                    notes: (
                      <label className="text-xs flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isExisting}
                          onChange={(e) => {
                            pushHistory();
                            updateComponent(cu.id, prev => {
                              const newWays = [...(prev.state?.ways || [])];
                              newWays[wayIndex] = { ...(newWays[wayIndex] || {}), isExisting: e.target.checked };
                              return { ...prev, state: { ...prev.state, ways: newWays } };
                            });
                          }}
                        />
                        Existing circuit (pre-installed)
                      </label>
                    )
                  });

                  if (!isExisting) anyNewCircuit = true; // Used way marked as new → Notifiable

                  if (isExisting) {
                    const hasNewComponent = wayComps.some(c => (c.meta?.installed || 'new') !== 'existing');
                    if (hasNewComponent) anyMinorWorks = true; // additions/alterations on existing circuit
                  }
                }
                if (outdoorItems.length) {
                  outdoorItems.forEach(c => {
                    rows.push({
                      title: `${c.label} — outdoor`,
                      tags: [
                        { text: c.meta?.requiresRCD ? 'RCD required' : 'RCD check', kind: 'certify' },
                        { text: c.meta?.ipRating || 'IP rating check', kind: 'info' },
                        { text: 'Certificate', kind: 'certify' },
                      ],
                      kind: 'certify',
                      notes: 'Outdoor equipment needs suitable IP rating, RCD protection and correct cable type (e.g., SWA or protected route). Notifiable if part of a new circuit; alterations to existing circuits usually need a Minor Electrical Installation Works Certificate.',
                    });
                  });
                }
                // EV-specific checks
                const evUnits = components.filter(c => c.type === ComponentTypes.EVSE_1P_7kW || c.type === ComponentTypes.EVSE_3P_11_22kW);
                if (evUnits.length) {
                  evUnits.forEach(ev => {
                    const tags = [];
                    tags.push({ text: 'Notifiable (Part P)', kind: 'notifiable' }); // likely new circuit
                    const has6mA = ev.state?.has6mA ?? ev.meta?.has6mA_DC_Detection ?? false;
                    if (has6mA) {
                      tags.push({ text: 'RCD Type A + RDC-DD (6 mA)', kind: 'certify' });
                    } else {
                      tags.push({ text: 'Type B RCD or Type A + RDC-PD', kind: 'certify' });
                    }
                    const earthing = (ev.state?.earthing || 'PME');
                    if (earthing === 'PME') {
                      tags.push({ text: 'Open-PEN protection', kind: 'certify' });
                    } else {
                      tags.push({ text: 'TT arrangement (verify Ra)', kind: 'certify' });
                    }
                    if (ev.meta?.ipRating) tags.push({ text: ev.meta.ipRating, kind: 'info' });
                    if (ev.meta?.smartChargeRequired) tags.push({ text: 'Smart-charge regs', kind: 'info' });
                    rows.push({
                      title: `${ev.label}`,
                      tags,
                      kind: 'certify',
                      notes: 'Dedicated circuit with appropriate cable size and breaker. Provide 30 mA RCD protection (Type A with integral 6 mA DC detection in the EVSE, or Type B/Type A+RDC-PD). For PME supplies, provide Open-PEN protection or alternative earthing arrangement. Outdoor rating and isolation required; consider load management/CT clamp.',
                    });
                  });
                }
                if (!anyNewCircuit && anyMinorWorks) {
                  rows.push({
                    title: 'Alterations to existing circuits',
                    tags: [{ text: 'Minor works certificate', kind: 'certify' }],
                    kind: 'certify',
                    notes: 'Additions/alterations generally require testing and certification but may not be notifiable if not in special locations or forming a new circuit.',
                  });
                }

                // Top-level summary if nothing else produced it
                if (hasCU && anyNewCircuit) {
                  rows.unshift({
                    title: 'New circuit present',
                    tags: [{ text: 'Notifiable (Part P)', kind: 'notifiable' }],
                    kind: 'notifiable',
                    notes: 'Installing a new circuit is generally notifiable. Use a registered electrician or notify building control.',
                  });
                } else if (hasCU && !anyNewCircuit && !anyMinorWorks) {
                  rows.unshift({
                    title: 'Consumer unit present',
                    tags: [{ text: 'No new circuits', kind: 'info' }],
                    kind: 'info',
                    notes: 'Ensure BS 7671 compliance and keep appropriate records.',
                  });
                }

                if (!rows.length) {
                  return (
                    <p className="text-xs text-slate-500">No regulatory flags detected. Ensure compliance with BS 7671 and keep appropriate records.</p>
                  );
                }
                const tagStyle = (kind) => kind === 'notifiable' ? 'bg-rose-100 text-rose-700' : kind === 'certify' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                return (
                  <ul className="space-y-2">
                    {rows.map((r, i) => (
                      <li key={i} className="rounded-lg border border-slate-200 p-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-slate-800">{r.title}</div>
                          <div className="flex gap-1 flex-wrap">
                            {r.tags.map((t, idx) => {
                              const text = typeof t === 'string' ? t : t.text;
                              const kind = typeof t === 'string' ? r.kind : t.kind;
                              return (
                                <span key={idx} className={`px-2 py-0.5 rounded text-xs font-medium ${tagStyle(kind)}`}>{text}</span>
                              );
                            })}
                          </div>
                        </div>
                        {r.notes && (typeof r.notes === 'string' ? (
                          <p className="mt-1 text-xs text-slate-500">{r.notes}</p>
                        ) : (
                          <div className="mt-1 text-xs text-slate-500">{r.notes}</div>
                        ))}
                      </li>
                    ))}
                  </ul>
                );
              })()}

              {/* Quick list to toggle component "Pre-installed" status */}
              {(() => {
                const candidateLoads = components.filter(c =>
                  [ComponentTypes.LAMP, ComponentTypes.CEILING_ROSE,
                   ComponentTypes.SOCKET_1G, ComponentTypes.SOCKET_2G, ComponentTypes.SOCKET_2G_SWITCHED, ComponentTypes.SOCKET_RCD_1G,
                   ComponentTypes.OUTDOOR_SOCKET_RCD, ComponentTypes.GARDEN_LIGHT,
                   ComponentTypes.EVSE_1P_7kW, ComponentTypes.EVSE_3P_11_22kW].includes(c.type)
                ).slice(0, 8);
                if (!candidateLoads.length) return null;
                return (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-slate-700 mb-1">Mark loads as pre-installed</div>
                    <ul className="space-y-1">
                      {candidateLoads.map(c => {
                        const installed = c.meta?.installed || 'new';
                        return (
                          <li key={c.id} className="text-xs flex items-center justify-between">
                            <span className="text-slate-700 truncate max-w-[10rem]">{c.label}</span>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={installed === 'existing'}
                                onChange={(e)=> {
                                  pushHistory();
                                  updateComponent(c.id, prev => ({
                                    ...prev,
                                    meta: { ...(prev.meta || {}), installed: e.target.checked ? 'existing' : 'new' }
                                  }));
                                }}
                              />
                              Pre-installed
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}

              <p className="mt-1 text-[11px] text-slate-400">Training aid only — verify against BS 7671 and local building control guidance.</p>
            </div>
          </Collapsible>
        </div>
      </div>
    </div>
    </div>

      {/* You Died Modal */}
      <YouDiedModal
        open={youDiedOpen}
        onClose={() => setYouDiedOpen(false)}
        onReset={() => {
          setComponents([makeSupply(40, 40), makeLamp(360, 40)]);
          setWires([]);
          clearSelection();
          setPending(null);
          setYouDiedOpen(false);
        }}
        onUndoToLastSafe={() => {
          if (lastSafeRef.current) {
            setComponents(lastSafeRef.current.components);
            setWires(lastSafeRef.current.wires);
            clearSelection();
            setPending(null);
          }
          setYouDiedOpen(false);
        }}
        onViewIssues={() => {
          // Scroll to Circuit Checks panel
          document.querySelector('[aria-label="Analysis panel"]')?.scrollIntoView({ behavior: 'smooth' });
          // Snooze re-open until wiring changes
          snoozeDeathUntilChange();
          setYouDiedOpen(false);
        }}
        summary={deathSummary}
      />
    </div>
  );
}

// ---------- Lightweight self‑tests (runtime console assertions) ----------
try {
  // Test 1: 1‑way switch links COM↔L1 only when ON
  const s1 = makeSwitch1Way(0, 0);
  console.assert(s1.internalLinks(s1).length === 0, "1‑way OFF should be open");
  s1.state.on = true;
  const linksOn = s1.internalLinks(s1).map((p) => p.join("-"));
  console.assert(linksOn.includes("COM-L1"), "1‑way ON should connect COM-L1");

  // Test 2: 2‑way COM toggles between L1 and L2
  const s2 = makeSwitch2Way(0, 0);
  let l2 = s2.internalLinks(s2).map((p) => p.join("-"));
  console.assert(l2.includes("COM-L1"), "2‑way pos0 should connect COM-L1");
  s2.state.pos = 1;
  l2 = s2.internalLinks(s2).map((p) => p.join("-"));
  console.assert(l2.includes("COM-L2"), "2‑way pos1 should connect COM-L2");

  // Test 3: Intermediate straight vs cross
  const si = makeSwitchIntermediate(0, 0);
  let lint = si.internalLinks(si).map((p) => p.join("-"));
  console.assert(
    lint.includes("L1A-L1B") && lint.includes("L2A-L2B"),
    "Intermediate straight should link L1A-L1B and L2A-L2B"
  );
  si.state.pos = 1;
  lint = si.internalLinks(si).map((p) => p.join("-"));
  console.assert(
    lint.includes("L1A-L2B") && lint.includes("L2A-L1B"),
    "Intermediate cross should swap pairs"
  );

  // Test 4: Connector internals
  const cn = makeConnectorN3(0, 0);
  const ce = makeConnectorE3(0, 0);
  const cl = makeConnectorL3(0, 0);
  const adjN = buildAdjacency([cn], []);
  const adjE = buildAdjacency([ce], []);
  const adjL = buildAdjacency([cl], []);
  const n1 = termIdByName(cn, "N1"), n2 = termIdByName(cn, "N2"), n3 = termIdByName(cn, "N3");
  const e1 = termIdByName(ce, "E1"), e2 = termIdByName(ce, "E2"), e3 = termIdByName(ce, "E3");
  const l1 = termIdByName(cl, "L1"), l2t = termIdByName(cl, "L2"), l3 = termIdByName(cl, "L3");
  console.assert((adjN.get(n1) || new Set()).has(n2) && (adjN.get(n1) || new Set()).has(n3), "N connector should common N1,N2,N3");
  console.assert((adjE.get(e1) || new Set()).has(e2) && (adjE.get(e1) || new Set()).has(e3), "E connector should common E1,E2,E3");
  console.assert((adjL.get(l1) || new Set()).has(l2t) && (adjL.get(l1) || new Set()).has(l3), "L connector should common L1,L2,L3");

  // Test 5: Neutral & Line loop at switch delivers switched live to lamp
  const sup = makeSupply(0, 0);
  const lamp = makeLamp(0, 0);
  const nconn = makeConnectorN3(0, 0);
  const lconn = makeConnectorL3(0, 0);
  const sw = makeSwitch1Way(0, 0);
  const comps = [sup, lamp, nconn, lconn, sw];
  const wiresTest = [];
  const w = (a, b, kind) => wiresTest.push({ id: newId(), a, b, kind });
  // Neutral loop: Supply N -> Nconn.N1; Nconn.N2 -> Lamp N
  w(termIdByName(sup, "N"), termIdByName(nconn, "N1"), ConductorKinds.N);
  w(termIdByName(nconn, "N2"), termIdByName(lamp, "N"), ConductorKinds.N);
  // Line loop: Supply L -> Lconn.L1; Lconn.L2 onward (ignored); Lconn.L3 -> Switch COM
  w(termIdByName(sup, "L"), termIdByName(lconn, "L1"), ConductorKinds.L);
  w(termIdByName(lconn, "L3"), termIdByName(sw, "COM"), ConductorKinds.L);
  // Switched live: Switch L1 -> Lamp L (with switch ON)
  sw.state.on = true;
  w(termIdByName(sw, "L1"), termIdByName(lamp, "L"), ConductorKinds.L);
  const adjT = buildAdjacency(comps, wiresTest);
  const reachLTest = bfs(adjT, termIdByName(sup, "L"));
  const reachNTest = bfs(adjT, termIdByName(sup, "N"));
  console.assert(reachLTest.has(termIdByName(lamp, "L")) && reachNTest.has(termIdByName(lamp, "N")), "Lamp should energise via loop‑in and switched live");

  // Test 6: Wago commoning (3‑way & 5‑way)
  const wL3 = makeWago3('L', 0, 0);
  const wN5 = makeWago5('N', 0, 0);
  const adjWL3 = buildAdjacency([wL3], []);
  const adjWN5 = buildAdjacency([wN5], []);
  const wl3_1 = termIdByName(wL3, 'L1');
  const wl3_3 = termIdByName(wL3, 'L3');
  console.assert((adjWL3.get(wl3_1) || new Set()).has(wl3_3), 'Wago L3 should link L1-L3');
  const wn5_1 = termIdByName(wN5, 'N1');
  const wn5_5 = termIdByName(wN5, 'N5');
  console.assert((adjWN5.get(wn5_1) || new Set()).has(wn5_5), 'Wago N5 should link N1-N5');

  // Test 7: Wago E5 commoning (earth)
  const wE5 = makeWago5('E', 0, 0);
  const adjWE5 = buildAdjacency([wE5], []);
  const we5_1 = termIdByName(wE5, 'E1');
  const we5_5 = termIdByName(wE5, 'E5');
  console.assert((adjWE5.get(we5_1) || new Set()).has(we5_5), 'Wago E5 should link E1-E5');

  // Test 8: EVSE factories basic shape
  const ev1 = makeEVSE1P(0, 0);
  console.assert(ev1.terminals.length === 3, 'EVSE 1P should have 3 terminals (L,N,E)');
  const ev3 = makeEVSE3P(0, 0);
  console.assert(ev3.terminals.length === 5, 'EVSE 3P should have 5 terminals (L1,L2,L3,N,E)');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("Self‑tests failed:", err);
}
