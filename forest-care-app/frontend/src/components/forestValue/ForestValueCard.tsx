import { useForestValue } from '../../hooks/useForestValue';
import type { Property } from '../../types';
import { dataSourceLabel, formatEurRange, formatNumber } from '../../utils/forestValueFormat';

interface ForestValueCardProps {
  property: Property;
  onOpenDetails: () => void;
}

export function ForestValueCardSkeleton() {
  return (
    <div className="fv-card" aria-busy="true" aria-label="Lasketaan puuston arvoa">
      <div className="fv-skeleton fv-skeleton-label" />
      <div className="fv-skeleton fv-skeleton-value" />
      <div className="fv-skeleton fv-skeleton-line" />
      <div className="fv-skeleton fv-skeleton-line short" />
    </div>
  );
}

// Compact value summary for the selected parcel; details open in ForestValuePanel
export default function ForestValueCard({ property, onOpenDetails }: ForestValueCardProps) {
  const { entry, reload } = useForestValue(property);
  const response = entry?.response ?? null;

  if (!response) {
    if (entry?.status === 'failed') {
      return (
        <div className="fv-card" role="status">
          <p className="fv-card-message">Puuston arvon hakeminen epäonnistui.</p>
          <button className="btn btn-secondary btn-compact" onClick={() => reload(false)}>
            Yritä uudelleen
          </button>
        </div>
      );
    }
    return <ForestValueCardSkeleton />;
  }

  if (response.status !== 'available') {
    return (
      <div className="fv-card" role="status">
        <p className="fv-card-label">Puuston arvo</p>
        <p className="fv-card-message">{response.message}</p>
        {response.status === 'error' ? (
          <button className="btn btn-secondary btn-compact" onClick={() => reload(true)} disabled={entry?.status === 'loading'}>
            {entry?.status === 'loading' ? 'Haetaan…' : 'Yritä uudelleen'}
          </button>
        ) : (
          <button className="btn btn-secondary btn-compact" onClick={onOpenDetails}>
            Syötä puuston tiedot
          </button>
        )}
      </div>
    );
  }

  const { result, stale } = response;
  const hasValue = result.value.midEur > 0;
  // Reasons the number is missing or unreliable, shown on the card as well
  const notice = result.warnings.find((w) => w.code === 'no_forest_land' || w.code === 'small_parcel');

  return (
    <div className="fv-card">
      <p className="fv-card-label">Puuston arvioitu arvo</p>
      <p className="fv-card-value">
        {hasValue ? formatEurRange(result.value.lowEur, result.value.highEur) : '–'}
      </p>
      <p className="fv-card-volume">
        {formatNumber(result.totalVolumeM3)} m³ · {formatNumber(result.volumeM3PerHa)} m³/ha
      </p>
      {notice && <p className="fv-card-notice">{notice.message}</p>}
      <div className="fv-card-tags">
        <span className={`fv-tag ${result.data.isOutdated ? 'fv-tag-warn' : ''}`}>
          {dataSourceLabel(result)}
          {result.data.isOutdated && ' – vanhaa'}
        </span>
        {stale && <span className="fv-tag fv-tag-warn">Aiempi arvio</span>}
      </div>
      <button className="btn btn-primary fv-card-button" onClick={onOpenDetails}>
        Laske metsäpalstan arvo
      </button>
    </div>
  );
}
