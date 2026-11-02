import { useEffect, useRef, useState } from 'react';
import { formatDate, formatDateRange } from '../utils/dateFormatting';
import { formatArea } from '../utils/measurement';
import { formatDistance } from '../utils/distance';
import { parcelAreas } from '../utils/parcelAreas';
import type { ParcelArea } from '../utils/parcelAreas';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import {
  OPERATION_LABEL,
  OPERATION_WORK_TYPE,
  TIMING_LABEL,
  TIMING_ORDER,
  isCareOperation,
  standTitle,
} from '../utils/forestValueFormat';
import type { FieldArea, Marking, Property, RecommendedOperation } from '../types';

// Without "Näytä kaikki" the list stays short, so the sidebar does not fill up over the years
const RECENT_LIMIT = 5;
const RECENT_OPEN_STORAGE_KEY = 'metsuri.care.recentOpen';
const NEEDED_OPEN_STORAGE_KEY = 'metsuri.care.neededOpen';

// Recommended operations come from the forest value calculation (Metsäkeskus or forestry rules)
export type CareNeededOperations =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | {
      status: 'ready';
      operations: RecommendedOperation[];
      fields: FieldArea[];
      // The field parcel register could not be checked
      fieldsUnavailable: boolean;
    };

export type CareLocation =
  | { status: 'locating' }
  | { status: 'unavailable'; message: string }
  | { status: 'ok'; distanceKm: number | null; onParcel: boolean };

interface ForestCarePanelProps {
  property: Property | null;
  markings: Marking[];
  location: CareLocation;
  onStartActivity: () => void;
  onShowLocation: () => void;
  onDeleteMarking: (id: number) => void;
  needed: CareNeededOperations;
  onSelectStand: (standId: string) => void;
  // Stand chosen on the map or in the list; its recommendations are highlighted
  activeStandId: string | null;
  onClearStand: () => void;
  // Zooms the map to one separate area of a multi-area property
  onShowArea: (area: ParcelArea) => void;
  // Marks a stand as field or undoes it; absent for guests (nothing is saved in the demo)
  onMarkField?: (standId: string, isField: boolean) => Promise<void>;
  // Absent when the viewer cannot publish work requests (guest demo)
  onRequestOffers?: (operation: RecommendedOperation) => void;
}

function readOpen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
}

function storeOpen(key: string, open: boolean) {
  try {
    localStorage.setItem(key, String(open));
  } catch {
    // Remembering the choice is only a convenience
  }
}

function markingDate(marking: Marking): string {
  return marking.operation_date ?? marking.created_at.slice(0, 10);
}

function locationText(location: CareLocation): string {
  if (location.status === 'locating') return 'Haetaan sijaintiasi...';
  if (location.status === 'unavailable') return location.message;
  if (location.onParcel) return 'Olet palstalla – voit aloittaa aktiviteetin.';
  if (location.distanceKm === null) return 'Sijaintisi näkyy kartalla.';
  return `Olet ${formatDistance(location.distanceKm)} päässä palstasta.`;
}

