import { useState } from 'react';
import { formatArea } from '../utils/measurement';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import { TARGET_PRICE_LABEL, bidSummaryText, formatEur } from '../utils/bids';
import WorkRequestPhotoGallery from './WorkRequestPhotos';
import type { WorkRequest } from '../types';

interface WorkRequestListProps {
  requests: WorkRequest[];
  selectedPropertyId: number | null;
  canPublish: boolean;
  onNewRequest: () => void;
  onWithdraw: (requestId: number) => Promise<void>;
  onUpdated: (updated: WorkRequest) => void;
  isOpen: boolean;
  onToggle: () => void;
}

// The owner's own work requests (planned work) on the selected parcel, with anonymous offers
export default function WorkRequestList({
  requests,
  selectedPropertyId,
  canPublish,
  onNewRequest,
  onWithdraw,
  onUpdated,
  isOpen,
  onToggle,
}: WorkRequestListProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [requestToWithdraw, setRequestToWithdraw] = useState<WorkRequest | null>(null);
  const visible = requests.filter((r) => r.property_id === selectedPropertyId);

  const withdraw = async () => {
    if (!requestToWithdraw) return;
    const id = requestToWithdraw.id;
    setBusyId(id);
    try {
      await onWithdraw(id);
      setRequestToWithdraw(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button className="sidebar-section-header" onClick={onToggle} aria-expanded={isOpen}>
        <h3>📢 Työpyynnöt ({selectedPropertyId ? visible.length : 0})</h3>
        <span className={`sidebar-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {isOpen && selectedPropertyId && (
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
      {isOpen && <ul className="sidebar-list">
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
                <WorkRequestPhotoGallery requestId={r.id} photos={r.photos} editable onUpdated={onUpdated} />
                <button className="btn-link" disabled={busyId === r.id} onClick={() => setRequestToWithdraw(r)}>
                  {busyId === r.id ? 'Perutaan...' : 'Peru työpyyntö'}
                </button>
              </div>
            </li>
          ))
        )}
      </ul>}
      {requestToWithdraw && (
        <div className="modal-overlay" onClick={() => busyId === null && setRequestToWithdraw(null)}>
          <div className="modal-card confirm-dialog work-request-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Haluatko varmasti perua tämän työpyynnön?</h2>
              <button
                className="modal-close"
                onClick={() => busyId === null && setRequestToWithdraw(null)}
                aria-label="Sulje"
                disabled={busyId !== null}
              >
                ✕
              </button>
            </div>
            <div className="work-request-confirm-details">
              <strong>{requestToWithdraw.title}</strong>
              <span>{MARKING_TYPE_LABELS[requestToWithdraw.type]}</span>
              {requestToWithdraw.area_ha && <span>Pinta-ala: {formatArea(requestToWithdraw.area_ha)}</span>}
              {requestToWithdraw.target_price_eur !== null && (
                <span>
                  {TARGET_PRICE_LABEL[requestToWithdraw.pricing]}: {formatEur(requestToWithdraw.target_price_eur)}
                </span>
              )}
              <span>Tarjouksia: {requestToWithdraw.bid_count}</span>
              {requestToWithdraw.note && <span>Lisätiedot: {requestToWithdraw.note}</span>}
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setRequestToWithdraw(null)}
                disabled={busyId !== null}
              >
                Ei
              </button>
              <button className="btn btn-danger" onClick={withdraw} disabled={busyId !== null}>
                {busyId !== null ? 'Perutaan...' : 'Kyllä'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
