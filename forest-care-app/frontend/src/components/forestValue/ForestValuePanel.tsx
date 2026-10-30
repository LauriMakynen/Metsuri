import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ForestValueEntry } from '../../hooks/useForestValue';
import type { ForestValueResult, ForestValueWarning, ManualStandInput, Property, RecommendedOperation } from '../../types';
import { dataSourceLabel } from '../../utils/forestValueFormat';
import ManualStandForm from './ManualStandForm';
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
  presentation?: 'sidebar' | 'modal' | 'standalone';
  onRequestOffers?: (operation: RecommendedOperation) => void;
  // Absent for the guest demo, which always has data
  onSubmitManual?: (input: ManualStandInput) => Promise<void>;
}

// Full screen (and therefore modal) below this width
const MOBILE_QUERY = '(max-width: 899px)';

function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(MOBILE_QUERY);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(MOBILE_QUERY).matches
  );
}

function manualInputOf(result: ForestValueResult): ManualStandInput | null {
  const stand = result.stands[0];
  if (!stand?.mainSpecies) return null;
  return { species: stand.mainSpecies, ageYears: stand.meanAgeYears ?? 0, volumeM3PerHa: Math.round(stand.volumeM3PerHa) };
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

// The value breakdown opens as a map sidebar or a standalone side panel.
export default function ForestValuePanel({
  property,
  entry,
  onReload,
  onClose,
  selectedStandId,
  onSelectStand,
  presentation = 'sidebar',
  onRequestOffers,
  onSubmitManual,
}: ForestValuePanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const isMobile = useIsMobile();
  const isModal = presentation === 'modal' || isMobile;
  const [editingManual, setEditingManual] = useState(false);

  // Focus the panel when it opens and give focus back to the opener on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Keep keyboard focus inside full-screen and modal presentations
      if (e.key !== 'Tab' || !isModal || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isModal]);

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
        <div className={`fv-state ${response.status === 'error' ? 'fv-state-error' : ''}`} role="status">
          <p className="fv-state-message">{response.message}</p>
          {response.status === 'error' && (
            <button className="btn btn-primary btn-compact" onClick={onReload} disabled={loading}>
              {loading ? 'Haetaan…' : 'Yritä uudelleen'}
            </button>
          )}
        </div>
        {response.status === 'no_data' && onSubmitManual && <ManualStandForm onSubmit={onSubmitManual} />}
      </div>
    );
  } else {
    const { result } = response;
    body = (
      <div className="fv-panel-body">
        <p className="fv-panel-source">
          {dataSourceLabel(result)}
          {result.data.provider === 'manual' && onSubmitManual && !editingManual && (
            <>
              {' · '}
              <button type="button" className="btn-link" onClick={() => setEditingManual(true)}>
                Muokkaa tietoja
              </button>
            </>
          )}
        </p>
        {editingManual && onSubmitManual && (
          <ManualStandForm
            initial={manualInputOf(result)}
            onSubmit={async (input) => {
              await onSubmitManual(input);
              setEditingManual(false);
            }}
            onCancel={() => setEditingManual(false)}
          />
        )}
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
    <aside
      ref={panelRef}
      className={`fv-panel${presentation === 'modal' ? ' fv-panel-modal' : ''}${presentation === 'standalone' ? ' fv-panel-standalone' : ''}`}
      role="dialog"
      aria-modal={isModal}
      aria-labelledby="fv-panel-title"
    >
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