// Forest care mode ("Hoida omaa metsää"): what matters when heading out to work on the parcel.
// The latest operations list replaces the separate "Tehdyt työt" section in this mode.
export default function ForestCarePanel({
  property,
  markings,
  location,
  onStartActivity,
  onShowLocation,
  onDeleteMarking,
  needed,
  onSelectStand,
  activeStandId,
  onClearStand,
  onShowArea,
  onMarkField,
  onRequestOffers,
}: ForestCarePanelProps) {
  const [recentOpen, setRecentOpen] = useState(() => readOpen(RECENT_OPEN_STORAGE_KEY));
  const [neededOpen, setNeededOpen] = useState(() => readOpen(NEEDED_OPEN_STORAGE_KEY));
  const [showAll, setShowAll] = useState(false);
  // Last year shown in the recommendations; null = every year available
  const [untilYear, setUntilYear] = useState<number | null>(null);
  const neededRef = useRef<HTMLDivElement>(null);
  const [fieldBusy, setFieldBusy] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState('');

  const markField = async (standId: string, isField: boolean) => {
    if (!onMarkField) return;
    setFieldBusy(standId);
    setFieldError('');
    try {
      await onMarkField(standId, isField);
      if (isField) onClearStand();
    } catch {
      setFieldError(isField ? 'Pelloksi merkitseminen epäonnistui.' : 'Merkinnän peruminen epäonnistui.');
    } finally {
      setFieldBusy(null);
    }
  };

  // A stand picked on the map opens the list and shows all of its years (adjusted during render)
  const [shownActiveStand, setShownActiveStand] = useState(activeStandId);
  if (activeStandId !== shownActiveStand) {
    setShownActiveStand(activeStandId);
    if (activeStandId) {
      setNeededOpen(true);
      setUntilYear(null);
    }
  }

  useEffect(() => {
    if (!activeStandId) return;
    neededRef.current?.querySelector('.care-needed-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeStandId]);

  const toggleRecent = () => {
    storeOpen(RECENT_OPEN_STORAGE_KEY, !recentOpen);
    setRecentOpen(!recentOpen);
  };

  const toggleNeeded = () => {
    storeOpen(NEEDED_OPEN_STORAGE_KEY, !neededOpen);
    setNeededOpen(!neededOpen);
  };

  if (!property) {
    return (
      <section className="care-panel">
        <p className="care-eyebrow">🪓 Metsänhoito</p>
        <p className="care-empty">Valitse hoidettava palsta alta tai kartalta.</p>
      </section>
    );
  }

  const areas = parcelAreas(property.geometry);

  const allNeeded =
    needed.status === 'ready'
      ? needed.operations.filter(isCareOperation)
      : [];
  const activeStandOps = activeStandId ? allNeeded.filter((op) => op.standId === activeStandId) : [];
  const fields = needed.status === 'ready' ? needed.fields : [];
  const fieldAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
  const registerFields = fields.filter((f) => f.source === 'register');
  const ownerFields = fields.filter((f) => f.source === 'owner');
  const neededYears = [...new Set(allNeeded.map((op) => op.year))].sort((a, b) => a - b);
  const lastNeededYear = neededYears.length > 0 ? neededYears[neededYears.length - 1] : null;
  const neededOperations =
    untilYear === null ? allNeeded : allNeeded.filter((op) => op.year <= untilYear);
  const neededGroups = TIMING_ORDER.map((timing) => ({
    timing,
    items: neededOperations.filter((op) => op.timing === timing).sort((a, b) => a.year - b.year),
  })).filter((group) => group.items.length > 0);
  const neededNow = neededOperations.filter((op) => op.timing === 'now').length;

  const today = new Date().toISOString().slice(0, 10);
  const recent = [...markings].sort((a, b) => markingDate(b).localeCompare(markingDate(a)));
  const visibleRecent = showAll ? recent : recent.slice(0, RECENT_LIMIT);
  const upcoming = markings
    .filter((m) => (m.follow_up_date_end ?? m.follow_up_date_start ?? '') >= today)
    .sort((a, b) =>
      (a.follow_up_date_start ?? a.follow_up_date_end ?? '').localeCompare(
        b.follow_up_date_start ?? b.follow_up_date_end ?? ''
      )
    );

  return (
    <section className="care-panel" aria-label="Metsänhoito">
      <div className="care-head">
        <p className="care-eyebrow">🪓 Hoidettava metsä</p>
        <h3 className="care-title">{property.name}</h3>
        {(property.area_ha || areas.length > 1) && (
          <small className="care-meta">
            📐 {property.area_ha ? formatArea(property.area_ha) : ''}
            {areas.length > 1 && (
              <>
                {property.area_ha ? ' · ' : ''}
                <strong>{areas.length} erillistä aluetta</strong>
              </>
            )}
          </small>
        )}
        {areas.length > 1 && (
          <div className="care-areas" role="group" aria-label="Metsän erilliset alueet">
            {areas.map((area) => (
              <button key={area.number} className="care-area-chip" onClick={() => onShowArea(area)}>
                <span className="care-area-number" aria-hidden="true">{area.number}</span>
                Alue {area.number} · {formatArea(area.areaHa)}
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="btn care-start-btn" onClick={onStartActivity}>
        ▶ Aloita aktiviteetti
      </button>

      <div className={`care-location ${location.status === 'unavailable' ? 'warn' : ''}`} role="status">
        <span>📍 {locationText(location)}</span>
        {location.status === 'ok' && (
          <button className="btn-link" onClick={onShowLocation}>
            Näytä kartalla
          </button>
        )}
      </div>

      {(fields.length > 0 || (needed.status === 'ready' && needed.fieldsUnavailable) || fieldError) && (
        <div className="care-fields" role="status">
          {fields.length > 0 && (
            <p>
              🌾 <strong>Peltoa {formatArea(fieldAreaHa)}</strong> – pelloille ei lasketa puuston arvoa eikä anneta
              metsänhoitosuosituksia.
            </p>
          )}
          {registerFields.length > 0 && (
            <small>
              Ruokaviraston peltolohkorekisteri:{' '}
              {registerFields.length === 1 ? '1 peltolohko' : `${registerFields.length} peltolohkoa`},{' '}
              {formatArea(registerFields.reduce((sum, f) => sum + f.areaHa, 0))}
            </small>
          )}
          {ownerFields.map((field) => (
            <div key={field.standId} className="care-field-mark">
              <small>
                {standTitle(field.standNumber)} merkitty pelloksi · {formatArea(field.areaHa)}
              </small>
              {onMarkField && field.standId && (
                <button
                  className="btn-link"
                  onClick={() => markField(field.standId as string, false)}
                  disabled={fieldBusy !== null}
                >
                  {fieldBusy === field.standId ? 'Perutaan...' : 'Peru'}
                </button>
              )}
            </div>
          ))}
          {needed.status === 'ready' && needed.fieldsUnavailable && (
            <small className="care-fields-warn">
              Peltolohkorekisteriä ei saatu tarkistettua. Jos jokin kuvio on pelto, merkitse se pelloksi.
            </small>
          )}
          {fieldError && <small className="care-fields-warn">{fieldError}</small>}
        </div>
      )}

      <button className="sidebar-section-header care-needed-header" onClick={toggleNeeded} aria-expanded={neededOpen}>
        <h3>
          🪵 Suositellut toimenpiteet ({allNeeded.length})
          {neededNow > 0 && <span className="care-needed-now">{neededNow} nyt</span>}
        </h3>
        <span className={`sidebar-chevron ${neededOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {neededOpen && (
        <div className="care-needed" ref={neededRef}>
          {activeStandOps.length > 0 && (
            <div className="care-needed-active" role="status">
              <span>
                Valittu <strong>{standTitle(activeStandOps[0].standNumber)}</strong> ·{' '}
                {activeStandOps.length === 1 ? '1 toimenpide' : `${activeStandOps.length} toimenpidettä`}
              </span>
              <span className="care-needed-active-actions">
                {onMarkField && activeStandId && (
                  <button
                    className="care-field-btn"
                    onClick={() => markField(activeStandId, true)}
                    disabled={fieldBusy !== null}
                    title="Kuvio on oikeasti peltoa: sille ei anneta metsänhoitosuosituksia"
                  >
                    {fieldBusy === activeStandId ? 'Merkitään...' : '🌾 Tämä on pelto'}
                  </button>
                )}
                <button className="btn-link" onClick={onClearStand}>
                  Poista valinta
                </button>
              </span>
            </div>
          )}
          {needed.status === 'loading' ? (
            <p className="care-needed-empty">Lasketaan suositeltuja toimenpiteitä...</p>
          ) : needed.status === 'unavailable' ? (
            <p className="care-needed-empty">Suosituksia ei saatu juuri nyt. Avaa palstan arvo -näkymä yrittääksesi uudelleen.</p>
          ) : allNeeded.length === 0 ? (
            <p className="care-needed-empty">Palstalla ei ole lähivuosina suositeltavaa vesakonhoitoa, harvennusta, hakkuuta tai istutusta.</p>
          ) : (
            <>
              <div className="care-needed-filter">
                <label>
                  <span>Näytä vuoteen</span>
                  <select
                    value={untilYear ?? ''}
                    onChange={(e) => setUntilYear(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Kaikki ({lastNeededYear} asti)</option>
                    {neededYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <small>
                  Suosituksia saatavilla vuosille {neededYears[0]}–{lastNeededYear}
                  {untilYear !== null && ` · näytetään ${neededOperations.length}/${allNeeded.length}`}
                </small>
              </div>
              <ol className="care-needed-groups">
                {neededGroups.map((group) => (
                  <li key={group.timing}>
                    <h4 className={`care-needed-when ${group.timing === 'now' ? 'now' : ''}`}>
                      {group.timing === 'now' ? 'Nyt' : `${TIMING_LABEL[group.timing]} kuluttua`}
                    </h4>
                    <ul>
                      {group.items.map((op, index) => (
                        <li
                          key={`${op.standId}-${op.type}-${index}`}
                          className={`care-needed-item ${op.standId === activeStandId ? 'active' : ''}`}
                        >
                          <span
                            className="care-recent-dot"
                            style={{ color: MARKING_COLORS[OPERATION_WORK_TYPE[op.type]] }}
                            aria-hidden="true"
                          >
                            ●
                          </span>
                          <span className="care-recent-text">
                            <strong>{OPERATION_LABEL[op.type]}</strong>
                            <small>
                              <button className="care-stand-link" onClick={() => onSelectStand(op.standId)}>
                                {standTitle(op.standNumber)}
                              </button>{' '}
                              · {op.source === 'metsakeskus' ? `Metsäkeskus ${op.year}` : `n. ${op.year}`}
                            </small>
                            <small className="care-needed-reason">{op.reason}</small>
                            {onRequestOffers && (
                              <button className="btn-link" onClick={() => onRequestOffers(op)}>
                                Pyydä tarjouksia
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="care-upcoming">
          <strong>🔔 Tulevat tarkastukset</strong>
          {upcoming.slice(0, 3).map((m) => (
            <small key={m.id}>
              {formatDateRange(m.follow_up_date_start ?? '', m.follow_up_date_end ?? '')} · {m.title}
            </small>
          ))}
        </div>
      )}

      <button className="sidebar-section-header care-recent-header" onClick={toggleRecent} aria-expanded={recentOpen}>
        <h3>🕒 Viimeisimmät toimenpiteet ({recent.length})</h3>
        <span className={`sidebar-chevron ${recentOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {recentOpen && (
        <ul className="sidebar-list care-recent-list">
          {recent.length === 0 ? (
            <li className="sidebar-empty">Ei vielä toimenpiteitä. Aloita aktiviteetti tai merkitse tehty työ kartalle.</li>
          ) : (
            visibleRecent.map((m) => (
              <li key={m.id} className="care-recent-item">
                <span className="care-recent-dot" style={{ color: MARKING_COLORS[m.type] }} aria-hidden="true">●</span>
                <span className="care-recent-text">
                  <strong>{m.title}</strong>
                  <small>
                    {MARKING_TYPE_LABELS[m.type]} · {formatDate(markingDate(m))}
                    {m.area_ha != null ? ` · ${formatArea(m.area_ha)}` : ''}
                  </small>
                  {(m.follow_up_date_start || m.follow_up_date_end) && (
                    <small>
                      Tarkastus: {formatDateRange(m.follow_up_date_start ?? '', m.follow_up_date_end ?? '')}
                    </small>
                  )}
                </span>
                <button
                  className="btn-icon delete"
                  onClick={() => onDeleteMarking(m.id)}
                  title="Poista"
                  aria-label={`Poista ${m.title}`}
                >
                  🗑
                </button>
              </li>
            ))
          )}
          {recent.length > RECENT_LIMIT && (
            <li className="care-recent-more">
              <button className="btn-link" onClick={() => setShowAll((all) => !all)}>
                {showAll ? 'Näytä vähemmän' : `Näytä kaikki (${recent.length})`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
