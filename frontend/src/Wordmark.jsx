import { useEffect, useMemo, useState } from "react";

// SOLICE wordmark: thin geometric letters in dark, polished bronze-gold, with an orbit ring and a tiny planet.
// FULL FILE: replace everything in frontend/src/Wordmark.jsx with this. Nothing else needs to change.
// Used in Intro.jsx as <Wordmark on={titleOn} />

const W = 524; // total width of the letters, in SVG units
const METAL = 8; // thickness of the gold stroke (6 = finer, 10 = bolder)
const EDGE = METAL + 1.8; // dark rim around the gold

const LETTERS = [
  { d: "M48.8 15 A24 24 0 1 0 28 51 A24 24 0 1 1 7.2 87", t: "translate(-4 0)" }, // S
  { d: "M136 3 A42 48 0 1 1 136 99 A42 48 0 1 1 136 3" }, // O
  { d: "M224 3 V99 H268" }, // L
  { d: "M314 3 V99" }, // I
  { d: "M434.2 20.1 A42 48 0 1 0 434.2 81.9" }, // C
  { d: "M524 3 H480 V99 H524 M480 51 H516" }, // E
];

const DRAW = 1.6; // seconds each letter takes to draw
const STAGGER = 0.24; // seconds between letters
const END = DRAW + STAGGER * (LETTERS.length - 1); // when the last letter finishes
const FLARE_AT = END - 0.3;

// orbit ring around the word (center x, center y, radii)
const OC = { x: 262, y: 51, rx: 318, ry: 64 };
const ORBIT = `M ${OC.x - OC.rx} ${OC.y} A ${OC.rx} ${OC.ry} 0 1 0 ${OC.x + OC.rx} ${OC.y} A ${OC.rx} ${OC.ry} 0 1 0 ${OC.x - OC.rx} ${OC.y}`;

/* ------------------------------ dark liquid bronze texture ------------------------------ */

function makeMetalTexture() {
  const TW = 1088;
  const TH = 284;
  const K = 150; // bigger = broader, smoother folds
  const cv = document.createElement("canvas");
  cv.width = TW;
  cv.height = TH;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(TW, TH);

  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => {
    let s = 0;
    let a = 0.5;
    for (let i = 0; i < 4; i++) {
      s += a * noise(x, y);
      x = x * 2.02 + 1.7;
      y = y * 2.02 + 9.2;
      a *= 0.5;
    }
    return s;
  };
  const mix = (a, b, t) => a + (b - a) * t;

  // near-black umber -> deep bronze -> antique gold -> a small warm highlight at the very top
  const STOPS = [
    [0.0, 18, 9, 3],
    [0.3, 72, 42, 14],
    [0.55, 138, 92, 36],
    [0.78, 192, 142, 66],
    [0.93, 232, 196, 124],
    [1.0, 252, 232, 184],
  ];
  const ramp = (s) => {
    for (let i = 1; i < STOPS.length; i++) {
      if (s <= STOPS[i][0]) {
        const a = STOPS[i - 1];
        const b = STOPS[i];
        const t = (s - a[0]) / (b[0] - a[0]);
        return [mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t)];
      }
    }
    const l = STOPS[STOPS.length - 1];
    return [l[1], l[2], l[3]];
  };

  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      const u = x / K;
      const v = y / K;
      const qx = fbm(u, v);
      const qy = fbm(u + 5.2, v + 1.3);
      const h = fbm(u + 2.2 * qx, v + 2.2 * qy); // domain warping = flowing liquid folds
      let s = 0.5 + 0.5 * Math.sin(h * 11 + u * 0.35 + v * 0.9);
      s = Math.pow(s, 1.6); // higher = darker and moodier
      const [r, g, b] = ramp(s);
      const i = (y * TW + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL("image/png");
}

/* ----------------------------------- component ------------------------------------ */

