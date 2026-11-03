import { formatDate, formatDateRange } from '../utils/dateFormatting';
import { formatArea } from '../utils/measurement';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import type { Marking } from '../types';

interface MarkingListProps {
  markings: Marking[];
  selectedPropertyId: number | null;
  onDelete: (id: number) => void;
  isOpen: boolean;
  onToggle: () => void;
}

// Done work on the selected parcel (planned work lives in WorkRequestList)
export default function MarkingList({
  markings,
  selectedPropertyId,
  onDelete,
  isOpen,
  onToggle,
}: MarkingListProps) {
  return (
    <>
      <button className="sidebar-section-header" onClick={onToggle} aria-expanded={isOpen}>
        <h3>📍 Tehdyt työt ({selectedPropertyId ? markings.length : 0})</h3>
        <span className={`sidebar-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {isOpen && <ul className="sidebar-list">
        {!selectedPropertyId ? (
          <li className="sidebar-empty">Valitse kiinteistö nähdäksesi merkinnät.</li>
        ) : markings.length === 0 ? (
          <li className="sidebar-empty">Ei merkintöjä tällä kiinteistöllä.</li>
        ) : (
          markings.map((m) => (
            <li key={m.id} className="sidebar-item">
              <div>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <span style={{ color: MARKING_COLORS[m.type] }}>●</span>
                  <strong style={{ fontSize: '0.9rem' }}>{m.title}</strong>
                </span>
                <small style={{ color: '#6b7280', display: 'block' }}>
                  {MARKING_TYPE_LABELS[m.type]}
                </small>
                {(m.geometry?.type === 'Polygon' || m.geometry?.type === 'MultiPolygon') && m.area_ha != null && (
                  <small style={{ color: '#6b7280', display: 'block' }}>
                    📐 {formatArea(m.area_ha)}
                  </small>
                )}
                {m.operation_date && (
                  <small style={{ color: '#6b7280', display: 'block' }}>
                    Tehty: {formatDate(m.operation_date)}
                  </small>
                )}
                {(m.follow_up_date_start || m.follow_up_date_end) && (
                  <small style={{ color: '#6b7280', display: 'block' }}>
                    Tarkastus:{' '}
                    {formatDateRange(m.follow_up_date_start ?? '', m.follow_up_date_end ?? '')}
                  </small>
                )}
              </div>
              <button
                className="btn-icon delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(m.id);
                }}
                title="Poista"
              >
                🗑
              </button>
            </li>
          ))
        )}
      </ul>}
    </>
  );
}
