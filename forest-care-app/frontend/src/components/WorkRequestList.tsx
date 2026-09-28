import { useState } from 'react';
import { formatArea } from '../utils/measurement';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import { TARGET_PRICE_LABEL, bidSummaryText, formatEur } from '../utils/bids';
import type { WorkRequest } from '../types';

interface WorkRequestListProps {
  requests: WorkRequest[];
  selectedPropertyId: number | null;
  canPublish: boolean;
  onNewRequest: () => void;
  onWithdraw: (requestId: number) => Promise<void>;
}

// The owner's own work requests (planned work) on the selected parcel, with anonymous offers
export default function WorkRequestList({
  requests,
  selectedPropertyId,
  canPublish,
  onNewRequest,
  onWithdraw,
}: WorkRequestListProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const visible = requests.filter((r) => r.property_id === selectedPropertyId);

  const withdraw = async (id: number) => {
    setBusyId(id);
    try {
      await onWithdraw(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="sidebar-header">
        <h3>📢 Työpyynnöt ({selectedPropertyId ? visible.length : 0})</h3>
      </div>
      {selectedPropertyId && (
        <div className="request-new">
          {canPublish ? (
            <button className="btn btn-primary btn-compact" onClick={onNewRequest}>
              + Tee työpyyntö
            </button>
          ) : (
            <p className="work-request-hint">Kirjaudu sisään julkaistaksesi työpyyntöjä.</p>
          )}
        </div>
      )}
      <ul className="sidebar-list">
        {!selectedPropertyId ? (
          <li className="sidebar-empty">Valitse kiinteistö nähdäksesi työpyynnöt.</li>
        ) : visible.length === 0 ? (
          <li className="sidebar-empty">Ei työpyyntöjä. Pyydä tekijää tulevalle työlle ja saa hintatarjouksia.</li>
        ) : (
          visible.map((r) => (
            <li key={r.id} className="sidebar-item sidebar-item-stacked">
              <div className="sidebar-item-row">
                <div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                    <span style={{ color: MARKING_COLORS[r.type] }}>●</span>
                    <strong style={{ fontSize: '0.9rem' }}>{r.title}</strong>
                  </span>
                  <small style={{ color: '#6b7280', display: 'block' }}>
                    {MARKING_TYPE_LABELS[r.type]}
                    {r.area_ha ? ` · ${formatArea(r.area_ha)}` : ''}
                  </small>
                </div>
              </div>
              <div className="work-request-box">
                {r.target_price_eur !== null && (
                  <small className="work-request-note">
                    {TARGET_PRICE_LABEL[r.pricing]}: <strong>{formatEur(r.target_price_eur)}</strong>
                  </small>
                )}
                <small className="work-request-bids">💶 {bidSummaryText(r)}</small>
                {r.note && <small className="work-request-note">{r.note}</small>}
                <button className="btn-link" disabled={busyId === r.id} onClick={() => withdraw(r.id)}>
                  {busyId === r.id ? 'Perutaan...' : 'Peru työpyyntö'}
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
