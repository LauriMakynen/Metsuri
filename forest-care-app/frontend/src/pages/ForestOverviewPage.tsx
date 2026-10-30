import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BackButton from '../components/BackButton';
import SpruceForestBackdrop from '../components/SpruceForestBackdrop';
import TopNav from '../components/TopNav';
import { propertiesService, workRequestsService } from '../services/forestService';
import { useForestValue } from '../hooks/useForestValue';
import { formatDate, formatDateRange } from '../utils/dateFormatting';
import { formatArea } from '../utils/measurement';
import { MARKING_TYPE_LABELS } from '../utils/markingTypes';
import { OPERATION_LABEL, TIMING_LABEL, dataSourceLabel, formatEur, formatEurRange } from '../utils/forestValueFormat';
import ForestValuePanel from '../components/forestValue/ForestValuePanel';
import type { Marking, Property, WorkRequest } from '../types';

function getCoordinates(property: Property): string | null {
  if (!property.geometry) return null;
  const bounds = L.geoJSON(property.geometry as GeoJSON.Geometry).getBounds();
  if (!bounds.isValid()) return null;
  const center = bounds.getCenter();
  return `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
}

function sortByOperationDate(markings: Marking[]): Marking[] {
  return [...markings]
    .filter((marking) => marking.operation_date)
    .sort((a, b) => (b.operation_date ?? '').localeCompare(a.operation_date ?? ''));
}

function getLocalDate(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

type FollowUpStatus = 'overdue' | 'due' | 'upcoming';

interface FollowUpReminder {
  property: Property;
  marking: Marking;
  status: FollowUpStatus;
}

function getFollowUpReminders(
  properties: Property[],
  markingsByProperty: Record<number, Marking[]>,
  today: string
): FollowUpReminder[] {
  return properties.flatMap((property) =>
    (markingsByProperty[property.id] ?? []).flatMap((marking) => {
      const start = marking.follow_up_date_start ?? marking.follow_up_date_end;
      const end = marking.follow_up_date_end ?? marking.follow_up_date_start;
      if (!start || !end) return [];

      const status: FollowUpStatus = end < today ? 'overdue' : start <= today ? 'due' : 'upcoming';
      return [{ property, marking, status }];
    })
  ).sort((a, b) => {
    const statusOrder: Record<FollowUpStatus, number> = { overdue: 0, due: 1, upcoming: 2 };
    return statusOrder[a.status] - statusOrder[b.status]
      || (a.marking.follow_up_date_start ?? '').localeCompare(b.marking.follow_up_date_start ?? '');
  });
}

function ForestDetails({
  property,
  markings,
  markingsLoading,
  requests,
  requestsLoading,
  markingsError,
  requestsError,
}: {
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
        <dl className="forest-growth-grid">
          {['1 vuosi', '5 vuotta', '10 vuotta'].map((period) => (
            <div key={period}>
              <dt>Arvonmuutos · {period}</dt>
              <dd>Ei historiatietoa</dd>
            </div>
          ))}
        </dl>
        <p className="forest-detail-muted">
          Toteutuneita tuottoja ei ole tallennettu sovellukseen.
        </p>
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
  markings,
  markingsLoading,
  markingsError,
  requests,
  requestsLoading,
  requestsError,
}: {
  property: Property;
  markings: Marking[];
  markingsLoading: boolean;
  markingsError: boolean;
  requests: WorkRequest[];
  requestsLoading: boolean;
  requestsError: boolean;
}) {
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const coordinates = getCoordinates(property);

  const datedMarkings = sortByOperationDate(markings);
  const lastWork = datedMarkings[0] ?? null;
  const today = getLocalDate();
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
          <dt>Tuottohistoria</dt>
          <dd>Ei saatavilla</dd>
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
        />
      )}
    </article>
  );
}

export default function ForestOverviewPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [requests, setRequests] = useState<WorkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestsError, setRequestsError] = useState(false);
  const [markingsByProperty, setMarkingsByProperty] = useState<Record<number, Marking[]>>({});
  const [markingsLoading, setMarkingsLoading] = useState(true);
  const [markingsErrorPropertyIds, setMarkingsErrorPropertyIds] = useState<number[]>([]);

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

  useEffect(() => {
    if (loading) return;
    if (properties.length === 0) {
      setMarkingsLoading(false);
      return;
    }

    let cancelled = false;
    setMarkingsLoading(true);
    Promise.all(properties.map(async (property) => {
      try {
        return { propertyId: property.id, markings: await propertiesService.getMarkings(property.id) };
      } catch {
        return { propertyId: property.id, markings: null };
      }
    }))
      .then((results) => {
        if (cancelled) return;
        const successful = results.filter(
          (result): result is { propertyId: number; markings: Marking[] } => result.markings !== null
        );
        setMarkingsByProperty(Object.fromEntries(successful.map(({ propertyId, markings }) => [propertyId, markings])));
        setMarkingsErrorPropertyIds(
          results.filter((result) => result.markings === null).map((result) => result.propertyId)
        );
      })
      .finally(() => {
        if (!cancelled) setMarkingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, properties]);

  const reminders = getFollowUpReminders(properties, markingsByProperty, getLocalDate());
  const reminderCounts = reminders.reduce(
    (counts, reminder) => ({ ...counts, [reminder.status]: counts[reminder.status] + 1 }),
    { overdue: 0, due: 0, upcoming: 0 }
  );

  return (
    <div className="start-page forest-page">
      <SpruceForestBackdrop />
      <TopNav />
      <BackButton fallbackPath="/start" />

      <main className="start-content forest-content">
        <header className="forest-hero">
          <p className="forest-eyebrow">🌲 Metsänomistajalle</p>
          <h1>Minun metsäni</h1>
          <p>Katso omien metsäpalstojesi tilanne ja siirry valitsemasi palstan karttanäkymään.</p>
        </header>

        {error && <p className="error-message" role="alert">{error}</p>}
        {!loading && properties.length > 0 && (
          <section className="follow-up-panel" aria-labelledby="follow-up-heading">
            <div className="follow-up-heading">
              <div>
                <h2 id="follow-up-heading">Seurannan muistutukset</h2>
                <p>Tarkista merkintöihin kirjatut suuntaa-antavat seuranta-ajat.</p>
              </div>
              <div className="follow-up-counts" aria-label="Muistutusten määrä">
                <span className="follow-up-count overdue">{reminderCounts.overdue} myöhässä</span>
                <span className="follow-up-count due">{reminderCounts.due} tänään</span>
                <span className="follow-up-count upcoming">{reminderCounts.upcoming} tulossa</span>
              </div>
            </div>
            {markingsLoading ? (
              <p role="status">Ladataan seurantoja...</p>
            ) : reminders.length === 0 ? (
              <p className="follow-up-empty">Ei kirjattuja seurantoja tällä hetkellä.</p>
            ) : (
              <ul className="follow-up-list">
                {reminders.map(({ property, marking, status }) => (
                  <li className={`follow-up-item ${status}`} key={`${property.id}-${marking.id}`}>
                    <div className="follow-up-item-info">
                      <span className={`follow-up-status ${status}`}>
                        {status === 'overdue' ? 'Myöhässä' : status === 'due' ? 'Tarkastus tänään' : 'Tulossa'}
                      </span>
                      <strong>{marking.title}</strong>
                      <span>
                        {property.name} · {MARKING_TYPE_LABELS[marking.type]} · Seuranta{' '}
                        {formatDateRange(marking.follow_up_date_start ?? '', marking.follow_up_date_end ?? '')}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary follow-up-map-button"
                      onClick={() => navigate(`/map?propertyId=${property.id}&from=forests`)}
                    >
                      Avaa palsta kartalla
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {markingsErrorPropertyIds.length > 0 && (
              <p className="follow-up-error" role="alert">
                {markingsErrorPropertyIds.length === 1
                  ? 'Yhden palstan seurantatietojen lataaminen epäonnistui.'
                  : `${markingsErrorPropertyIds.length} palstan seurantatietojen lataaminen epäonnistui.`}
              </p>
            )}
            <p className="follow-up-note">
              Seuranta-ajat ovat suuntaa-antavia eivätkä korvaa metsän ammattilaisen arviota.
            </p>
          </section>
        )}
        {loading ? (
          <p className="glass-panel" role="status">Ladataan omia metsäpalstoja...</p>
        ) : properties.length === 0 && !error ? (
          <p className="glass-panel">Sinulle ei ole vielä tallennettuja metsäpalstoja.</p>
        ) : (
          <section className="forest-property-list" aria-label="Omat metsäpalstat">
            {properties.map((property) => (
              <ForestCard
                key={property.id}
                property={property}
                markings={markingsByProperty[property.id] ?? []}
                markingsLoading={markingsLoading}
                markingsError={markingsErrorPropertyIds.includes(property.id)}
                requests={requests.filter((request) => request.property_id === property.id)}
                requestsLoading={requestsLoading}
                requestsError={requestsError}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
