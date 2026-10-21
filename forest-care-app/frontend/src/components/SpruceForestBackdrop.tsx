import { useMemo } from 'react';

// Fixed, full-page illustration of a misty Finnish spruce forest at dawn.
// Drawn as SVG so it needs no image file, stays sharp at any size and loads instantly.

const WIDTH = 1600;
const HEIGHT = 900;

// Deterministic pseudo-random numbers so the forest looks the same on every render
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One spruce: a narrow crown built from drooping branch tiers that widen towards the ground. */
function spruce(x: number, base: number, height: number, width: number, rand: () => number): string {
  const tiers = 7 + Math.floor(rand() * 4);
  const top = base - height;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 1; i <= tiers; i++) {
    const y = top + (height * 0.92 * i) / tiers;
    const half = (width / 2) * (0.18 + (0.82 * i) / tiers) * (0.85 + rand() * 0.3);
    const tuck = half * 0.45; // branch tips droop, then the next tier starts closer to the trunk
    right.push(`L${(x + half).toFixed(1)} ${(y + 4).toFixed(1)} L${(x + tuck).toFixed(1)} ${(y - 2).toFixed(1)}`);
    left.unshift(`L${(x - tuck).toFixed(1)} ${(y - 2).toFixed(1)} L${(x - half).toFixed(1)} ${(y + 4).toFixed(1)}`);
  }
  return `M${x.toFixed(1)} ${top.toFixed(1)} ${right.join(' ')} L${x + width * 0.05} ${base} L${x - width * 0.05} ${base} ${left.join(' ')} Z`;
}

interface Layer {
  base: number;
  minH: number;
  maxH: number;
  spacing: number;
  fill: string;
  seed: number;
}

// Far (pale, misty) to near (dark)
const LAYERS: Layer[] = [
  { base: 560, minH: 120, maxH: 190, spacing: 26, fill: '#a9c9b5', seed: 11 },
  { base: 640, minH: 170, maxH: 260, spacing: 34, fill: '#6f9f80', seed: 23 },
  { base: 740, minH: 240, maxH: 360, spacing: 46, fill: '#2f6b47', seed: 37 },
  { base: 900, minH: 360, maxH: 540, spacing: 70, fill: '#123d26', seed: 53 },
];

function layerPath(layer: Layer): string {
  const rand = mulberry32(layer.seed);
  const trees: string[] = [];
  for (let x = -40; x < WIDTH + 40; x += layer.spacing * (0.7 + rand() * 0.6)) {
    const h = layer.minH + rand() * (layer.maxH - layer.minH);
    trees.push(spruce(x, layer.base, h, h * (0.32 + rand() * 0.08), rand));
  }
  // Ground under the layer so no sky shows between trunks
  trees.push(`M-40 ${layer.base - 6} H${WIDTH + 40} V${HEIGHT} H-40 Z`);
  return trees.join(' ');
}

export default function SpruceForestBackdrop() {
  const paths = useMemo(() => LAYERS.map(layerPath), []);

  return (
    <div className="forest-backdrop" aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="forest-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dcebe2" />
            <stop offset="0.55" stopColor="#f3efe0" />
            <stop offset="1" stopColor="#e4efe6" />
          </linearGradient>
          <radialGradient id="forest-sun" cx="0.72" cy="0.42" r="0.35">
            <stop offset="0" stopColor="#fff6d8" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="forest-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f8f3" stopOpacity="0" />
            <stop offset="0.5" stopColor="#f4f8f3" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f4f8f3" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill="url(#forest-sky)" />
        <rect width={WIDTH} height={HEIGHT} fill="url(#forest-sun)" />

        {paths.map((d, i) => (
          <g key={i}>
            <path d={d} fill={LAYERS[i].fill} />
            {/* Mist band drifting in front of the far layers */}
            {i < 2 && <rect y={LAYERS[i].base - 90} width={WIDTH} height={140} fill="url(#forest-mist)" />}
          </g>
        ))}
      </svg>
    </div>
  );
}
