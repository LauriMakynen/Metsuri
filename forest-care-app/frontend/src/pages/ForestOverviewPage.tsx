import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SpruceForestBackdrop from '../components/SpruceForestBackdrop';
import AddForestByCode from '../components/AddForestByCode';
import TopNav from '../components/TopNav';
import { markingsService, propertiesService, workRequestsService } from '../services/forestService';
import { useForestValue } from '../hooks/useForestValue';
import { formatDate, formatDateRange } from '../utils/dateFormatting';
import { formatArea } from '../utils/measurement';
import { MARKING_TYPE_LABELS } from '../utils/markingTypes';
import {
  OPERATION_LABEL,
  TIMING_LABEL,
  dataSourceLabel,
  defaultHistoryPeriod,
  formatEur,
  formatEurRange,
  formatNumber,
  formatSigned,
  formatSignedPct,
} from '../utils/forestValueFormat';
import ForestValuePanel from '../components/forestValue/ForestValuePanel';
import ForestReturnPanel from '../components/forestValue/ForestReturnPanel';
import type {
  ForestValueHistory,
  ForestValueHistoryResponse,
  HistoryPeriod,
  Marking,
  Property,
  WorkRequest,
} from '../types';

function getCoordinates(property: Property): string | null {
  if (!property.geometry) return null;
  const bounds = L.geoJSON(property.geometry as GeoJSON.Geometry).getBounds();
  if (!bounds.isValid()) return null;
  const center = bounds.getCenter();
  return `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
}

type HistoryState = 'loading' | 'failed' | ForestValueHistoryResponse;

// Card summary of the return history: "+8,4 % / 5 v"
function historySummary(state: HistoryState): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (state === 'loading') return { text: 'Lasketaan...', direction: 'flat' };
  if (state === 'failed' || state.status !== 'available') return { text: 'Ei saatavilla', direction: 'flat' };
  const period = defaultHistoryPeriod(state.history);
  if (!period || period.totalReturnPct === null) return { text: 'Ei saatavilla', direction: 'flat' };
  return {
    text: `${formatSignedPct(period.totalReturnPct)} / ${period.years} v`,
    direction: period.totalReturnPct > 0 ? 'up' : period.totalReturnPct < 0 ? 'down' : 'flat',
  };
}

const PORTFOLIO_PERIODS = [1, 5, 10];

// All parcels together, like a portfolio: total value and the return of the parcels that
// can be estimated for each period
function PortfolioSummary({ histories }: { histories: ForestValueHistory[] }) {
  if (histories.length < 2) return null;
  const valueNow = histories.reduce((sum, h) => sum + (h.periods[0]?.valueNowEur ?? 0), 0);
  const volumeNow = histories.reduce((sum, h) => sum + (h.periods[0]?.volumeNowM3 ?? 0), 0);
  const area = histories.reduce((sum, h) => sum + h.forestAreaHa, 0);
  const totals = PORTFOLIO_PERIODS.map((years) => {
    const usable = histories
      .map((h) => h.periods.find((p) => p.years === years))
      .filter((p): p is HistoryPeriod => Boolean(p && p.accuracy !== 'unavailable' && p.valueThenEur > 0));
    const base = usable.reduce((sum, p) => sum + p.valueThenEur, 0);
    const gain = usable.reduce((sum, p) => sum + p.totalReturnEur, 0);
    return { years, count: usable.length, gain, pct: base > 0 ? (gain / base) * 100 : null };
  });

  return (
    <dl className="glass-panel portfolio-summary" aria-label="Kaikki metsät yhteensä">
      <h2>Kaikki metsät yhteensä</h2>
      <div>
        <dt>Puuston arvo</dt>
        <dd>
          {formatEur(valueNow)}
          <small>{histories.length} palstaa · {formatNumber(area, 1)} ha</small>
        </dd>
      </div>
      <div>
        <dt>Puustoa</dt>
        <dd>
          {formatNumber(volumeNow)} m³
          <small>{area > 0 ? `${formatNumber(volumeNow / area)} m³/ha` : ''}</small>
        </dd>
      </div>
      {totals.map((total) => (
        <div key={total.years}>
          <dt>Tuotto {total.years} v (arvio)</dt>
          <dd className={total.pct === null ? '' : total.pct > 0 ? 'up' : total.pct < 0 ? 'down' : ''}>
            {total.pct === null ? '–' : formatSignedPct(total.pct)}
            <small>
              {total.pct === null
                ? 'ei arvioitavissa'
                : `${formatSigned(total.gain, formatEur)}${total.count < histories.length ? ` · ${total.count}/${histories.length} palstaa` : ''}`}
            </small>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Income and cost of a done work, editable in place: they feed the total return
function MarkingMoney({ marking, onUpdated }: { marking: Marking; onUpdated: (updated: Marking) => void }) {
  const isHarvest = marking.type === 'harvennus' || marking.type === 'avohakkuu';
  const [editing, setEditing] = useState(false);
  const [income, setIncome] = useState(marking.income_eur != null ? String(marking.income_eur) : '');
  const [cost, setCost] = useState(marking.cost_eur != null ? String(marking.cost_eur) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parse = (text: string): number | null | undefined => {
    if (!text.trim()) return null;
    const value = Number(text.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };

  const save = async () => {
    const incomeEur = isHarvest ? parse(income) : null;
    const costEur = parse(cost);
    if (incomeEur === undefined || costEur === undefined) {
      setError('Anna summat euroina, esim. 1500');
      return;
    }
    setSaving(true);
    setError('');
    try {
      onUpdated(await markingsService.update(marking.id, { income_eur: incomeEur, cost_eur: costEur }));
      setEditing(false);
    } catch {
      setError('Tallennus epäonnistui. Yritä uudelleen.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const hasMoney = marking.income_eur != null || marking.cost_eur != null;
    return (
      <span className="marking-money-row">
        {marking.income_eur != null && <span>Tulo {formatEur(marking.income_eur)}</span>}
        {marking.cost_eur != null && <span>Kulu {formatEur(marking.cost_eur)}</span>}
        <button type="button" className="btn-link" onClick={() => setEditing(true)}>
          {hasMoney ? 'Muokkaa summia' : isHarvest ? '+ Lisää puukauppatulo tai kulu' : '+ Lisää työn kulu'}
        </button>
      </span>
    );
  }
  return (
    <span className="marking-money-edit">
      {isHarvest && (
        <label>
          Puukauppatulo (€)
          <input type="text" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} disabled={saving} />
        </label>
      )}
      <label>
        Työn kulu (€)
        <input type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} disabled={saving} />
      </label>
      <button type="button" className="btn btn-primary btn-compact" onClick={save} disabled={saving}>
        {saving ? 'Tallennetaan...' : 'Tallenna'}
      </button>
      <button type="button" className="btn-link" onClick={() => setEditing(false)} disabled={saving}>
        Peruuta
      </button>
      {error && <span role="alert" className="photo-error-text">{error}</span>}
    </span>
  );
}

function sortByOperationDate(markings: Marking[]): Marking[] {
  return [...markings]
    .filter((marking) => marking.operation_date)
    .sort((a, b) => (b.operation_date ?? '').localeCompare(a.operation_date ?? ''));
}

function ForestDetails({
  property,
  markings,
  markingsLoading,
  requests,
  requestsLoading,
  markingsError,
  requestsError,
  history,
  onMarkingUpdated,
}: {
  history: HistoryState;
  onMarkingUpdated: (updated: Marking) => void;
  property: Property;
  markings: Marking[];
  markingsLoading: boolean;
  requests: WorkRequest[];
  requestsLoading: boolean;
  markingsError: boolean;
  requestsError: boolean;
}) {
  const navigate = useNavigate();
  const forestValue = useForestValue(property);
  const [forestValueOpen, setForestValueOpen] = useState(false);
  const valueEntry = forestValue.entry;
  const valueResponse = valueEntry?.response;
  const valueResult = valueResponse?.status === 'available' ? valueResponse.result : null;
  const openRequests = requests.filter((request) => request.status === 'open');
  const completed = sortByOperationDate(markings);
  const recommendations = valueResult?.operations ?? [];

  return (
    <div className="forest-details">
      <section className="forest-detail-section">
        <h3>Metsän arvioitu arvo</h3>
        <div className="forest-value-summary-row">
          <div className="forest-value-summary-content">
            {valueEntry?.status === 'loading' && <p role="status">Ladataan metsäarviota...</p>}
            {valueEntry?.status === 'failed' && <p role="alert">Metsäarvion lataaminen epäonnistui.</p>}
            {valueResponse?.status === 'no_data' && <p>{valueResponse.message}</p>}
            {valueResponse?.status === 'error' && <p role="alert">{valueResponse.message}</p>}
            {valueResult && (
              <>
                <p className="forest-value-main">{formatEur(valueResult.value.midEur)}</p>
                <p className="forest-detail-muted">
                  Arvioitu vaihteluväli {formatEurRange(valueResult.value.lowEur, valueResult.value.highEur)}
                  {' · '}{dataSourceLabel(valueResult)}
                </p>
              </>
            )}
          </div>
          <button
            className="btn btn-primary forest-value-details-button"
            type="button"
            onClick={() => setForestValueOpen(true)}
          >
            Laske metsäpalstan arvo
          </button>
        </div>
        {valueResult && valueResult.warnings.length > 0 && (
          <ul className="forest-warning-list">
            {valueResult.warnings.map((warning) => <li key={warning.code}>{warning.message}</li>)}
          </ul>
        )}
      </section>

      <section className="forest-detail-section">
        <h3>Tuottohistoria</h3>
        {history === 'loading' && <p role="status">Lasketaan tuottohistoriaa...</p>}
        {history === 'failed' && <p role="alert">Tuottohistorian lataaminen epäonnistui.</p>}
        {history !== 'loading' && history !== 'failed' && history.status !== 'available' && <p>{history.message}</p>}
        {history !== 'loading' && history !== 'failed' && history.status === 'available' && (
          <ForestReturnPanel history={history.history} />
        )}
      </section>

      <section className="forest-detail-section">
        <h3>Tulevat työt</h3>
        {requestsLoading ? (
          <p role="status">Ladataan työpyyntöjä...</p>
        ) : requestsError ? (
          <p role="alert">Työpyyntöjen lataaminen epäonnistui.</p>
        ) : openRequests.length === 0 && recommendations.length === 0 ? (
          <p>Ei kirjattuja työpyyntöjä tai arvioituja toimenpidesuosituksia.</p>
        ) : (
          <ul className="forest-detail-list">
            {openRequests.map((request) => (
              <li key={`request-${request.id}`}>
                <strong>{request.title}</strong>
                <span>{MARKING_TYPE_LABELS[request.type]} · Työpyyntö avoinna</span>
              </li>
            ))}
            {recommendations.map((operation) => (
              <li key={`${operation.standId}-${operation.type}`}>
                <strong>{OPERATION_LABEL[operation.type]}</strong>
                <span>
                  Arvioitu ajankohta: {TIMING_LABEL[operation.timing]} ({operation.year})
                  {operation.estimatedIncomeEur !== null
                    ? ` · arvioitu myyntitulo ${formatEur(operation.estimatedIncomeEur)}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="forest-detail-section">
        <h3>Tehdyt työt</h3>
        {markingsError ? (
          <p role="alert">Tehtyjen töiden lataaminen epäonnistui.</p>
        ) : markingsLoading ? (
          <p role="status">Ladataan tehtyjä töitä...</p>
        ) : completed.length === 0 ? (
          <p>Ei kirjattuja tehtyjä töitä.</p>
        ) : (
          <ul className="forest-detail-list">
            {completed.map((marking) => (
              <li key={marking.id}>
                <strong>{marking.title}</strong>
                <span>
                  {MARKING_TYPE_LABELS[marking.type]} · {formatDate(marking.operation_date ?? '')}
                  {marking.area_ha ? ` · ${formatArea(marking.area_ha)}` : ''}
                </span>
                {marking.description && <span>{marking.description}</span>}
                {marking.id > 0 && <MarkingMoney marking={marking} onUpdated={onMarkingUpdated} />}
              </li>
            ))}
          </ul>
        )}
      </section>
      {forestValueOpen && (
        <ForestValuePanel
          property={property}
          entry={forestValue.entry}
          onReload={() => forestValue.reload(true)}
          onClose={() => setForestValueOpen(false)}
          selectedStandId={null}
          onSelectStand={(standId) => {
            navigate(
              `/map?propertyId=${property.id}&from=forests&standId=${encodeURIComponent(standId)}`
            );
          }}
          presentation="standalone"
          onSubmitManual={forestValue.submitManual}
        />
      )}
    </div>
  );
}

