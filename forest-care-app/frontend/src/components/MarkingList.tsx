import { formatDate, formatDateRange } from '../utils/dateFormatting';
import { formatArea } from '../utils/measurement';
import type { Marking, MarkingType } from '../types';

interface MarkingListProps {
  markings: Marking[];
  selectedPropertyId: number | null;
  onDelete: (id: number) => void;
}

const MARKING_COLORS: Record<MarkingType, string> = {
  vesakonhoito: '#f59e0b',
  istutus: '#10b981',
  harvennus: '#3b82f6',
  avohakkuu: '#ef4444',
  muu_tyo: '#8b5cf6',
};

const MARKING_TYPE_LABELS: Record<MarkingType, string> = {
  vesakonhoito: 'Vesakonhoito',
  istutus: 'Istutus',
  harvennus: 'Harvennus',
  avohakkuu: 'Avohakkuu',
  muu_tyo: 'Muu työ',
};

export default function MarkingList({
  markings,
  selectedPropertyId,
  onDelete,
}: MarkingListProps) {
  return (
    <>
      <div className="sidebar-header">
        <h3>📍 Merkinnät ({selectedPropertyId ? markings.length : 0})</h3>
      </div>
      <ul className="sidebar-list">
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
                {m.geometry?.type === 'Polygon' && m.area_ha !== undefined && (
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
      </ul>
    </>
  );
}
