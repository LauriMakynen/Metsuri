import type { ForestValueResult } from '../../types';
import {
  ASSORTMENT_LABEL,
  ASSORTMENT_ORDER,
  SPECIES_LABEL,
  SPECIES_ORDER,
  formatEur,
  formatEurRange,
  formatHa,
  formatNumber,
} from '../../utils/forestValueFormat';

interface BarItem {
  label: string;
  value: number;
}

// Single-series horizontal bars: one hue, direct value labels, so the numbers
// are readable without the bars (they double as the table view)
function BarList({ title, items, total }: { title: string; items: BarItem[]; total: number }) {
  const visible = items.filter((i) => i.value > 0);
  const max = Math.max(...visible.map((i) => i.value), 1);
  return (
    <figure className="fv-bars">
      <figcaption className="fv-subheading">{title}</figcaption>
      {visible.length === 0 ? (
        <p className="fv-muted">Ei arvoa.</p>
      ) : (
        <ul>
          {visible.map((item) => {
            const share = total > 0 ? item.value / total : 0;
            return (
              <li key={item.label} className="fv-bar-row" title={`${item.label}: ${formatEur(item.value)}`}>
                <span className="fv-bar-label">{item.label}</span>
                <span className="fv-bar-track" aria-hidden="true">
                  <span className="fv-bar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
                </span>
                <span className="fv-bar-value">
                  {formatEur(item.value)} <small>{Math.round(share * 100)} %</small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}

export default function ValueSummary({ result }: { result: ForestValueResult }) {
  const total = SPECIES_ORDER.reduce((sum, s) => sum + result.valueBySpecies[s], 0);
  const hasValue = result.value.midEur > 0;

  return (
    <section className="fv-section" aria-labelledby="fv-summary-heading">
      <h3 id="fv-summary-heading" className="fv-section-title">Yhteenveto</h3>

      <div className="fv-hero">
        <p className="fv-hero-label">Puuston arvioitu nykyarvo</p>
        <p className="fv-hero-value">{hasValue ? formatEurRange(result.value.lowEur, result.value.highEur) : '–'}</p>
        {hasValue && (
          <p className="fv-hero-sub">
            Keskiarvo {formatEur(result.value.midEur)} · epävarmuus ±{Math.round(result.value.uncertainty * 100)} %
          </p>
        )}
      </div>

      <dl className="fv-stats">
        <div className="fv-stat">
          <dt>Pinta-ala</dt>
          <dd>{formatHa(result.areaHa)}</dd>
          {result.forestLandAreaHa < result.areaHa - 0.05 && (
            <small>metsämaata {formatHa(result.forestLandAreaHa)}</small>
          )}
        </div>
        <div className="fv-stat">
          <dt>Kokonaistilavuus</dt>
          <dd>{formatNumber(result.totalVolumeM3)} m³</dd>
          <small>{formatNumber(result.volumeM3PerHa)} m³/ha</small>
        </div>
        <div className="fv-stat">
          <dt>Keski-ikä</dt>
          <dd>{result.meanAgeYears !== null ? `${result.meanAgeYears} v` : '–'}</dd>
          <small>pinta-alalla painotettu</small>
        </div>
      </dl>

      <div className="fv-bars-grid">
        <BarList
          title="Arvo puulajeittain"
          total={total}
          items={SPECIES_ORDER.map((s) => ({ label: SPECIES_LABEL[s], value: result.valueBySpecies[s] }))}
        />
        <BarList
          title="Arvo puutavaralajeittain"
          total={total}
          items={ASSORTMENT_ORDER.map((a) => ({ label: ASSORTMENT_LABEL[a], value: result.valueByAssortment[a] }))}
        />
      </div>
    </section>
  );
}