function ForestCard({
  property,
  requests,
  requestsLoading,
  requestsError,
  history,
  onHistoryChanged,
}: {
  property: Property;
  requests: WorkRequest[];
  requestsLoading: boolean;
  requestsError: boolean;
  history: HistoryState;
  // A done work's income or cost changed: the return history needs recomputing
  onHistoryChanged: () => void;
}) {
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [markings, setMarkings] = useState<Marking[]>([]);
  const [markingsLoading, setMarkingsLoading] = useState(true);
  const [markingsError, setMarkingsError] = useState(false);
  const coordinates = getCoordinates(property);
  const summary = historySummary(history);

  useEffect(() => {
    let cancelled = false;
    propertiesService.getMarkings(property.id)
      .then((data) => {
        if (!cancelled) setMarkings(data);
      })
      .catch(() => {
        if (!cancelled) setMarkingsError(true);
      })
      .finally(() => {
        if (!cancelled) setMarkingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [property.id]);

  const datedMarkings = sortByOperationDate(markings);
  const lastWork = datedMarkings[0] ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const nextFollowUp = markings
    .filter((marking) => {
      const lastFollowUpDay = marking.follow_up_date_end ?? marking.follow_up_date_start;
      return lastFollowUpDay && lastFollowUpDay >= today;
    })
    .sort((a, b) => (a.follow_up_date_start ?? '').localeCompare(b.follow_up_date_start ?? ''))[0];
  const nextRequest = requests.find((request) => request.status === 'open');

  return (
    <article className="forest-property-card">
      <div className="forest-property-heading">
        <div>
          <h2>{property.name}</h2>
          {property.property_code && <p className="forest-property-code">{property.property_code}</p>}
        </div>
        <span className="forest-property-area">
          {property.area_ha === null || property.area_ha === undefined
            ? 'Pinta-ala ei tiedossa'
            : formatArea(property.area_ha)}
        </span>
      </div>

      <p className="forest-property-coordinates">
        Koordinaatit: {coordinates ?? 'Ei saatavilla'}
      </p>

      <dl className="forest-property-summary">
        <div>
          <dt>Tuottohistoria (arvio)</dt>
          <dd className={`return-summary ${summary.direction}`}>{summary.text}</dd>
        </div>
        <div>
          <dt>Viimeisin kirjattu työ</dt>
          <dd>
            {markingsLoading
              ? 'Ladataan...'
              : markingsError
                ? 'Tietojen lataus epäonnistui'
                : lastWork
                  ? `${formatDate(lastWork.operation_date ?? '')} · ${MARKING_TYPE_LABELS[lastWork.type]}`
                  : 'Ei kirjattuja töitä'}
          </dd>
        </div>
        <div>
          <dt>Seuraava kirjattu työ</dt>
          <dd>
            {requestsLoading
              ? 'Ladataan...'
              : requestsError
              ? 'Työpyyntöjen lataaminen epäonnistui'
              : nextRequest
                ? nextRequest.title
                : nextFollowUp
                  ? `Seuranta ${formatDateRange(nextFollowUp.follow_up_date_start ?? '', nextFollowUp.follow_up_date_end ?? '')}`
                  : 'Ei ajoitettua työtä'}
          </dd>
        </div>
      </dl>

      <div className="forest-property-actions">
        <button
          className="btn btn-secondary"
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {detailsOpen ? 'Piilota lisätiedot' : 'Lisätiedot'}
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => navigate(`/map?propertyId=${property.id}&from=forests`)}
        >
          Avaa kartalla
        </button>
      </div>

      {detailsOpen && (
        <ForestDetails
          property={property}
          markings={markings}
          markingsLoading={markingsLoading}
          requests={requests}
          requestsLoading={requestsLoading}
          markingsError={markingsError}
          requestsError={requestsError}
          history={history}
          onMarkingUpdated={(updated) => {
            setMarkings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            onHistoryChanged();
          }}
        />
      )}
    </article>
  );
}

export default function ForestOverviewPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [requests, setRequests] = useState<WorkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestsError, setRequestsError] = useState(false);
  // Return history per parcel; kept here so the parcels can also be summed up
  const [histories, setHistories] = useState<Record<number, HistoryState>>({});

  const loadHistory = useCallback((propertyId: number) => {
    propertiesService.getForestValueHistory(propertyId)
      .then((data) => setHistories((prev) => ({ ...prev, [propertyId]: data })))
      .catch(() => setHistories((prev) => ({ ...prev, [propertyId]: 'failed' })));
  }, []);

  useEffect(() => {
    properties.forEach((property) => loadHistory(property.id));
  }, [properties, loadHistory]);

  const availableHistories = properties
    .map((property) => histories[property.id])
    .flatMap((state) => (state && state !== 'loading' && state !== 'failed' && state.status === 'available' ? [state.history] : []));

  useEffect(() => {
    let cancelled = false;
    propertiesService.getAll()
      .then((data) => {
        if (!cancelled) setProperties(data);
      })
      .catch(() => {
        if (!cancelled) setError('Omien metsäpalstojen lataaminen epäonnistui.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    workRequestsService.getMine()
      .then((data) => {
        if (!cancelled) setRequests(data);
      })
      .catch(() => {
        if (!cancelled) setRequestsError(true);
      })
      .finally(() => {
        if (!cancelled) setRequestsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="start-page forest-page">
      <SpruceForestBackdrop />
      <TopNav />

      <main className="start-content forest-content">
        <header className="forest-hero">
          <p className="forest-eyebrow">🌲 Metsänomistajalle</p>
          <h1>Minun metsäni</h1>
          <p>Katso omien metsäpalstojesi tilanne ja siirry valitsemasi palstan karttanäkymään.</p>
          {/* The map works without a parcel too: browse it or add a new parcel there */}
          {!loading && properties.length > 0 && (
            <div className="forest-hero-actions">
              <button className="btn btn-primary btn-compact" onClick={() => navigate('/lisaa-metsa')}>
                + Lisää metsä
              </button>
              <button className="btn btn-secondary btn-compact" onClick={() => navigate('/map')}>
                🗺️ Avaa kartta
              </button>
            </div>
          )}
        </header>

        {error && <p className="error-message" role="alert">{error}</p>}
        {loading ? (
          <p className="glass-panel" role="status">Ladataan omia metsäpalstoja...</p>
        ) : properties.length === 0 && !error ? (
          <div className="glass-panel forest-empty">
            <h2>Lisää ensimmäinen metsäsi</h2>
            <p>Sinulla ei ole vielä tallennettuja metsäpalstoja. Syötä metsäkiinteistösi tunnus:</p>
            <AddForestByCode onAdded={(property) => setProperties((prev) => [...prev, property])} />
            <button className="btn-link" onClick={() => navigate('/map')}>
              Etkö tiedä tunnusta? Valitse kiinteistö kartalta →
            </button>
          </div>
        ) : (
          <>
            <PortfolioSummary histories={availableHistories} />
            <section className="forest-property-list" aria-label="Omat metsäpalstat">
              {properties.map((property) => (
                <ForestCard
                  key={property.id}
                  property={property}
                  requests={requests.filter((request) => request.property_id === property.id)}
                  requestsLoading={requestsLoading}
                  requestsError={requestsError}
                  history={histories[property.id] ?? 'loading'}
                  onHistoryChanged={() => loadHistory(property.id)}
                />
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
