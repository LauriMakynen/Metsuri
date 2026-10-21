import { useState } from 'react';
import type { FormEvent } from 'react';
import { MARKING_COLORS, MARKING_TYPE_LABELS, MARKING_TYPES } from '../utils/markingTypes';
import { formatArea } from '../utils/measurement';
import { PRICING_OPTIONS, TARGET_PRICE_QUESTION, suggestedPricing } from '../utils/bids';
import type { MarkingType, Pricing } from '../types';

export interface WorkRequestFormData {
  type: MarkingType;
  title: string;
  note: string;
  pricing: Pricing;
  target_price_eur: number;
}

// Prefill, e.g. from a recommended operation of the forest value view
export type WorkRequestDraft = Omit<WorkRequestFormData, 'target_price_eur'>;

interface WorkRequestFormProps {
  parcelName: string;
  initial?: WorkRequestDraft | null;
  areaHa: number | null;
  onSubmit: (data: WorkRequestFormData) => Promise<void>;
  onCancel: () => void;
}

// Modal for publishing planned work: what, who pays, the owner's price and details
export default function WorkRequestForm({ parcelName, initial, areaHa, onSubmit, onCancel }: WorkRequestFormProps) {
  const [type, setType] = useState<MarkingType | null>(initial?.type ?? null);
  const [title, setTitle] = useState(initial?.title ?? '');
  // Must be chosen explicitly (or confirmed from a prefill): decides whether the highest or the lowest offer is best
  const [pricing, setPricing] = useState<Pricing | null>(initial?.pricing ?? null);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState(initial?.note ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const priceValue = Number(price.replace(/\s/g, '').replace(',', '.'));
    if (!type) return setError('Valitse toimenpide');
    if (!pricing) return setError('Valitse, onko kyse puukaupasta vai palvelutyöstä');
    if (!Number.isFinite(priceValue) || priceValue <= 0) return setError('Anna hinta euroina');

    setSending(true);
    setError('');
    try {
      await onSubmit({
        type,
        title: title.trim() || `${MARKING_TYPE_LABELS[type]} – ${parcelName}`,
        note: note.trim(),
        pricing,
        target_price_eur: priceValue,
      });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || 'Työpyynnön julkaisu epäonnistui');
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card">
        <div className="modal-header">
          <h2>📢 Uusi työpyyntö</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Sulje">✕</button>
        </div>
        <p className="request-form-sub">
          {parcelName}
          {areaHa ? ` · alue ${formatArea(areaHa)}` : ''}
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <fieldset className="form-group request-form-fieldset">
            <legend>Toimenpide *</legend>
            <div className="activity-types">
              {MARKING_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`filter-chip ${type === t ? 'active' : ''}`}
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                >
                  <span style={{ color: MARKING_COLORS[t] }}>●</span> {MARKING_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="pricing-choice">
            <legend>Kuka maksaa? *</legend>
            {PRICING_OPTIONS.map((option) => (
              <label key={option.value} className={`pricing-option ${pricing === option.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="pricing"
                  value={option.value}
                  checked={pricing === option.value}
                  onChange={() => setPricing(option.value)}
                />
                <span className="pricing-option-text">
                  <strong>
                    {option.title}
                    {type && suggestedPricing(type) === option.value && (
                      <em className="pricing-usual"> · tavallinen tälle työlle</em>
                    )}
                  </strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="form-group">
            <label htmlFor="request-price">
              {pricing ? TARGET_PRICE_QUESTION[pricing] : 'Hinta'} (€) *
            </label>
            <div className="bid-input">
              <input
                id="request-price"
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Kokonaishinta"
              />
              <span>€</span>
            </div>
            <small className="request-form-hint">Tekijät näkevät hinnan ja voivat tarjota sitä vasten.</small>
          </div>

          <div className="form-group">
            <label htmlFor="request-title">Otsikko</label>
            <input
              id="request-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type ? `${MARKING_TYPE_LABELS[type]} – ${parcelName}` : 'esim. Taimikonhoito, eteläosa'}
              maxLength={255}
            />
          </div>

          <div className="form-group">
            <label htmlFor="request-note">Lisätietoja tekijälle</label>
            <textarea
              id="request-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="esim. toivottu ajankohta, tieyhteys, puumäärä"
              maxLength={1000}
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Peruuta</button>
            <button type="submit" className="btn btn-primary" disabled={sending || !type || !pricing || !price}>
              {sending ? 'Julkaistaan...' : 'Julkaise työpyyntö'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
