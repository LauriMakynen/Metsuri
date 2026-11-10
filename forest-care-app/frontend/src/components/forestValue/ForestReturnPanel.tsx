import { useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import {
  defaultHistoryPeriod,
  formatEur,
  formatNumber,
  formatSigned as signed,
  formatSignedPct,
} from '../../utils/forestValueFormat';
import type { ForestValueHistory, HistoryPeriod } from '../../types';

// Growth = more wood, price = the same wood is worth more. Validated as a pair for
// colour-vision deficiencies; both are also labelled in text.
const GROWTH_COLOR = '#15803d';
const PRICE_COLOR = '#2563eb';


const CHART_W = 560;
const CHART_H = 170;
const PAD = { top: 12, right: 12, bottom: 24, left: 12 };

// Estimated value by year as a single line with a hover crosshair
function ValueChart({ points }: { points: ForestValueHistory['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const geometry = useMemo(() => {
    const values = points.map((p) => p.valueEur);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const innerW = CHART_W - PAD.left - PAD.right;
    const innerH = CHART_H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
    const y = (value: number) => PAD.top + (1 - (value - min) / span) * innerH;
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.valueEur).toFixed(1)}`).join(' ');
    const base = PAD.top + innerH;
    const area = `${line} L${x(points.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`;
    return { x, y, line, area, base };
  }, [points]);

  if (points.length < 2) return null;
  const last = points.length - 1;
  const active = hover ?? last;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const inner = (ratio * CHART_W - PAD.left) / (CHART_W - PAD.left - PAD.right);
    setHover(Math.min(last, Math.max(0, Math.round(inner * last))));
  };

  // First, last and a middle year are enough to read the axis
  const ticks = [...new Set([0, Math.round(last / 2), last])];

  return (
    <figure className="return-chart">
      <figcaption>
        <strong>{points[active].year}</strong> · {formatEur(points[active].valueEur)} ·{' '}
        {formatNumber(points[active].volumeM3)} m³
        {active === last ? ' (nyt)' : ' (arvio)'}
      </figcaption>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Puuston arvioitu arvo vuosina ${points[0].year}–${points[last].year}: ${formatEur(points[0].valueEur)} → ${formatEur(points[last].valueEur)}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={geometry.base} y2={geometry.base} className="return-chart-axis" />
        <path d={geometry.area} className="return-chart-area" />
        <path d={geometry.line} className="return-chart-line" />
        {hover !== null && (
          <line
            x1={geometry.x(active)} x2={geometry.x(active)} y1={PAD.top} y2={geometry.base}
            className="return-chart-crosshair"
          />
        )}
        <circle cx={geometry.x(active)} cy={geometry.y(points[active].valueEur)} r={5} className="return-chart-dot" />
        {ticks.map((i) => (
          <text
            key={i}
            x={geometry.x(i)}
            y={CHART_H - 6}
            textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
            className="return-chart-tick"
          >
            {points[i].year}
          </text>
        ))}
      </svg>
    </figure>
  );
}

// How much of the change came from growth and how much from the price
function EffectSplit({ period }: { period: HistoryPeriod }) {
  const growth = Math.max(0, period.growthEffectEur);
  const price = Math.max(0, period.priceEffectEur);
  const total = growth + price;
  return (
    <div className="return-split">
      {/* A bar only when both effects point the same way; otherwise the figures alone */}
      {total > 0 && period.growthEffectEur >= 0 && period.priceEffectEur >= 0 && (
        <div className="return-split-bar" aria-hidden="true">
          {growth > 0 && <span style={{ flexGrow: growth, background: GROWTH_COLOR }} />}
          {price > 0 && <span style={{ flexGrow: price, background: PRICE_COLOR }} />}
        </div>
      )}
      <dl className="return-split-legend">
        <div>
          <dt><span className="return-swatch" style={{ background: GROWTH_COLOR }} /> Puuston kasvu</dt>
          <dd>{signed(period.growthEffectEur, formatEur)}</dd>
        </div>
        <div>
          <dt><span className="return-swatch" style={{ background: PRICE_COLOR }} /> Puun hinnan muutos</dt>
          <dd>{signed(period.priceEffectEur, formatEur)}</dd>
        </div>
      </dl>
    </div>
  );
}

// Return of the standing timber over a chosen period, like a fund's return view
export default function ForestReturnPanel({ history }: { history: ForestValueHistory }) {
  const [years, setYears] = useState<number | null>(() => defaultHistoryPeriod(history)?.years ?? null);
  const period = history.periods.find((p) => p.years === years) ?? history.periods[0];
  if (!period) return null;

  const usable = period.accuracy !== 'unavailable';
  const direction = !usable || period.changeEur === 0 ? 'flat' : period.changeEur > 0 ? 'up' : 'down';
  const chartPoints = usable ? history.series.filter((p) => p.year >= period.fromYear) : [];

  return (
    <div className="return-panel">
      <div className="return-periods" role="group" aria-label="Jakso">
        {history.periods.map((p) => (
          <button
            key={p.years}
            type="button"
            className={`return-period ${p.years === period.years ? 'active' : ''}`}
            aria-pressed={p.years === period.years}
            onClick={() => setYears(p.years)}
          >
            {p.years} v
          </button>
        ))}
      </div>

      {usable ? (
        <>
          <div className={`return-headline ${direction}`}>
            <strong>{period.changePct !== null ? formatSignedPct(period.changePct) : signed(period.changeEur, formatEur)}</strong>
            <span>
              {signed(period.changeEur, formatEur)} · {period.fromYear}–{period.fromYear + period.years}
              {period.annualPct !== null && period.years > 1 ? ` · ${formatSignedPct(period.annualPct)} / v` : ''}
            </span>
          </div>

          <ValueChart points={chartPoints} />

          <dl className="return-stats">
            <div>
              <dt>Puuston määrä</dt>
              <dd>
                {formatNumber(period.volumeThenM3)} → {formatNumber(period.volumeNowM3)} m³
                <small>{signed(period.volumeNowM3 - period.volumeThenM3, (v) => `${formatNumber(v)} m³`)}</small>
              </dd>
            </div>
            <div>
              <dt>Puuston arvo</dt>
              <dd>
                {formatEur(period.valueThenEur)} → {formatEur(period.valueNowEur)}
                <small>{signed(period.changeEur, formatEur)}</small>
              </dd>
            </div>
          </dl>

          <EffectSplit period={period} />
        </>
      ) : (
        <p className="return-unavailable">{period.note}</p>
      )}

      <p className="return-footnote">
        <span className="return-badge">Arvio</span>
        {usable && period.note ? `${period.note} ` : ''}
        Laskettu nykyisestä puustosta kasvumallilla taaksepäin ja Luken kantohintatilastosta (
        {history.priceYears.to - period.years}–{history.priceYears.to}). Ei sisällä puukauppatuloja eikä hoitokuluja.
        {history.provider === 'mock' ? ' Puustotieto on esimerkkidataa.' : ''}
      </p>
      <p className="return-footnote">
        Toteutunut arvo tallentuu tästä eteenpäin kerran kuukaudessa
        {history.recorded.length > 0 ? ` (tallessa ${history.recorded.length} kk)` : ''}, joten ajan myötä arvion
        rinnalle saadaan todellinen kehitys.
      </p>
    </div>
  );
}
