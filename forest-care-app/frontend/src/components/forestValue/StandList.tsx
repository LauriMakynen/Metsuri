import type { StandValuation } from '../../types';
import {
  DEVELOPMENT_CLASS_LABEL,
  SPECIES_LABEL,
  SPECIES_ORDER,
  formatEur,
  formatHa,
  formatNumber,
  formatPercent,
  standTitle,
} from '../../utils/forestValueFormat';

interface StandListProps {
  stands: StandValuation[];
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
}

function speciesMix(stand: StandValuation): string {
  const parts = SPECIES_ORDER.filter((s) => stand.speciesShares[s] >= 0.05).map(
    (s) => `${SPECIES_LABEL[s]} ${formatPercent(stand.speciesShares[s])}`
  );
  return parts.length ? parts.join(' · ') : '–';
}

export default function StandList({ stands, selectedStandId, onSelectStand }: StandListProps) {
  const sorted = [...stands].sort((a, b) => b.valueEur - a.valueEur);

  return (
    <section className="fv-section" aria-labelledby="fv-stands-heading">
      <h3 id="fv-stands-heading" className="fv-section-title">Puusto kuvioittain</h3>
      <p className="fv-muted">
        {stands.length} kuviota, järjestetty arvon mukaan. Valitse kuvio nähdäksesi sen kartalla.
      </p>
      <ul className="fv-stand-list">
        {sorted.map((stand) => {
          const selected = stand.standId === selectedStandId;
          return (
            <li key={stand.standId}>
              <button
                type="button"
                className={`fv-stand ${selected ? 'selected' : ''}`}
                aria-pressed={selected}
                onClick={() => onSelectStand(stand.standId)}
              >
                <span className="fv-stand-head">
                  <strong>{standTitle(stand.standNumber)}</strong>
                  <span className="fv-stand-value">{formatEur(stand.valueEur)}</span>
                </span>
                <span className="fv-stand-class">
                  {stand.developmentClass ? DEVELOPMENT_CLASS_LABEL[stand.developmentClass] : 'Kehitysluokka ei tiedossa'}
                  {!stand.isForestLand && ' · ei metsämaata'}
                </span>
                <span className="fv-stand-grid">
                  <span><small>Ala palstalla</small>{formatHa(stand.areaHaInParcel)}</span>
                  <span><small>Ikä</small>{stand.meanAgeYears !== null ? `${stand.meanAgeYears} v` : '–'}</span>
                  <span>
                    <small>Tilavuus</small>
                    {formatNumber(stand.volumeM3)} m³ ({formatNumber(stand.volumeM3PerHa)} m³/ha)
                  </span>
                  <span>
                    <small>Laatu</small>
                    {stand.volumeM3 > 0
                      ? `tukki ${formatPercent(stand.sawlogShare)}, kuitu ${formatPercent(stand.pulpwoodShare)}`
                      : '–'}
                  </span>
                </span>
                <span className="fv-stand-species">
                  {stand.mainSpecies && <strong>{SPECIES_LABEL[stand.mainSpecies]}</strong>}
                  {stand.mainSpecies && ' – '}
                  {speciesMix(stand)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
