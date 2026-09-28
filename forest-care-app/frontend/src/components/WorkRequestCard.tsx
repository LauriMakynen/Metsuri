import { useState } from 'react';
import type { FormEvent } from 'react';
import { workRequestsService } from '../services/forestService';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import { formatArea } from '../utils/measurement';
import { formatDate } from '../utils/dateFormatting';
import { BEST_BID_LABEL, PRICING_HINT, formatEur } from '../utils/bids';
import type { PublicWorkRequest } from '../types';

interface WorkRequestCardProps {
  request: PublicWorkRequest;
  selected: boolean;
  canBid: boolean;
  onFocus: () => void;
  onBidPlaced: (updated: PublicWorkRequest) => void;
  onLoginToBid: () => void;
}

// One open work request for work providers: details, anonymous best offer and a bid form
export default function WorkRequestCard({
  request,
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

  const color = MARKING_COLORS[request.type];
  const hasBids = request.bid_count > 0 && request.best_bid_eur !== null;
  const perHa =
    hasBids && request.area_ha ? Math.round((request.best_bid_eur as number) / request.area_ha) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Anna tarjous euroina, esim. 1500');
      return;
    }
    setSending(true);
    setError('');
    try {
      onBidPlaced(await workRequestsService.placeBid(request.id, value));
      setFormOpen(false);
      setAmount('');
      setSent(true);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || 'Tarjouksen lähetys epäonnistui');
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
        <span className="request-meta">
          {request.area_ha ? `📐 ${formatArea(request.area_ha)} · ` : ''}
          Julkaistu {formatDate(request.created_at.slice(0, 10))}
        </span>
        {request.note && <span className="request-note">{request.note}</span>}
      </button>

      <div className="bid-box">
        {hasBids ? (
          <div className="bid-best">
            <span className="bid-best-label">{BEST_BID_LABEL[request.pricing]}</span>
            <strong className="bid-best-value">{formatEur(request.best_bid_eur as number)}</strong>
            <span className="bid-best-meta">
              {request.bid_count === 1 ? '1 tarjous' : `${request.bid_count} tarjousta`}
              {perHa !== null && ` · ≈ ${formatEur(perHa)}/ha`}
            </span>
          </div>
        ) : (
          <span className="bid-none">Ei vielä tarjouksia – ole ensimmäinen</span>
        )}

        {request.my_bid_eur !== null && (
          <span className="bid-mine">
            {sent ? '✓ Tarjouksesi on jätetty: ' : 'Oma tarjouksesi: '}
            {formatEur(request.my_bid_eur)}
          </span>
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
          <button className="btn btn-primary btn-compact bid-open-btn" onClick={() => { setFormOpen(true); setSent(false); }}>
            💶 {request.my_bid_eur !== null ? 'Päivitä tarjous' : 'Tee tarjous'}
          </button>
        )}
      </div>
    </article>
  );
}
