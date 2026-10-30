import Wordmark from "./Wordmark";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, Html } from "@react-three/drei";

const T = 9; // seconds the dive takes
const SYS_SCALE = 0.02; // the solar system is tiny compared to the galaxy
const SIZE_K = 1.7; // planets are drawn bigger than real scale
const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// galaxy layout. H = 1 or -1 mirrors the spin direction and the arm handedness
const H = 1;
const ARMS = 4;
const SPIN = 0.22 * H;
const GALAXY_R = 40;
const SUN_R = 26;
const SUN_THETA0 = SUN_R * SPIN; // the Sun sits on spiral arm 0
const omega = (r) => (H * 0.18) / (1 + r * 0.1); // differential rotation
const OM = (H * 0.18).toFixed(3);
const SPIN_G = SPIN.toFixed(3);

const rgb = (hex) => {
  const c = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
};

// type: 0 rocky, 1 earth, 2 banded gas giant, 3 cloudy / ice giant
const PLANETS = [
  { name: "Mercury", au: "0.39", r: 3.6, size: 0.1, a0: 0.5, spin: 0.1, type: 0, colA: "#9a928b", colB: "#5f5953", colC: "#3b3733", seed: 1.3 },
  { name: "Venus", au: "0.72", r: 5.0, size: 0.24, a0: 2.1, spin: -0.08, type: 3, colA: "#ead3a0", colB: "#c99c5e", colC: "#f3e6c0", contrast: 0.35, seed: 2.1, atmo: "#f0d9a8", atmoK: 0.35 },
  { name: "Earth", au: "1.00", r: 6.5, size: 0.25, a0: 4.0, spin: 0.8, tilt: 0.41, type: 1, colA: "#123f8f", colB: "#8a6d3b", colC: "#ffffff", seed: 3.7, atmo: "#6ea8ff", atmoK: 0.9 },
  { name: "Mars", au: "1.52", r: 8.0, size: 0.14, a0: 1.2, spin: 0.75, tilt: 0.44, type: 0, colA: "#c8673c", colB: "#84402a", colC: "#4a2619", cap: 0.85, seed: 4.2, atmo: "#e8a27a", atmoK: 0.25 },
  { name: "Jupiter", au: "5.20", r: 12.6, size: 1.15, a0: 5.3, spin: 1.4, tilt: 0.05, type: 2, colA: "#ead7b8", colB: "#b9774a", colC: "#8c4f2e", bands: 34, contrast: 0.6, spot: 1, seed: 5.5 },
  { name: "Saturn", au: "9.58", r: 16.0, size: 0.95, a0: 3.0, spin: 1.2, tilt: 0.47, type: 2, colA: "#ecdcae", colB: "#cdb27c", colC: "#b39a68", bands: 26, contrast: 0.4, seed: 6.1, ring: true },
  { name: "Uranus", au: "19.2", r: 18.8, size: 0.5, a0: 0.2, spin: 0.9, tilt: 1.71, type: 3, colA: "#a9e4e6", colB: "#86cfd8", colC: "#c6f1f2", contrast: 0.15, seed: 7.4, atmo: "#9be8f0", atmoK: 0.6 },
  { name: "Neptune", au: "30.1", r: 21.2, size: 0.48, a0: 2.6, spin: 0.9, tilt: 0.49, type: 3, colA: "#3d63d6", colB: "#2a43a3", colC: "#a9c4ff", contrast: 0.45, seed: 8.8, atmo: "#5b86ff", atmoK: 0.7 },
];

