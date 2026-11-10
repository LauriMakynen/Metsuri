import { useState } from 'react';
import type { FormEvent } from 'react';
import type { MarkingType, GeometryType } from '../types';

function getLocalIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

interface MarkingFormProps {
  geometryType: GeometryType;
  onSaveMarking: (data: {
    type: MarkingType;
    title: string;
    description: string;
    operation_date: string;
    area_ha?: number | null;
    income_eur?: number | null;
    cost_eur?: number | null;
  }) => Promise<void>;
  onCancel: () => void;
}

// Harvests bring timber sale income; every work can have a cost
const HARVEST_TYPES: MarkingType[] = ['harvennus', 'avohakkuu'];

/** "1 500,50" → 1500.5; empty → null; anything else → undefined (invalid) */
function parseEur(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const value = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

// Finnish labels for marking types
const MARKING_TYPES: { value: MarkingType; label: string }[] = [
  { value: 'vesakonhoito', label: 'Vesakonhoito' },
  { value: 'istutus', label: 'Istutus' },
  { value: 'harvennus', label: 'Harvennus' },
  { value: 'avohakkuu', label: 'Avohakkuu' },
  { value: 'muu_tyo', label: 'Muu työ' },
];

const GEOMETRY_TYPE_LABELS: Record<GeometryType, string> = {
  point: 'Piste',
  line: 'Viiva',
  area: 'Alue',
  note: 'Muistiinpano',
};

// Modal form for saving a new marking (done work). Properties come from MML, not from this form.
export default function MarkingForm({
  geometryType,
  onSaveMarking,
  onCancel,
}: MarkingFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<MarkingType>('muu_tyo');
  const [operationDate, setOperationDate] = useState(getLocalIsoDate);
  const [income, setIncome] = useState('');
  const [cost, setCost] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isHarvest = HARVEST_TYPES.includes(type);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Nimi on pakollinen');
      return;
    }
    const incomeEur = isHarvest ? parseEur(income) : null;
    const costEur = parseEur(cost);
    if (incomeEur === undefined || costEur === undefined) {
      setError('Anna tulo ja kulu euroina, esim. 1500');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const normalizedOperationDate = operationDate || getLocalIsoDate();
      await onSaveMarking({
        type,
        title: title.trim(),
        description: description.trim(),
        operation_date: normalizedOperationDate,
        income_eur: incomeEur,
        cost_eur: costEur,
      });
    } catch {
      setError('Tallennus epäonnistui');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card">
        <div className="modal-header">
          <h2>📍 Uusi {GEOMETRY_TYPE_LABELS[geometryType]}</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="title">Nimi *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="esim. Harvennettu alue"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="type">Tyyppi</label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as MarkingType)}
            >
              {MARKING_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="description">Kuvaus</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Lisätietoja..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="operationDate">Toimenpiteen päivämäärä</label>
            <input
              id="operationDate"
              type="date"
              value={operationDate}
              onChange={(e) => setOperationDate(e.target.value)}
              required
            />
          </div>

          {/* Optional money: makes the return history a total return (income − costs) */}
          <div className="marking-money">
            {isHarvest && (
              <div className="form-group">
                <label htmlFor="income">Puukauppatulo (€)</label>
                <input
                  id="income"
                  type="text"
                  inputMode="decimal"
                  value={income}
                  onChange={(e) => setIncome(e.target.value)}
                  placeholder="esim. 6500"
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="cost">Työn kulu (€)</label>
              <input
                id="cost"
                type="text"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="esim. 800"
              />
            </div>
          </div>
          <small className="request-form-hint">
            Vapaaehtoinen. Tulot ja kulut lasketaan mukaan metsän tuottohistoriaan.
          </small>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Peruuta
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Tallennetaan...' : 'Tallenna'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
