import { useEffect, useMemo, useRef, useState } from 'react';

// Decorative underground under the start page cards: tree roots grow down from the forest floor
// into soil that darkens from brown to black. Generated procedurally (seeded, so it looks the same
// on every visit) and sized to the element, so phones get roots drawn for their own shape.

interface RootPoint { x: number; y: number; w: number }
interface Stone { x: number; y: number; rx: number; ry: number; rot: number; tone: number }

/** Small deterministic PRNG (mulberry32) */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOWN = Math.PI / 2;

interface RootSeed { x: number; y: number; angle: number; w: number; gravity: number }

/** Grows every root as a polyline whose width tapers towards the tip */
function growRoots(width: number, height: number): RootPoint[][] {
  const rng = random(20261124);
  const roots: RootPoint[][] = [];
  const scale = Math.min(1, Math.max(0.6, width / 1100));

  // Main roots start along the forest floor at the top edge: some sink straight down (taproots),
  // most spread sideways near the surface before turning down, like spruce and pine roots
  const mainCount = Math.round(Math.max(9, width / 130));
  // Each main root gets an equal share of points, so the whole width gets roots
  const perRoot = Math.round(14000 / mainCount);
  for (let i = 0; i < mainCount; i++) {
    const x = ((i + 0.2 + rng() * 0.6) / mainCount) * width;
    const sinker = rng() < 0.35;
    const side = rng() < 0.5 ? -1 : 1;
    const angle = sinker ? DOWN + (rng() - 0.5) * 0.5 : DOWN + side * (0.75 + rng() * 0.55);
    const w = (sinker ? 20 + rng() * 8 : 24 + rng() * 12) * scale;
    growRootSystem({ x, y: -12, angle, w, gravity: sinker ? 0.06 : 0.03 }, perRoot, width, height, rng, roots);
  }
  return roots;
}

/** One main root with its branches and rootlets, at most `budget` points */
function growRootSystem(
  start: RootSeed,
  budget: number,
  width: number,
  height: number,
  rng: () => number,
  roots: RootPoint[][]
) {
  const stack: RootSeed[] = [start];
  while (stack.length > 0 && budget > 0) {
    const root = stack.pop()!;
    const points: RootPoint[] = [{ x: root.x, y: root.y, w: root.w }];
    let { x, y, angle, w } = root;
    while (w > 0.35 && y < height + 20 && x > -80 && x < width + 80 && budget-- > 0) {
      // Wander a little and slowly bend towards straight down
      angle += (rng() - 0.5) * 0.38;
      angle += (DOWN - angle) * root.gravity;
      // On tall layouts (stacked cards on a phone) the roots take longer strides to reach the bottom
      const step = (5 + Math.min(w, 14) * 0.4) * Math.max(1, height / 1100);
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      // Thin out slowly, a bit faster once the root is already fine
      w *= w > 3 ? 0.991 - rng() * 0.006 : 0.975 - rng() * 0.01;
      points.push({ x, y, w });
      // Thicker roots fork less often but their branches carry on further
      if (w > 0.7 && rng() < (w > 6 ? 0.05 : 0.07)) {
        const turn = (0.45 + rng() * 0.7) * (rng() < 0.5 ? -1 : 1);
        stack.push({ x, y, angle: angle + turn, w: w * (0.3 + rng() * 0.3), gravity: root.gravity * 1.3 });
        w *= 0.93;
      }
      // Fine rootlets: short hair-like side roots along the thicker roots
      if (w > 2 && rng() < 0.06) {
        const turn = (0.9 + rng() * 0.6) * (rng() < 0.5 ? -1 : 1);
        stack.push({ x, y, angle: angle + turn, w: 0.9 + rng() * 0.9, gravity: 0.04 });
      }
    }
    if (points.length > 2) roots.push(points);
  }
}

/** Outline of a tapered ribbon along the points; offset shifts it across the root (−1…1 of the width) */
function ribbon(points: RootPoint[], widthFactor: number, offset = 0): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const { x, y, w } = points[i];
    const cx = x + nx * w * offset * 0.5;
    const cy = y + ny * w * offset * 0.5;
    const half = (w * widthFactor) / 2;
    left.push(`${(cx + nx * half).toFixed(1)},${(cy + ny * half).toFixed(1)}`);
    right.push(`${(cx - nx * half).toFixed(1)},${(cy - ny * half).toFixed(1)}`);
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}

function scatterStones(width: number, height: number): Stone[] {
  const rng = random(77);
  const count = Math.round((width * height) / 26000);
  return Array.from({ length: count }, () => {
    const r = 1.5 + rng() ** 3 * 9;
    return {
      x: rng() * width,
      y: height * (0.12 + rng() * 0.8),
      rx: r * (1 + rng() * 0.6),
      ry: r,
      rot: rng() * 180,
      tone: rng(),
    };
  });
}

