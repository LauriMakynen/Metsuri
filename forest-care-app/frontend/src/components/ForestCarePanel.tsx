import { useState } from 'react';
import { formatDate, formatDateRange } from '../utils/dateFormatting';
import { formatArea } from '../utils/measurement';
import { formatDistance } from '../utils/distance';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import type { Marking, Property } from '../types';

// Without "Näytä kaikki" the list stays short, so the sidebar does not fill up over the years
const RECENT_LIMIT = 5;
const RECENT_OPEN_STORAGE_KEY = 'metsuri.care.recentOpen';

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
}

function readRecentOpen(): boolean {
  try {
    return localStorage.getItem(RECENT_OPEN_STORAGE_KEY) !== 'false';
  } catch {
    return true;
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
}: ForestCarePanelProps) {
  const [recentOpen, setRecentOpen] = useState(readRecentOpen);
  const [showAll, setShowAll] = useState(false);

  const toggleRecent = () => {
    setRecentOpen((open) => {
      try {
        localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(!open));
      } catch {
        // Remembering the choice is only a convenience
      }
      return !open;
    });
  };

  if (!property) {
    return (
      <section className="care-panel">
        <p className="care-eyebrow">🪓 Metsänhoito</p>
        <p className="care-empty">Valitse hoidettava palsta alta tai kartalta.</p>
      </section>
    );
  }

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
        {property.area_ha ? <small className="care-meta">📐 {formatArea(property.area_ha)}</small> : null}
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