function ellipse(a, b, n = 240) {
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    p[i * 3] = Math.cos(t) * a;
    p[i * 3 + 1] = 0;
    p[i * 3 + 2] = Math.sin(t) * b;
  }
  return p;
}
const ORBITS = PLANETS.map((p) => ellipse(p.r, p.r, 220));
const DECOR = [
  { pts: ellipse(34, 22), rot: [0.35, 0.2, 0.1], op: 0.3 },
  { pts: ellipse(46, 30), rot: [-0.25, 0.9, 0.15], op: 0.22 },
  { pts: ellipse(28, 44), rot: [0.15, -0.5, 0.4], op: 0.18 },
];
const AXIS = new Float32Array([0, -44, 0, 0, 44, 0]);

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.6)");
  g.addColorStop(0.5, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------- liquid-metal title texture ------------------------ */

function makeMetalTexture() {
  const W = 700;
  const HH = 170;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = HH;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, HH);

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
    const c2 = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v;
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
  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  // deep navy -> glass blue -> icy white
  const STOPS = [
    [0.0, 14, 50, 108],
    [0.3, 28, 88, 160],
    [0.55, 64, 134, 208],
    [0.78, 152, 204, 245],
    [1.0, 246, 251, 255],
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

  for (let y = 0; y < HH; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / 85;
      const v = y / 85;
      // domain warping gives the flowing, liquid-glass look
      const qx = fbm(u, v);
      const qy = fbm(u + 5.2, v + 1.3);
      const h = fbm(u + 2.4 * qx, v + 2.4 * qy);
      let s = 0.5 + 0.5 * Math.sin(h * 17 + u * 0.6);
      s = Math.pow(s, 1.35);

      let [r, g, b] = ramp(s);

      // thin bright reflection streaks, like light on glass folds
      const streak = smooth(0.93, 1.0, 0.5 + 0.5 * Math.sin(h * 38 + u * 0.4)) * 0.85;
      r = mix(r, 255, streak);
      g = mix(g, 255, streak);
      b = mix(b, 255, streak);

      // a few warm sparkles
      const glint = smooth(0.8, 0.92, fbm(u * 1.4 + 9, v * 1.4 + 2)) * 0.75;
      r = mix(r, 255, glint);
      g = mix(g, 222, glint);
      b = mix(b, 188, glint);

      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL("image/png");
}

/* ------------------------------ galaxy particles ----------------------------- */

function makeGalaxy(n) {
  const polar = new Float32Array(n * 3); // r, theta0, y  (stored in "position")
  const col = new Float32Array(n * 3);
  const sb = new Float32Array(n * 2); // size, brightness
  const seed = new Float32Array(n);
  const cCore = rgb("#fff0cf");
  const cMid = rgb("#e0aa5e");
  const cOuter = rgb("#8f5c38");
  const cBlue = rgb("#a9c1ff");
  const c = new THREE.Vector3();
  let s = 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 2;

  for (let i = 0; i < n; i++) {
    const u = rnd();
    let r, th, y, size, bright;
    if (u < 0.12) {
      r = Math.abs(gauss()) * 4 + 0.2;
      th = rnd() * TAU;
      y = gauss() * 1.1;
      size = 0.1 + rnd() * 0.1;
      bright = 0.3;
    } else {
      r = 2 + Math.pow(rnd(), 1.3) * GALAXY_R;
      const arm = i % ARMS;
      th = arm * (TAU / ARMS) + r * SPIN + gauss() * (0.3 - 0.12 * (r / GALAXY_R));
      y = gauss() * (1 - 0.65 * (r / GALAXY_R));
      size = 0.12 + Math.pow(rnd(), 3) * 0.26;
      bright = 0.5 + rnd() * 0.5;
    }
    const k = Math.min(1, r / GALAXY_R);
    if (k < 0.35) c.lerpVectors(cCore, cMid, k / 0.35);
    else c.lerpVectors(cMid, cOuter, (k - 0.35) / 0.65);
    if (rnd() < 0.06) {
      c.lerpVectors(cMid, cBlue, 0.75); // a few blue sparkle stars
      bright *= 1.4;
    }
    polar.set([r, th, y], i * 3);
    col.set([c.x, c.y, c.z], i * 3);
    sb.set([size, bright], i * 2);
    seed[i] = rnd();
  }
  return { polar, col, sb, seed };
}

const GALAXY_VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec2 aSB;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uMaxSize;
varying vec3 vColor;
float omega(float r){ return ${OM} / (1.0 + r * 0.1); }
void main(){
  float r = position.x;
  float th = position.y + uTime * omega(r);
  vec3 p = vec3(cos(th) * r, position.z, sin(th) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.78 + 0.22 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 50.0);
  gl_PointSize = clamp(aSB.x * uScale / max(-mv.z, 0.01), 1.0, uMaxSize);
  vColor = aColor * aSB.y * tw;
}
`;

const GALAXY_FRAG = /* glsl */ `
uniform float uFade;
uniform float uBright;
varying vec3 vColor;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a = a * a;
  gl_FragColor = vec4(vColor * uFade * uBright, a);
}
`;

/* ------------------------------- galaxy disc shader ------------------------------- */

const DISC_VERT = /* glsl */ `
varying vec2 vP;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const DISC_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFade;
varying vec2 vP;

float omega(float r){ return ${OM} / (1.0 + r * 0.1); }

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p){
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

// one layer of fine stars. cell = size of a grid cell in galaxy units, fp = size of one pixel in galaxy units
float starLayer(vec2 p, float cell, float fp, float dens, float seed){
  vec2 g = p / cell;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash21(id + seed);
  float prob = clamp(0.03 + dens * 0.22, 0.0, 0.45);
  if (h > prob) return 0.0;
  vec2 off = (vec2(hash21(id + seed + 7.7), hash21(id + seed + 3.1)) - 0.5) * 0.6;
  float d = length(f - off);
  float px = cell / max(fp, 1e-6);
  float lod = smoothstep(1.2, 3.0, px) * (1.0 - smoothstep(40.0, 120.0, px));
  float b = pow(hash21(id + seed + 11.3), 2.0) * 0.9 + 0.1;
  return smoothstep(0.30, 0.0, d) * b * lod;
}

void main(){
  vec2 p = vP;
  float r = length(p);
  if (r > 46.0) discard;
  float th = atan(p.y, p.x);

  // spiral arm phase, wobbled by noise so the arms look natural
  float w = fbm2(p * 0.12 + 3.0);
  float ph = ${ARMS}.0 * (th - r * ${SPIN_G} - uTime * omega(r)) + (w - 0.5) * 2.2;

  float armA = 0.5 + 0.5 * cos(ph);
  float arms = pow(armA, 2.6);
  float disc = exp(-r / 15.0);
  float outer = smoothstep(46.0, 22.0, r);
  float bulge = exp(-r * r / 22.0) * 1.6 + exp(-r / 3.2) * 0.9;
  float lumps = fbm2(p * 0.5 + vec2(uTime * 0.01, 0.0));
  float dens = (arms * (0.35 + 0.9 * lumps) * disc * 2.2 + disc * 0.25) * outer;

  // dust lanes along the edge of each arm
  float lane = pow(0.5 + 0.5 * cos(ph - 0.9), 5.0) * smoothstep(3.0, 9.0, r) * (0.5 + fbm2(p * 0.9));
  dens *= 1.0 - 0.75 * clamp(lane, 0.0, 1.0);

  vec3 warm = vec3(1.0, 0.80, 0.52);
  vec3 gold = vec3(0.95, 0.66, 0.34);
  vec3 blue = vec3(0.62, 0.74, 1.0);
  float k = clamp(r / 36.0, 0.0, 1.0);
  vec3 col = mix(warm, gold, smoothstep(0.0, 0.5, k));
  col = mix(col, blue, smoothstep(0.3, 0.9, k) * arms * 0.55);

  float haze = exp(-r / 9.0) * 0.12;

  // fine stars at several scales, so it stays sharp at any zoom
  float fp = max(fwidth(p.x), fwidth(p.y));
  float stars = 0.0;
  for (int i = 0; i < 4; i++) {
    float cell = 0.12 * pow(2.9, float(i));
    stars += starLayer(p, cell, fp, dens + bulge * 0.3, float(i) * 17.0);
  }
  vec3 sc = mix(vec3(1.0, 0.9, 0.72), vec3(0.85, 0.9, 1.0), hash21(floor(p / 0.35)));

  vec3 light = col * dens * 1.15 + vec3(1.0, 0.86, 0.6) * bulge + warm * haze + sc * stars * 1.6;
  light = 1.0 - exp(-light * 1.15);
  light *= uFade;
  light += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(light, 1.0);
}
`;

/* ------------------------------------ planets ----------------------------------- */

const NOISE = /* glsl */ `
float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

const PLANET_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
void main(){
  vObj = position;
  vNormalW = mat3(modelMatrix) * normal;
  vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLANET_FRAG = /* glsl */ `
uniform int uType;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uSeed;
uniform float uBands;
uniform float uContrast;
uniform float uSpot;
uniform float uCap;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uAtmo;
uniform float uAtmoK;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
${NOISE}
void main(){
  vec3 p = normalize(vObj);
  vec3 col = uColA;
  float glint = 0.0;

  if (uType == 0) {
    float n = fbm(p * 3.0 + uSeed);
    float d = fbm(p * 14.0 + uSeed * 2.0);
    float cr = 1.0 - abs(noise(p * 9.0 + uSeed) * 2.0 - 1.0);
    col = mix(uColA, uColB, n);
    col *= 0.75 + 0.5 * d;
    col = mix(col, uColC, smoothstep(0.78, 0.95, cr) * 0.45);
    col = mix(col, vec3(0.95), smoothstep(0.9, 0.96, abs(p.y) + (n - 0.5) * 0.06) * uCap);
  } else if (uType == 1) {
    float h = fbm(p * 2.4 + uSeed);
    float land = smoothstep(0.50, 0.53, h);
    vec3 ocean = mix(uColA * 0.55, uColA, smoothstep(0.25, 0.5, h));
    vec3 landCol = mix(vec3(0.20, 0.36, 0.14), uColB, clamp(smoothstep(0.52, 0.72, h) + noise(p * 18.0) * 0.25, 0.0, 1.0));
    col = mix(ocean, landCol, land);
    float ice = smoothstep(0.82, 0.9, abs(p.y) + (h - 0.5) * 0.1);
    col = mix(col, vec3(0.93, 0.95, 1.0), ice);
    float cl = fbm(p * 4.5 + vec3(uTime * 0.02, 0.0, 0.0) + 7.0);
    float cloud = smoothstep(0.52, 0.72, cl);
    col = mix(col, vec3(1.0), cloud * 0.8);
    glint = (1.0 - land) * (1.0 - cloud);
  } else if (uType == 2) {
    float lat = p.y;
    float warp = fbm(vec3(p.x * 2.0, lat * 3.0, p.z * 2.0) + uSeed);
    float b = sin(lat * uBands + warp * 3.5) * 0.5 + 0.5;
    float fine = fbm(vec3(p.x * 5.0, lat * 30.0, p.z * 5.0) + uSeed * 3.0);
    col = mix(uColA, uColB, b);
    col = mix(col, uColC, smoothstep(0.55, 0.8, fine) * 0.5 * uContrast);
    float lon = atan(p.z, p.x);
    vec2 dd = vec2((lon - 0.8) * 1.2, (lat + 0.28) * 4.0);
    float spot = exp(-dot(dd, dd) * 3.0);
    col = mix(col, vec3(0.72, 0.28, 0.17), spot * 0.85 * uSpot);
  } else {
    vec3 q = vec3(fbm(p * 2.5 + uSeed), fbm(p * 2.5 + uSeed + 5.2), fbm(p * 2.5 + uSeed + 9.1));
    float n = fbm(p * 3.0 + q * 2.0);
    col = mix(uColA, uColB, n);
    float streak = smoothstep(0.62, 0.78, fbm(vec3(p.x * 6.0, p.y * 22.0, p.z * 6.0) + uSeed)) * uContrast;
    col = mix(col, uColC, streak);
  }

  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uSun - vPosW);
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, L);
  float dif = clamp((ndl + 0.1) / 1.1, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), 70.0) * glint * 0.55;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float dayFade = 0.15 + 0.85 * smoothstep(-0.25, 0.5, ndl);
  vec3 outc = col * (0.07 + 1.1 * dif) + vec3(sp) + uAtmo * fres * uAtmoK * dayFade;
  gl_FragColor = vec4(outc, 1.0);
}
`;

const SUN_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
void main(){
  vObj = position;
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const SUN_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
${NOISE}
void main(){
  vec3 p = normalize(vObj);
  float n = fbm(p * 5.0 + vec3(0.0, 0.0, uTime * 0.18));
  float m = fbm(p * 14.0 - vec3(uTime * 0.25, 0.0, 0.0));
  vec3 col = mix(vec3(1.0, 0.38, 0.05), vec3(1.0, 0.82, 0.38), n);
  col = mix(col, vec3(1.0, 0.97, 0.8), smoothstep(0.55, 0.9, m) * 0.5);
  float mu = max(dot(normalize(vN), normalize(vV)), 0.0);
  col *= 0.45 + 0.75 * pow(mu, 0.45);
  gl_FragColor = vec4(col * 1.25, 1.0);
}
`;

const RING_VERT = /* glsl */ `
varying float vRad;
varying vec3 vPosW;
varying vec3 vNW;
void main(){
  vRad = length(position.xy);
  vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
  vNW = mat3(modelMatrix) * vec3(0.0, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform vec2 uRadii;
uniform vec3 uSun;
varying float vRad;
varying vec3 vPosW;
varying vec3 vNW;
${NOISE}
void main(){
  float t = clamp((vRad - uRadii.x) / (uRadii.y - uRadii.x), 0.0, 1.0);
  float b = noise(vec3(t * 70.0, 1.7, 0.0)) * 0.6 + noise(vec3(t * 260.0, 4.1, 0.0)) * 0.4;
  float a = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.93, 1.0, t));
  a *= 1.0 - (1.0 - smoothstep(0.0, 0.03, abs(t - 0.62))) * 0.92;
  a *= 0.30 + 0.70 * b;
  vec3 col = mix(vec3(0.62, 0.54, 0.40), vec3(0.93, 0.86, 0.70), b);
  vec3 L = normalize(uSun - vPosW);
  float lit = 0.35 + 0.65 * abs(dot(normalize(vNW), L));
  gl_FragColor = vec4(col * lit, a * 0.9);
}
`;

/* ------------------------------------- scene ------------------------------------ */

function Scene({ labels }) {
  const sysRef = useRef();
  const markerRef = useRef();
  const beltRef = useRef();
  const orbitRefs = useRef([]);
  const tiltRefs = useRef([]);
  const spinRefs = useRef([]);
  const tex = useMemo(glowTexture, []);
  const galaxy = useMemo(() => makeGalaxy(26000), []);

  const galaxyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 1400 },
          uMaxSize: { value: 8 },
          uFade: { value: 1 },
          uBright: { value: 0.6 },
        },
        vertexShader: GALAXY_VERT,
        fragmentShader: GALAXY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const discMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
        vertexShader: DISC_VERT,
        fragmentShader: DISC_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const planetMats = useMemo(
    () =>
      PLANETS.map(
        (pl) =>
          new THREE.ShaderMaterial({
            uniforms: {
              uType: { value: pl.type },
              uColA: { value: rgb(pl.colA) },
              uColB: { value: rgb(pl.colB) },
              uColC: { value: rgb(pl.colC) },
              uSeed: { value: pl.seed },
              uBands: { value: pl.bands || 0 },
              uContrast: { value: pl.contrast ?? 0.5 },
              uSpot: { value: pl.spot || 0 },
              uCap: { value: pl.cap || 0 },
              uTime: { value: 0 },
              uSun: { value: new THREE.Vector3() },
              uAtmo: { value: rgb(pl.atmo || "#ffffff") },
              uAtmoK: { value: pl.atmoK || 0 },
            },
            vertexShader: PLANET_VERT,
            fragmentShader: PLANET_FRAG,
          })
      ),
    []
  );

  const sunMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: SUN_VERT,
        fragmentShader: SUN_FRAG,
      }),
    []
  );

  const ringMat = useMemo(() => {
    const saturn = PLANETS.find((p) => p.ring);
    return new THREE.ShaderMaterial({
      uniforms: {
        uRadii: { value: new THREE.Vector2(saturn.size * SIZE_K * 1.45, saturn.size * SIZE_K * 2.4) },
        uSun: { value: new THREE.Vector3() },
      },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  const belt = useMemo(() => {
    const n = 2600;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 9.4 + Math.random() * 1.2;
      const th = Math.random() * TAU;
      a[i * 3] = Math.cos(th) * r;
      a[i * 3 + 1] = (Math.random() - 0.5) * 0.25;
      a[i * 3 + 2] = Math.sin(th) * r;
    }
    return a;
  }, []);

  const tmp = useMemo(
    () => ({
      sun: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      look: new THREE.Vector3(),
      d0: new THREE.Vector3(0.2, 0.7, 0.9).normalize(),
      d1: new THREE.Vector3(0, 0.38, 1).normalize(),
    }),
    []
  );

  useFrame(({ clock, camera, gl, size }) => {
    const t = clock.elapsedTime;
    const p = Math.min(1, t / T);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * p); // ease in and out

    // the Sun rides on its spiral arm as the galaxy turns
    const th = SUN_THETA0 + t * omega(SUN_R);
    tmp.sun.set(Math.cos(th) * SUN_R, 0, Math.sin(th) * SUN_R);
    sysRef.current.position.copy(tmp.sun);

    // dive from far away to the Sun (exponential zoom feels steady)
    const dist = Math.exp(THREE.MathUtils.lerp(Math.log(120), Math.log(0.65), e));
    tmp.dir.lerpVectors(tmp.d0, tmp.d1, e).normalize();
    if (t > T) tmp.dir.applyAxisAngle(Y_AXIS, (t - T) * 0.07); // slow drift once we arrive
    camera.position.copy(tmp.sun).addScaledVector(tmp.dir, dist);
    tmp.look.set(0, 0, 0).lerp(tmp.sun, THREE.MathUtils.smoothstep(p, 0.05, 0.75));
    // aim a little above the Sun at the end, so the system sits in the lower part of the screen
    tmp.look.y += 0.1 * THREE.MathUtils.smoothstep(p, 0.7, 1.0);
    camera.lookAt(tmp.look);

    const fade = THREE.MathUtils.lerp(0.18, 1, THREE.MathUtils.smoothstep(dist, 1, 14));

    // galaxy
    const gu = galaxyMat.uniforms;
    gu.uTime.value = t;
    gu.uScale.value =
      (size.height * gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    gu.uFade.value = fade;
    discMat.uniforms.uTime.value = t;
    discMat.uniforms.uFade.value = fade;

    // planets: orbit, spin, light
    PLANETS.forEach((pl, i) => {
      const ang = pl.a0 + (t * 6) / Math.pow(pl.r, 1.5);
      if (orbitRefs.current[i]) orbitRefs.current[i].rotation.y = ang;
      if (tiltRefs.current[i]) tiltRefs.current[i].rotation.y = -ang; // keep each axis pointing the same way in space
      if (spinRefs.current[i]) spinRefs.current[i].rotation.y = t * pl.spin;
      planetMats[i].uniforms.uTime.value = t;
      planetMats[i].uniforms.uSun.value.copy(tmp.sun);
    });
    ringMat.uniforms.uSun.value.copy(tmp.sun);
    sunMat.uniforms.uTime.value = t;
    if (beltRef.current) beltRef.current.rotation.y = t * 0.05;

    // glow that marks where we are heading, fading out as we arrive
    markerRef.current.position.copy(tmp.sun);
    markerRef.current.scale.setScalar(dist * 0.09);
    markerRef.current.material.opacity = THREE.MathUtils.smoothstep(dist, 3, 40) * 0.9;
  });

  return (
    <>
      <Stars radius={260} depth={60} count={3500} factor={4} fade speed={0} />

      {/* smooth glowing galaxy disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <planeGeometry args={[100, 100]} />
        <primitive object={discMat} attach="material" />
      </mesh>

      {/* particle layer for depth and sparkle */}
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[galaxy.polar, 3]} />
          <bufferAttribute attach="attributes-aColor" args={[galaxy.col, 3]} />
          <bufferAttribute attach="attributes-aSB" args={[galaxy.sb, 2]} />
          <bufferAttribute attach="attributes-aSeed" args={[galaxy.seed, 1]} />
        </bufferGeometry>
        <primitive object={galaxyMat} attach="material" />
      </points>

      <sprite ref={markerRef}>
        <spriteMaterial map={tex} color="#ffd98a" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      <group ref={sysRef} scale={SYS_SCALE}>
        {/* the Sun */}
        <mesh>
          <sphereGeometry args={[1.5, 64, 48]} />
          <primitive object={sunMat} attach="material" />
        </mesh>
        <sprite scale={[10, 10, 1]}>
          <spriteMaterial map={tex} color="#ffb45a" transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <sprite scale={[30, 30, 1]}>
          <spriteMaterial map={tex} color="#ff9a3c" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>

        {/* thin gold decorative ellipses and axis */}
        {DECOR.map((d, i) => (
          <lineLoop key={i} rotation={d.rot}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[d.pts, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#d6b36a" transparent opacity={d.op} />
          </lineLoop>
        ))}
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[AXIS, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#d6b36a" transparent opacity={0.2} />
        </lineSegments>

        {/* asteroid belt */}
        <group ref={beltRef}>
          <points>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[belt, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#c9b690" size={1.3} sizeAttenuation={false} transparent opacity={0.85} depthWrite={false} />
          </points>
        </group>

        {PLANETS.map((pl, i) => (
          <group key={pl.name}>
            <lineLoop>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[ORBITS[i], 3]} />
              </bufferGeometry>
              <lineBasicMaterial color="#d6b36a" transparent opacity={0.42} />
            </lineLoop>

            <group ref={(el) => (orbitRefs.current[i] = el)}>
              <group position={[pl.r, 0, 0]}>
                <group ref={(el) => (tiltRefs.current[i] = el)} rotation={[0, 0, pl.tilt || 0]}>
                  <mesh ref={(el) => (spinRefs.current[i] = el)}>
                    <sphereGeometry args={[pl.size * SIZE_K, 64, 48]} />
                    <primitive object={planetMats[i]} attach="material" />
                  </mesh>
                  {pl.ring && (
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                      <ringGeometry args={[pl.size * SIZE_K * 1.45, pl.size * SIZE_K * 2.4, 128, 1]} />
                      <primitive object={ringMat} attach="material" />
                    </mesh>
                  )}
                </group>
              </group>

              <Html position={[pl.r, 0, 0]} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
                <div
                  style={{
                    marginLeft: 16,
                    marginTop: -26,
                    whiteSpace: "nowrap",
                    opacity: labels ? 1 : 0,
                    transition: "opacity 1.6s ease",
                    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                    fontSize: 10,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "#e8d3a0",
                  }}
                >
                  {pl.name}
                  <span style={{ opacity: 0.55, marginLeft: 8 }}>{pl.au} AU</span>
                </div>
              </Html>
            </group>
          </group>
        ))}
      </group>
    </>
  );
}

/* --------------------------------------- UI -------------------------------------- */

const caption = (show) => ({
  position: "absolute",
  bottom: "14%",
  left: 0,
  right: 0,
  textAlign: "center",
  fontSize: 14,
  letterSpacing: "0.5em",
  textTransform: "uppercase",
  color: "#d9c8a0",
  opacity: show ? 1 : 0,
  transform: show ? "none" : "translateY(8px)",
  transition: "opacity 0.9s ease, transform 0.9s ease",
  pointerEvents: "none",
});

export default function Intro({ onDone }) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [metal, setMetal] = useState(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    const ts = [
      setTimeout(() => setStep(1), 600), // "The Milky Way"
      setTimeout(() => setStep(2), 4200), // "Our Sun"
      setTimeout(() => setStep(3), 7000), // title
      setTimeout(() => setStep(4), 8600), // subtitle + planet labels
      setTimeout(() => setStep(5), 9800), // enter button
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  // build the liquid-metal texture once, right after mount
  useEffect(() => {
    const id = setTimeout(() => setMetal(makeMetalTexture()), 60);
    return () => clearTimeout(id);
  }, []);

  function leave() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    setTimeout(onDone, 900);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        leave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const titleOn = step >= 3;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "#000",
        opacity: leaving ? 0 : 1,
        transition: "opacity 0.9s ease",
        pointerEvents: leaving ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: step >= 1 ? 1 : 0, transition: "opacity 1.4s ease" }}>
        <Canvas dpr={[1, 1.5]} camera={{ fov: 50, near: 0.001, far: 600, position: [30, 90, 120] }}>
          <Scene labels={step >= 4} />
        </Canvas>
      </div>

      <div style={caption(step === 1)}>The Milky Way</div>
      <div style={caption(step === 2)}>Our Sun</div>

      <div style={{ position: "absolute", top: "12%", left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
        <div
          style={{
            fontFamily: '"Orbitron", "Inter", system-ui, sans-serif',
            fontSize: "clamp(56px, 11vw, 150px)",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: titleOn ? "0.32em" : "0.9em",
            paddingLeft: titleOn ? "0.32em" : "0.9em",
            opacity: titleOn ? 1 : 0,
            filter: `blur(${titleOn ? 0 : 14}px) drop-shadow(0 0 26px rgba(255,150,70,0.35))`,
            transition: "all 2.2s cubic-bezier(0.2, 0.7, 0.2, 1)",
          }}
        >
          <span
            style={{
              display: "inline-block",
              backgroundImage: metal
                ? `url(${metal})`
                : "linear-gradient(100deg, #6e4228, #cf9c66 45%, #fff1d7 70%, #8a5a3a)",
              backgroundSize: "100% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
              WebkitTextStroke: "1.5px rgba(255,232,196,0.55)",
            }}
          >
            SOLICE
          </span>
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: "clamp(13px, 1.6vw, 18px)",
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "#eadfc4",
            opacity: step >= 4 ? 1 : 0,
            transform: step >= 4 ? "none" : "translateY(10px)",
            transition: "all 1.2s ease",
          }}
        >
          Explore the worlds beyond our Sun
        </div>
      </div>

      <button
        type="button"
        onClick={leave}
        style={{
          position: "absolute",
          bottom: "9%",
          left: "50%",
          transform: step >= 5 ? "translateX(-50%)" : "translateX(-50%) translateY(12px)",
          opacity: step >= 5 ? 1 : 0,
          pointerEvents: step >= 5 ? "auto" : "none",
          transition: "all 0.9s ease",
          padding: "14px 40px",
          fontSize: 15,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "#fff6e0",
          background: "rgba(255,214,150,0.08)",
          border: "1px solid rgba(240,210,150,0.6)",
          borderRadius: 999,
          backdropFilter: "blur(8px)",
          boxShadow: "0 0 30px rgba(255,190,110,0.25)",
        }}
      >
        Enter
      </button>

      <button
        type="button"
        onClick={leave}
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          padding: "8px 14px",
          fontSize: 12,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#b9a883",
          background: "transparent",
          border: "1px solid #4a4030",
          borderRadius: 999,
        }}
      >
        Skip ›
      </button>
    </div>
  );
}