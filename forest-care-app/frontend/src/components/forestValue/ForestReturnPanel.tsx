import { useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import {
  DEVELOPMENT_CLASS_LABEL,
  defaultHistoryPeriod,
  formatEur,
  formatNumber,
  formatSigned as signed,
  formatSignedPct,
  standTitle,
} from '../../utils/forestValueFormat';
import { MARKING_TYPE_LABELS } from '../../utils/markingTypes';
import { formatDate } from '../../utils/dateFormatting';
import type { ForestValueHistory, HistoryEvent, HistoryPeriod, HistoryPoint } from '../../types';

// Where the value change came from. Validated as a set for colour-vision deficiencies
// (adjacent pairs in this order); every part is also named in text.
const GROWTH_COLOR = '#15803d';
const PRICE_COLOR = '#2563eb';
const QUALITY_COLOR = '#d97706';

const CHART_W = 560;
const CHART_H = 210;
const PAD = { top: 12, right: 12, bottom: 26, left: 46 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

type ChartPoint = HistoryPoint & { kind: 'past' | 'now' | 'forecast' };

/** "45 t€": short axis label */
function compactEur(value: number): string {
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} M€`;
  if (value >= 1_000) return `${formatNumber(value / 1_000)} t€`;
  return `${formatNumber(value)} €`;
}

/** A round step giving about three grid lines up to max */
function niceStep(max: number): number {
  const raw = max / 3;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 5, 10].map((m) => m * magnitude).find((step) => step >= raw) ?? raw;
}

function fractionalYear(date: string): number {
  const d = new Date(date);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (365.25 * 24 * 60 * 60 * 1000);
}

interface ValueChartProps {
  points: ChartPoint[];
  events: HistoryEvent[];
  // Values in today's money (inflation taken out)
  real: boolean;
}

// Value by year: estimate with its range, the same start value following inflation, and
// a projection for the coming years. One euro axis; hover or touch reads a year.
function ValueChart({ points, events, real }: ValueChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const deflate = (p: ChartPoint, value: number) => (real ? value / p.priceLevel : value);
    const rows = points.map((p) => ({
      ...p,
      value: deflate(p, p.valueEur),
      low: deflate(p, p.lowEur),
      high: deflate(p, p.highEur),
    }));
    const first = rows[0];
    // What the starting value would be worth had it only kept up with consumer prices
    const benchmark = real
      ? []
      : rows.filter((p) => p.kind !== 'forecast').map((p) => (first.valueEur * p.priceLevel) / first.priceLevel);
    const max = Math.max(...rows.map((p) => p.high), ...benchmark) || 1;
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const firstYear = first.year;
    const span = rows[rows.length - 1].year - firstYear || 1;
    const x = (year: number) => PAD.left + ((year - firstYear) / span) * INNER_W;
    const y = (value: number) => PAD.top + (1 - value / top) * INNER_H;
    const path = (list: { year: number; v: number }[]) =>
      list.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.year).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');

    const past = rows.filter((p) => p.kind !== 'forecast');
    const future = rows.filter((p) => p.kind !== 'past');
    const band =
      path(rows.map((p) => ({ year: p.year, v: p.high }))) +
      ' ' +
      [...rows].reverse().map((p) => `L${x(p.year).toFixed(1)} ${y(p.low).toFixed(1)}`).join(' ') +
      ' Z';
    const grid: number[] = [];
    for (let value = step; value <= top + 1e-6; value += step) grid.push(value);

    return {
      rows, x, y, grid, band,
      line: path(past.map((p) => ({ year: p.year, v: p.value }))),
      forecast: future.length > 1 ? path(future.map((p) => ({ year: p.year, v: p.value }))) : '',
      benchmark: benchmark.length > 1 ? path(past.map((p, i) => ({ year: p.year, v: benchmark[i] }))) : '',
      benchmarkValues: benchmark,
      base: PAD.top + INNER_H,
      nowIndex: rows.findIndex((p) => p.kind === 'now'),
    };
  }, [points, real]);

  if (points.length < 2) return null;
  const { rows } = model;
  const active = hover ?? model.nowIndex;
  const point = rows[active];
  const yearEvents = events.filter((e) => Math.floor(fractionalYear(e.date)) === point.year);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * CHART_W;
    let nearest = 0;
    rows.forEach((p, i) => {
      if (Math.abs(model.x(p.year) - px) < Math.abs(model.x(rows[nearest].year) - px)) nearest = i;
    });
    setHover(nearest);
  };

  const last = rows.length - 1;
  const ticks = [...new Set([0, model.nowIndex, last])];
  const hasForecast = model.forecast !== '';

  return (
    <figure className="return-chart">
      <figcaption>
        <strong>{point.year}</strong> · {formatEur(point.value)}{' '}
        <span className="return-chart-range">({compactEur(point.low)}–{compactEur(point.high)})</span> ·{' '}
        {formatNumber(point.volumeM3)} m³ · {point.kind === 'now' ? 'nyt' : point.kind === 'past' ? 'arvio' : 'ennuste'}
        {point.kind === 'past' && model.benchmarkValues[active] !== undefined && (
          <> · inflaation mukaan {formatEur(model.benchmarkValues[active])}</>
        )}
        {yearEvents.map((e) => (
          <span key={`${e.date}-${e.title}`} className="return-chart-event-note">
            ◆ {MARKING_TYPE_LABELS[e.type] ?? e.type}: {e.title}
            {e.incomeEur ? ` · tulo ${formatEur(e.incomeEur)}` : ''}
            {e.costEur ? ` · kulu ${formatEur(e.costEur)}` : ''}
          </span>
        ))}
      </figcaption>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Puuston arvioitu arvo vuosina ${rows[0].year}–${rows[model.nowIndex].year}: ${formatEur(rows[0].value)} → ${formatEur(rows[model.nowIndex].value)}${hasForecast ? `, ennuste vuoteen ${rows[last].year}: ${formatEur(rows[last].value)}` : ''}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {model.grid.map((value) => (
          <g key={value}>
            <line x1={PAD.left} x2={CHART_W - PAD.right} y1={model.y(value)} y2={model.y(value)} className="return-chart-grid" />
            <text x={PAD.left - 6} y={model.y(value) + 4} textAnchor="end" className="return-chart-tick">
              {compactEur(value)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={model.base} y2={model.base} className="return-chart-axis" />
        <path d={model.band} className="return-chart-band" />
        {model.benchmark && <path d={model.benchmark} className="return-chart-benchmark" />}
        <path d={model.line} className="return-chart-line" />
        {hasForecast && <path d={model.forecast} className="return-chart-line forecast" />}
        {events.map((e) => {
          const year = fractionalYear(e.date);
          if (year < rows[0].year || year > rows[model.nowIndex].year + 1) return null;
          const cx = model.x(Math.min(year, rows[model.nowIndex].year));
          return (
            <path
              key={`${e.date}-${e.title}`}
              d={`M${cx} ${model.base - 7} l6 6 l-6 6 l-6 -6 Z`}
              className="return-chart-event"
            >
              <title>{`${formatDate(e.date)} · ${MARKING_TYPE_LABELS[e.type] ?? e.type}: ${e.title}`}</title>
            </path>
          );
        })}
        {hover !== null && (
          <line x1={model.x(point.year)} x2={model.x(point.year)} y1={PAD.top} y2={model.base} className="return-chart-crosshair" />
        )}
        <circle cx={model.x(point.year)} cy={model.y(point.value)} r={5} className="return-chart-dot" />
        {ticks.map((i) => (
          <text
            key={i}
            x={model.x(rows[i].year)}
            y={CHART_H - 6}
            textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
            className="return-chart-tick"
          >
            {rows[i].year}
          </text>
        ))}
      </svg>
      <ul className="return-legend">
        <li><span className="return-key line" /> Puuston arvo{real ? ' (nykyrahassa)' : ''}</li>
        <li><span className="return-key band" /> Arvion vaihteluväli</li>
        {model.benchmark && <li><span className="return-key benchmark" /> Sama arvo inflaation mukaan</li>}
        {hasForecast && <li><span className="return-key forecast" /> Ennuste nykyhinnoin</li>}
        {events.length > 0 && <li><span className="return-key event" /> Tehty työ</li>}
      </ul>
    </figure>
  );
}

// Where the return came from: parts of the value change, then income and costs
function ReturnBreakdown({ period }: { period: HistoryPeriod }) {
  const parts = [
    { label: 'Puuston kasvu', value: period.growthEffectEur, color: GROWTH_COLOR },
    { label: 'Puun hinnan muutos', value: period.priceEffectEur, color: PRICE_COLOR },
    { label: 'Järeytyminen (kuitupuusta tukiksi)', value: period.qualityEffectEur, color: QUALITY_COLOR },
  ];
  const positive = parts.every((p) => p.value >= 0) && parts.some((p) => p.value > 0);
  const hasMoney = period.incomeEur > 0 || period.costEur > 0 || period.harvestedEur < 0;

  return (
    <div className="return-split">
      <h4>Mistä tuotto syntyi</h4>
      {/* A bar only when every part points the same way; otherwise the figures alone */}
      {positive && (
        <div className="return-split-bar" aria-hidden="true">
          {parts.filter((p) => p.value > 0).map((p) => (
            <span key={p.label} style={{ flexGrow: p.value, background: p.color }} />
          ))}
        </div>
      )}
      <dl className="return-rows">
        {parts.map((p) => (
          <div key={p.label}>
            <dt><span className="return-swatch" style={{ background: p.color }} /> {p.label}</dt>
            <dd>{signed(p.value, formatEur)}</dd>
          </div>
        ))}
        {period.harvestedEur < 0 && (
          <div>
            <dt><span className="return-swatch empty" /> Hakattu puusto</dt>
            <dd>{signed(period.harvestedEur, formatEur)}</dd>
          </div>
        )}
        {hasMoney && (
          <>
            <div className="return-rows-sum">
              <dt>Puuston arvon muutos</dt>
              <dd>{signed(period.changeEur, formatEur)}</dd>
            </div>
            <div>
              <dt><span className="return-swatch empty" /> Puukauppatulot</dt>
              <dd>{signed(period.incomeEur, formatEur)}</dd>
            </div>
            <div>
              <dt><span className="return-swatch empty" /> Hoitotöiden kulut</dt>
              <dd>{signed(-period.costEur, formatEur)}</dd>
            </div>
          </>
        )}
        <div className="return-rows-sum total">
          <dt>Kokonaistuotto</dt>
          <dd>{signed(period.totalReturnEur, formatEur)}</dd>
        </div>
      </dl>
    </div>
  );
}

// Which stands are gaining value fastest; a slow, mature stand is a harvest candidate
function StandGrowthList({ stands }: { stands: ForestValueHistory['stands'] }) {
  if (stands.length === 0) return null;
  return (
    <details className="return-stands">
      <summary>Kuviot: missä arvo kasvaa ({stands.length})</summary>
      <div className="return-stands-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Kuvio</th>
              <th scope="col">Ikä</th>
              <th scope="col">Arvo</th>
              <th scope="col">Kasvu / v</th>
            </tr>
          </thead>
          <tbody>
            {stands.map((stand) => {
              const growth = stand.valueGrowthPct ?? stand.volumeGrowthPct;
              const mature = stand.developmentClass === '04' && growth < 2;
              return (
                <tr key={stand.standId}>
                  <th scope="row">
                    {standTitle(stand.standNumber)}
                    <small>
                      {formatNumber(stand.areaHa, 1)} ha
                      {stand.developmentClass ? ` · ${DEVELOPMENT_CLASS_LABEL[stand.developmentClass]}` : ''}
                    </small>
                  </th>
                  <td>{stand.ageYears !== null ? `${stand.ageYears} v` : '–'}</td>
                  <td>{formatEur(stand.valueNowEur)}</td>
                  <td>
                    {formatSignedPct(growth)}
                    {stand.valueGrowthPct === null && <small>tilavuus</small>}
                    {mature && <small className="return-stands-flag">kasvu hidastunut</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="return-footnote">
        Arvon kasvu viimeisen vuoden aikana nykyhinnoin (puuston kasvu ja järeytyminen). Uudistuskypsä kuvio,
        jonka kasvu on hidastunut, tuottaa usein enemmän hakattuna ja uudistettuna.
      </p>
    </details>
  );
}

// Return of the standing timber over a chosen period, like a fund's return view
export default function ForestReturnPanel({ history }: { history: ForestValueHistory }) {
  const [years, setYears] = useState<number | null>(() => defaultHistoryPeriod(history)?.years ?? null);
  const [real, setReal] = useState(false);
  const period = history.periods.find((p) => p.years === years) ?? history.periods[0];

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!period || period.accuracy === 'unavailable') return [];
    const past = history.series.filter((p) => p.year >= period.fromYear);
    // Look ahead about as far as the period looks back, at most the whole forecast
    const ahead = history.forecast.slice(0, Math.max(2, period.years));
    return [
      ...past.map((p, i) => ({ ...p, kind: i === past.length - 1 ? ('now' as const) : ('past' as const) })),
      ...ahead.map((p) => ({ ...p, kind: 'forecast' as const })),
    ];
  }, [history, period]);

  if (!period) return null;
  const usable = period.accuracy !== 'unavailable';
  const canReal = period.realTotalReturnPct !== null;
  const showReal = real && canReal;
  const totalPct = showReal ? period.realTotalReturnPct : period.totalReturnPct;
  const annualPct = showReal ? period.realTotalAnnualPct : period.totalAnnualPct;
  // Over decades the total percentage mostly shows how small the start was: lead with the yearly rate
  const leadWithAnnual = period.years >= 20 && annualPct !== null;
  const direction = !usable || period.totalReturnEur === 0 ? 'flat' : period.totalReturnEur > 0 ? 'up' : 'down';
  const periodEvents = history.events.filter((e) => fractionalYear(e.date) >= period.fromYear);
  const perHaYear = history.forestAreaHa > 0 ? period.years * history.forestAreaHa : 0;

  return (
    <div className="return-panel">
      <div className="return-controls">
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
        <button
          type="button"
          className={`return-toggle ${showReal ? 'active' : ''}`}
          aria-pressed={showReal}
          disabled={!usable || !canReal}
          onClick={() => setReal((value) => !value)}
          title="Näytä tuotto ilman inflaation vaikutusta"
        >
          Inflaatiokorjattu
        </button>
      </div>

      {usable ? (
        <>
          <div className={`return-headline ${direction}`}>
            <strong>
              {leadWithAnnual
                ? `${formatSignedPct(annualPct as number)} / v`
                : totalPct !== null
                  ? formatSignedPct(totalPct)
                  : signed(period.totalReturnEur, formatEur)}
            </strong>
            <span>
              {showReal ? 'Reaalinen kokonaistuotto' : 'Kokonaistuotto'} {period.fromYear}–{period.fromYear + period.years}
              {' · '}{signed(period.totalReturnEur, formatEur)}
              {leadWithAnnual && totalPct !== null ? ` · yhteensä ${formatSignedPct(totalPct)}` : ''}
              {!leadWithAnnual && annualPct !== null && period.years > 1 ? ` · ${formatSignedPct(annualPct)} / v` : ''}
              {period.inflationPct !== null ? ` · inflaatio ${formatSignedPct(period.inflationPct)}` : ''}
            </span>
          </div>

          <ValueChart points={chartPoints} events={periodEvents} real={showReal} />

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
                <small>
                  {signed(period.changeEur, formatEur)}
                  {period.changePct !== null ? ` (${formatSignedPct(period.changePct)})` : ''}
                </small>
              </dd>
            </div>
            {perHaYear > 0 && (
              <>
                <div>
                  <dt>Kasvu hehtaarilla</dt>
                  <dd>
                    {formatNumber((period.volumeNowM3 - period.volumeThenM3) / perHaYear, 1)} m³/ha/v
                    <small>{formatNumber(history.forestAreaHa, 1)} ha metsämaata</small>
                  </dd>
                </div>
                <div>
                  <dt>Tuotto hehtaarilla</dt>
                  <dd>
                    {signed(Math.round(period.totalReturnEur / perHaYear), formatEur)}/ha/v
                    <small>kokonaistuotto vuotta kohden</small>
                  </dd>
                </div>
              </>
            )}
          </dl>

          <ReturnBreakdown period={period} />
        </>
      ) : (
        <p className="return-unavailable">{period.note}</p>
      )}

      <StandGrowthList stands={history.stands} />

      <p className="return-footnote">
        <span className="return-badge">Arvio</span>
        {usable && period.note ? `${period.note} ` : ''}
        Laskettu nykyisestä puustosta kasvumallilla taaksepäin ja Luken kantohintatilastosta (
        {history.priceYears.to - period.years}–{history.priceYears.to}); inflaatio Tilastokeskuksen
        elinkustannusindeksistä. Tulot ja kulut tulevat tehtyihin töihin kirjatuista summista.
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
