import { useState } from 'react';
import type { FormEvent } from 'react';
import { workRequestsService } from '../services/forestService';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import { formatArea } from '../utils/measurement';
import { formatDate } from '../utils/dateFormatting';
import { formatDistance } from '../utils/distance';
import { BEST_BID_LABEL, PRICING_HINT, TARGET_PRICE_LABEL, formatEur } from '../utils/bids';
import WorkRequestPhotoGallery from './WorkRequestPhotos';
import type { PublicWorkRequest } from '../types';

interface WorkRequestCardProps {
  request: PublicWorkRequest;
  // Distance from the viewer's location, when the distance filter is on
  distanceKm?: number | null;
  selected: boolean;
  canBid: boolean;
  onFocus: () => void;
  onBidPlaced: (updated: PublicWorkRequest) => void;
  onLoginToBid: () => void;
}

// One open work request for work providers: details, anonymous best offer and a bid form
export default function WorkRequestCard({
  request,
  distanceKm = null,
  selected,
  canBid,
  onFocus,
  onBidPlaced,
  onLoginToBid,
}: WorkRequestCardProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [confirmationAmount, setConfirmationAmount] = useState<number | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  const color = MARKING_COLORS[request.type];
  const hasBids = request.bid_count > 0 && request.best_bid_eur !== null;
  const perHa = (eur: number | null) => (eur !== null && request.area_ha ? Math.round(eur / request.area_ha) : null);
  const bestPerHa = hasBids ? perHa(request.best_bid_eur) : null;
  const targetPerHa = perHa(request.target_price_eur);
  // Best offer against the owner's price: for a service lower is better, for a timber sale higher
  const comparison =
    hasBids && request.target_price_eur
      ? Math.round(((request.best_bid_eur as number) / request.target_price_eur - 1) * 100)
      : null;
  const comparisonText =
    comparison === null
      ? null
      : comparison === 0
        ? 'Paras tarjous on sama kuin omistajan hinta'
        : `Paras tarjous on ${Math.abs(comparison)} % ${comparison < 0 ? 'alle' : 'yli'} omistajan hinnan`;
  const comparisonGood =
    comparison !== null && (request.pricing === 'owner_pays' ? comparison <= 0 : comparison >= 0);
  const myBidIsBest = request.my_bid_eur !== null && request.my_bid_eur === request.best_bid_eur;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Anna tarjous euroina, esim. 1500');
      return;
    }
    setError('');
    setConfirmationAmount(value);
  };

  const confirmSubmit = async () => {
    if (confirmationAmount === null) return;
    setSending(true);
    setError('');
    try {
      onBidPlaced(await workRequestsService.placeBid(request.id, confirmationAmount));
      setFormOpen(false);
      setAmount('');
      setConfirmationAmount(null);
      setSent(true);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || 'Tarjouksen lähetys epäonnistui');
    } finally {
      setSending(false);
    }
  };

  const deleteBid = async () => {
    setSending(true);
    setError('');
    try {
      const updated = await workRequestsService.deleteBid(request.id);
      onBidPlaced(updated);
      setDeleteConfirmationOpen(false);
      setSent(false);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || 'Tarjouksen poisto epäonnistui');
    } finally {
      setSending(false);
    }
  };

  return (
    <article className={`request-card ${selected ? 'selected' : ''}`} style={{ borderLeftColor: color }}>
      <button className="request-card-head" onClick={onFocus} title="Näytä kartalla">
        <span className="request-tags">
          <span className="request-type" style={{ color }}>{MARKING_TYPE_LABELS[request.type]}</span>
          <span className={`pricing-tag ${request.pricing}`}>
            {request.pricing === 'owner_receives' ? '💰 Puukauppa' : '🧾 Palvelutyö'}
          </span>
        </span>
        <strong className="request-title">{request.title}</strong>
        <span className="request-facts">
          {request.area_ha ? <span>📐 {formatArea(request.area_ha)}</span> : null}
          <span>📅 {formatDate(request.created_at.slice(0, 10))}</span>
          {request.region_name && <span>📍 {request.region_name}</span>}
          {distanceKm !== null && <span>🧭 {formatDistance(distanceKm)} sinusta</span>}
        </span>
        {request.note && <span className="request-note">{request.note}</span>}
      </button>

      {request.property_code || request.property_geometry ? (
        <div className="request-property">
          <span className="request-property-text">
            <span className="request-property-label">Kiinteistö</span>
            {/* Parcels drawn by hand before property search have a boundary but no code */}
            <strong>{request.property_code ?? 'Rajattu kartalle'}</strong>
            {request.property_area_ha ? <span> · {formatArea(request.property_area_ha)}</span> : null}
          </span>
          <button type="button" className="btn-link" onClick={onFocus}>
            Näytä rajat kartalla →
          </button>
        </div>
      ) : (
        !canBid && (
          <div className="request-property request-property-locked">
            🔒 Kiinteistötunnus ja rajat näkyvät kirjautuneille
          </div>
        )
      )}

      <WorkRequestPhotoGallery requestId={request.id} photos={request.photos} />

      <div className="bid-box">
        <div className="bid-stats">
          {request.target_price_eur !== null && (
            <div className="bid-stat">
              <span className="bid-stat-label">{TARGET_PRICE_LABEL[request.pricing]}</span>
              <strong className="bid-stat-value">{formatEur(request.target_price_eur)}</strong>
              {targetPerHa !== null && <span className="bid-stat-meta">≈ {formatEur(targetPerHa)}/ha</span>}
            </div>
          )}
          <div className={`bid-stat bid-stat-best ${hasBids ? '' : 'empty'}`}>
            <span className="bid-stat-label">{BEST_BID_LABEL[request.pricing]}</span>
            {hasBids ? (
              <>
                <strong className="bid-stat-value">{formatEur(request.best_bid_eur as number)}</strong>
                <span className="bid-stat-meta">
                  {request.bid_count === 1 ? '1 tarjous' : `${request.bid_count} tarjousta`}
                  {bestPerHa !== null && ` · ≈ ${formatEur(bestPerHa)}/ha`}
                </span>
              </>
            ) : (
              <>
                <strong className="bid-stat-value">–</strong>
                <span className="bid-stat-meta">Ei vielä tarjouksia</span>
              </>
            )}
          </div>
        </div>

        {comparisonText && (
          <span className={`bid-comparison ${comparisonGood ? 'good' : ''}`}>{comparisonText}</span>
        )}

        {request.my_bid_eur !== null && (
          <div className={`bid-mine ${myBidIsBest ? 'best' : ''}`}>
            <span>
              {sent ? '✓ Tarjouksesi on jätetty' : 'Oma tarjouksesi'}: <strong>{formatEur(request.my_bid_eur)}</strong>
              {myBidIsBest && <span className="bid-mine-badge">🏆 Paras tarjous</span>}
            </span>
            <button
              type="button"
              className="btn-link bid-delete-link"
              onClick={() => setDeleteConfirmationOpen(true)}
              disabled={sending}
            >
              Poista
            </button>
          </div>
        )}

        {request.is_own ? (
          <span className="bid-note">Tämä on oma työpyyntösi.</span>
        ) : !canBid ? (
          <button className="btn-link" onClick={onLoginToBid}>Kirjaudu sisään tehdäksesi tarjouksen →</button>
        ) : formOpen ? (
          <form className="bid-form" onSubmit={submit}>
            <p className="bid-note">{PRICING_HINT[request.pricing]} Tarjoajan nimeä ei näytetä muille.</p>
            <div className="bid-form-row">
              <label className="bid-input">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Kokonaishinta"
                  aria-label="Tarjous euroina"
                  autoFocus
                />
                <span>€</span>
              </label>
              <button type="submit" className="btn btn-primary btn-compact" disabled={sending}>
                {sending ? 'Lähetetään...' : 'Lähetä'}
              </button>
            </div>
            {error && <span className="bid-error">{error}</span>}
            <button type="button" className="btn-link" onClick={() => { setFormOpen(false); setError(''); }}>
              Peruuta
            </button>
          </form>
        ) : (
          <button className="btn btn-primary bid-open-btn" onClick={() => { setFormOpen(true); setSent(false); }}>
            💶 {request.my_bid_eur !== null ? 'Päivitä tarjous' : hasBids ? 'Tee tarjous' : 'Tee ensimmäinen tarjous'}
          </button>
        )}
      </div>
      {confirmationAmount !== null && (
        <div className="modal-overlay" onClick={() => !sending && setConfirmationAmount(null)}>
          <div className="modal-card confirm-dialog bid-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Vahvista tarjous</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => !sending && setConfirmationAmount(null)}
                aria-label="Sulje"
                disabled={sending}
              >
                ✕
              </button>
            </div>
            <p className="confirm-dialog-text">
              Haluatko varmasti tarjota <strong>{formatEur(confirmationAmount)}</strong> työpyynnöstä{' '}
              <strong>“{request.title}”</strong>?
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmationAmount(null)}
                disabled={sending}
              >
                Peruuta
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmSubmit} disabled={sending}>
                {sending ? 'Lähetetään...' : 'Vahvista'}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteConfirmationOpen && (
        <div className="modal-overlay" onClick={() => !sending && setDeleteConfirmationOpen(false)}>
          <div className="modal-card confirm-dialog bid-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Poistetaanko tarjous?</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => !sending && setDeleteConfirmationOpen(false)}
                aria-label="Sulje"
                disabled={sending}
              >
                ✕
              </button>
            </div>
            <p className="confirm-dialog-text">
              Haluatko varmasti poistaa tarjouksesi <strong>{formatEur(request.my_bid_eur ?? 0)}</strong> työpyynnöstä{' '}
              <strong>“{request.title}”</strong>?
            </p>
            {error && <p className="bid-error" role="alert">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmationOpen(false)}
                disabled={sending}
              >
                Ei
              </button>
              <button type="button" className="btn btn-danger" onClick={deleteBid} disabled={sending}>
                {sending ? 'Poistetaan...' : 'Kyllä'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