export default function RootsBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  // Sizes are rounded so small changes (scrollbars, toolbars) don't regrow the roots
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width / 100) * 100;
      const h = Math.round(entry.contentRect.height / 100) * 100;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const drawing = useMemo(() => {
    if (!size || size.w === 0 || size.h === 0) return null;
    const roots = growRoots(size.w, size.h);
    return {
      // Thick roots last so they lie on top of the fine ones
      roots: roots.sort((a, b) => a[0].w - b[0].w),
      stones: scatterStones(size.w, size.h),
    };
  }, [size]);

  // Fades are anchored to the bottom edge (in px), where the open soil under the cards is
  const fromBottom = (px: number) => (size ? Math.min(1, Math.max(0.05, 1 - px / size.h)).toFixed(3) : '0');

  return (
    <div className="roots-backdrop" ref={ref} aria-hidden="true">
      {size && drawing && (
        <svg width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
          <defs>
            {/* Soil: coarse clods and fine grain */}
            <filter id="roots-soil" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.045 0.06" numOctaves="4" seed="8" result="clods" />
              <feColorMatrix
                in="clods"
                type="matrix"
                values="0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0 0.11  0 0 0 1.3 -0.5"
                result="clodColor"
              />
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain" />
              <feColorMatrix
                in="grain"
                type="matrix"
                values="0 0 0 0 0.05  0 0 0 0 0.03  0 0 0 0 0.02  0 0 0 1.4 -0.6"
                result="grainColor"
              />
              <feMerge>
                <feMergeNode in="clodColor" />
                <feMergeNode in="grainColor" />
              </feMerge>
            </filter>
            {/* Roots: slightly irregular edges and a soft shadow pressing them into the soil */}
            <filter id="roots-bark" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="5" result="bark" />
              <feDisplacementMap in="SourceGraphic" in2="bark" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="rough" />
              <feDropShadow in="rough" dx="0" dy="2" stdDeviation="2.2" floodColor="#000" floodOpacity="0.75" />
            </filter>
            {/* Roots show best in the brown band and sink into darkness further down */}
            <linearGradient id="roots-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
              <stop offset={fromBottom(420)} stopColor="#fff" stopOpacity="1" />
              <stop offset={fromBottom(200)} stopColor="#fff" stopOpacity="0.75" />
              <stop offset={fromBottom(70)} stopColor="#fff" stopOpacity="0.15" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="roots-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={size.w} height={size.h}>
              <rect width={size.w} height={size.h} fill="url(#roots-fade)" />
            </mask>
            {/* The soil texture fades out too, so the bottom is plain black */}
            <linearGradient id="soil-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
              <stop offset={fromBottom(380)} stopColor="#fff" stopOpacity="0.75" />
              <stop offset={fromBottom(120)} stopColor="#fff" stopOpacity="0.2" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="soil-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={size.w} height={size.h}>
              <rect width={size.w} height={size.h} fill="url(#soil-fade)" />
            </mask>
            <radialGradient id="roots-stone" cx="0.38" cy="0.32" r="0.75">
              <stop offset="0" stopColor="#8b8174" />
              <stop offset="0.6" stopColor="#544b40" />
              <stop offset="1" stopColor="#231d17" />
            </radialGradient>
          </defs>

          <g mask="url(#soil-mask)">
            <rect width={size.w} height={size.h} filter="url(#roots-soil)" />
          </g>

          <g mask="url(#roots-mask)">
            {drawing.stones.map((s, i) => (
              <ellipse
                key={i}
                cx={s.x.toFixed(1)}
                cy={s.y.toFixed(1)}
                rx={s.rx.toFixed(1)}
                ry={s.ry.toFixed(1)}
                transform={`rotate(${s.rot.toFixed(0)} ${s.x.toFixed(1)} ${s.y.toFixed(1)})`}
                fill="url(#roots-stone)"
                opacity={(0.35 + s.tone * 0.4).toFixed(2)}
              />
            ))}
            <g filter="url(#roots-bark)">
              {drawing.roots.map((points, i) => (
                <g key={i}>
                  {/* Body, then the shaded underside and a light ridge: reads as a round root */}
                  <path d={ribbon(points, 1)} fill={i % 3 === 0 ? '#6e4c2f' : i % 3 === 1 ? '#5f4128' : '#765436'} />
                  <path d={ribbon(points, 0.45, -0.55)} fill="#24160b" opacity="0.55" />
                  <path d={ribbon(points, 0.22, 0.42)} fill="#c49a6c" opacity="0.32" />
                </g>
              ))}
            </g>
          </g>
        </svg>
      )}
    </div>
  );
}