export default function Wordmark({ on, width = "min(78vw, 960px)" }) {
  const [tex, setTex] = useState(null);

  const reduce = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    const id = setTimeout(() => setTex(makeMetalTexture()), 50);
    return () => clearTimeout(id);
  }, []);

  const dash = (i) => ({
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: reduce ? "none" : `stroke-dashoffset ${DRAW}s cubic-bezier(0.55, 0, 0.2, 1) ${i * STAGGER}s`,
  });

  // every layer is the same letters; only color, thickness and a tiny offset change
  const layer = (key, stroke, strokeWidth, offset = "", opacity = 1) =>
    LETTERS.map((l, i) => (
      <path
        key={`${key}${i}`}
        d={l.d}
        transform={`${l.t || ""} ${offset}`.trim() || undefined}
        pathLength="1"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={opacity}
        style={dash(i)}
      />
    ));

  const fade = (delay) => ({
    opacity: on ? 1 : 0,
    transition: reduce ? "none" : `opacity 2s ease ${delay}s`,
  });

  return (
    <svg
      role="img"
      aria-label="SOLICE"
      viewBox="-8 -22 544 142"
      style={{
        width,
        height: "auto",
        overflow: "visible",
        filter: "drop-shadow(0 0 20px rgba(184,124,40,0.26))",
      }}
    >
      <defs>
        {/* fallback paint for the split second before the texture is ready */}
        <linearGradient id="solice-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
          <stop offset="0" stopColor="#4a2e0e" />
          <stop offset="0.5" stopColor="#b88a3e" />
          <stop offset="1" stopColor="#4a2e0e" />
        </linearGradient>
        {tex && (
          <pattern id="solice-metal" patternUnits="userSpaceOnUse" x="-8" y="-22" width="544" height="142">
            <image href={tex} x="0" y="0" width="544" height="142" preserveAspectRatio="none" />
          </pattern>
        )}
        {/* orbit ring fades out at both ends */}
        <linearGradient id="solice-orbit" gradientUnits="userSpaceOnUse" x1={OC.x - OC.rx} y1="0" x2={OC.x + OC.rx} y2="0">
          <stop offset="0" stopColor="#c89a4a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#c89a4a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#c89a4a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="solice-flare">
          <stop offset="0" stopColor="#ffe6b0" stopOpacity="1" />
          <stop offset="0.25" stopColor="#d9a850" stopOpacity="0.5" />
          <stop offset="1" stopColor="#b9822c" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* orbit ring with a small planet circling the word, drawn behind the letters */}
      <g transform={`rotate(-5 ${OC.x} ${OC.y})`} style={fade(END - 0.6)}>
        <path d={ORBIT} fill="none" stroke="url(#solice-orbit)" strokeWidth="0.7" />
        <circle r="7" fill="url(#solice-flare)" opacity="0.8">
          {!reduce && <animateMotion dur="26s" repeatCount="indefinite" path={ORBIT} />}
        </circle>
        <circle r="2.2" fill="#f1d79a">
          {!reduce && <animateMotion dur="26s" repeatCount="indefinite" path={ORBIT} />}
        </circle>
      </g>

      <g fill="none" strokeLinejoin="miter" strokeLinecap="butt">
        {layer("sh", "#0c0602", EDGE, "translate(1.6 1.8)", 0.8) /* soft shadow */}
        {layer("ed", "#140a03", EDGE) /* dark rim */}
        {layer("mt", tex ? "url(#solice-metal)" : "url(#solice-gold)", METAL) /* polished bronze-gold */}
        {layer("gr", "#0e0702", 0.9, "", 0.55) /* thin engraved groove down the middle */}
        {layer("hi", "#f6dfae", 0.7, "translate(-1.5 -1.5)", 0.3) /* edge highlight */}
      </g>

      {/* lens flare on top of the I */}
      <g style={{ opacity: on ? 1 : 0, transition: reduce ? "none" : `opacity 1.6s ease ${FLARE_AT}s` }}>
        <ellipse
          cx="314"
          cy="3"
          rx="150"
          ry="1.5"
          fill="url(#solice-flare)"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            transform: on ? "scaleX(1)" : "scaleX(0.15)",
            transition: reduce ? "none" : `transform 1.8s cubic-bezier(0.2, 0.7, 0.2, 1) ${FLARE_AT}s`,
          }}
        />
        <circle cx="314" cy="3" r="14" fill="url(#solice-flare)" />
      </g>
    </svg>
  );
}
