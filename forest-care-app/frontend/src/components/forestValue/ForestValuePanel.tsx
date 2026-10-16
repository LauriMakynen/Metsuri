import { useEffect, useRef } from 'react';
import type { ForestValueEntry } from '../../hooks/useForestValue';
import type { ForestValueWarning, Property, RecommendedOperation } from '../../types';
import { dataSourceLabel } from '../../utils/forestValueFormat';
import OperationsList from './OperationsList';
import StandList from './StandList';
import ValueDisclaimer from './ValueDisclaimer';
import ValueSummary from './ValueSummary';

interface ForestValuePanelProps {
  property: Property;
  entry: ForestValueEntry | undefined;
  onReload: () => void;
  onClose: () => void;
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  onRequestOffers?: (operation: RecommendedOperation) => void;
}

function Warnings({ warnings }: { warnings: ForestValueWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="fv-warnings">
      {warnings.map((w) => (
        <li key={w.code} className="fv-warning">
          <span aria-hidden="true">⚠️</span>
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  );
}

function PanelSkeleton() {
  return (
    <div className="fv-panel-body" aria-busy="true">
      <div className="fv-skeleton fv-skeleton-label" />
      <div className="fv-skeleton fv-skeleton-hero" />
      <div className="fv-skeleton fv-skeleton-block" />
      <div className="fv-skeleton fv-skeleton-block" />
      <span className="sr-only">Lasketaan metsäpalstan arvoa…</span>
    </div>
  );
}

// "Laske metsäpalstan arvo": side panel on desktop, full screen on mobile
export default function ForestValuePanel({
  property,
  entry,
  onReload,
  onClose,
  selectedStandId,
  onSelectStand,
  onRequestOffers,
}: ForestValuePanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the panel when it opens and give focus back to the opener on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const response = entry?.response ?? null;
  const loading = entry?.status === 'loading';

  let body;
  if (!response) {
    body =
      entry?.status === 'failed' ? (
        <div className="fv-panel-body">
          <p className="fv-state-message">Puuston arvon hakeminen epäonnistui. Tarkista verkkoyhteys.</p>
          <button className="btn btn-primary btn-compact" onClick={onReload}>Yritä uudelleen</button>
        </div>
      ) : (
        <PanelSkeleton />
      );
  } else if (response.status !== 'available') {
    body = (
      <div className="fv-panel-body">
        <p className="fv-state-message">{response.message}</p>
        {response.status === 'error' && (
          <button className="btn btn-primary btn-compact" onClick={onReload} disabled={loading}>
            {loading ? 'Haetaan…' : 'Yritä uudelleen'}
          </button>
        )}
      </div>
    );
  } else {
    const { result } = response;
    body = (
      <div className="fv-panel-body">
        <p className="fv-panel-source">{dataSourceLabel(result)}</p>
        <Warnings warnings={result.warnings} />
        <ValueSummary result={result} />
        <StandList stands={result.stands} selectedStandId={selectedStandId} onSelectStand={onSelectStand} />
        <OperationsList
          operations={result.operations}
          onSelectStand={onSelectStand}
          onRequestOffers={onRequestOffers}
        />
        <ValueDisclaimer result={result} />
      </div>
    );
  }

  return (
    <aside className="fv-panel" role="dialog" aria-labelledby="fv-panel-title">
      <header className="fv-panel-header">
        <div>
          <p className="fv-panel-kicker">Metsäpalstan arvo</p>
          <h2 id="fv-panel-title">{property.name}</h2>
        </div>
        <div className="fv-panel-actions">
          {response?.status === 'available' && (
            <button
              type="button"
              className="fv-icon-btn"
              onClick={onReload}
              disabled={loading}
              aria-label="Päivitä tiedot rajapinnoista"
              title="Päivitä tiedot"
            >
              <span aria-hidden="true" className={loading ? 'fv-spin' : ''}>↻</span>
            </button>
          )}
          <button ref={closeRef} type="button" className="fv-icon-btn" onClick={onClose} aria-label="Sulje">
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </header>
      {body}
    </aside>
  );
}
