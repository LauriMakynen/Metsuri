import { useState } from 'react';
import { formatDate, formatDateRange } from '../utils/dateFormatting';
import { formatArea } from '../utils/measurement';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import type { Marking, WorkRequest } from '../types';

interface MarkingListProps {
  markings: Marking[];
  selectedPropertyId: number | null;
  onDelete: (id: number) => void;
  // Work requests keyed by marking id
  workRequests: Record<number, WorkRequest>;
  canRequestWork: boolean;
  onRequestWork: (markingId: number, note: string) => Promise<void>;
  onWithdrawWorkRequest: (requestId: number) => Promise<void>;
}

export default function MarkingList({
  markings,
  selectedPropertyId,
  onDelete,
  workRequests,
  canRequestWork,
  onRequestWork,
  onWithdrawWorkRequest,
}: MarkingListProps) {
  // Marking whose work request form is open, and its draft note
  const [requestingId, setRequestingId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const openRequestForm = (markingId: number) => {
    setRequestingId(markingId);
    setNote('');
  };

  const submitRequest = async (markingId: number) => {
    setBusyId(markingId);
    try {
      await onRequestWork(markingId, note);
      setRequestingId(null);
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (markingId: number, requestId: number) => {
    setBusyId(markingId);
    try {
      await onWithdrawWorkRequest(requestId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="sidebar-header">
        <h3>📍 Merkinnät ({selectedPropertyId ? markings.length : 0})</h3>
      </div>
      {!canRequestWork && selectedPropertyId && markings.length > 0 && (
        <p className="work-request-hint">Kirjaudu sisään julkaistaksesi työpyyntöjä tekijöille.</p>
      )}
      <ul className="sidebar-list">
        {!selectedPropertyId ? (
          <li className="sidebar-empty">Valitse kiinteistö nähdäksesi merkinnät.</li>
        ) : markings.length === 0 ? (
          <li className="sidebar-empty">Ei merkintöjä tällä kiinteistöllä.</li>
        ) : (
          markings.map((m) => {
            const request = workRequests[m.id];
            const isOpen = request?.status === 'open';
            const busy = busyId === m.id;

            return (
              <li key={m.id} className="sidebar-item sidebar-item-stacked">
                <div className="sidebar-item-row">
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
                </div>

                {canRequestWork && m.geometry && (
                  <div className="work-request-box">
                    {isOpen ? (
                      <>
                        <span className="work-request-badge">📢 Työpyyntö avoinna</span>
                        {request.note && <small className="work-request-note">{request.note}</small>}
                        <button
                          className="btn-link"
                          disabled={busy}
                          onClick={() => withdraw(m.id, request.id)}
                        >
                          {busy ? 'Perutaan...' : 'Peru työpyyntö'}
                        </button>
                      </>
                    ) : requestingId === m.id ? (
                      <>
                        <textarea
                          className="work-request-input"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Lisätietoja tekijälle (valinnainen), esim. toivottu ajankohta"
                          maxLength={1000}
                          rows={3}
                        />
                        <div className="work-request-actions">
                          <button
                            className="btn btn-primary btn-compact"
                            disabled={busy}
                            onClick={() => submitRequest(m.id)}
                          >
                            {busy ? 'Julkaistaan...' : 'Julkaise työpyyntö'}
                          </button>
                          <button className="btn-link" disabled={busy} onClick={() => setRequestingId(null)}>
                            Peruuta
                          </button>
                        </div>
                      </>
                    ) : (
                      <button className="btn-link" onClick={() => openRequestForm(m.id)}>
                        📢 Pyydä tekijää tälle työlle
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}
