import { useState } from 'react';
import type { FormEvent } from 'react';
import type { MarkingType, GeometryType } from '../types';

function getLocalIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

interface MarkingFormProps {
  isProperty: boolean;
  geometryType: GeometryType;
  onSaveMarking: (data: {
    type: MarkingType;
    title: string;
    description: string;
    operation_date: string;
    area_ha?: number | null;
  }) => Promise<void>;
  onSaveProperty: (name: string) => Promise<void>;
  onCancel: () => void;
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

// Modal form for saving a new property or marking
export default function MarkingForm({
  isProperty,
  geometryType,
  onSaveMarking,
  onSaveProperty,
  onCancel,
}: MarkingFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<MarkingType>('muu_tyo');
  const [operationDate, setOperationDate] = useState(getLocalIsoDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Nimi on pakollinen');
      return;
    }
    setLoading(true);
    setError('');

    try {
      if (isProperty) {
        await onSaveProperty(title.trim());
      } else {
        const normalizedOperationDate = operationDate || getLocalIsoDate();
        await onSaveMarking({
          type,
          title: title.trim(),
          description: description.trim(),
          operation_date: normalizedOperationDate,
        });
      }
    } catch {
      setError('Tallennus epäonnistui');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card">
        <div className="modal-header">
          <h2>
            {isProperty ? '🌳 Uusi kiinteistö' : `📍 Uusi ${GEOMETRY_TYPE_LABELS[geometryType]}`}
          </h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="title">
              {isProperty ? 'Kiinteistön nimi' : 'Nimi'} *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isProperty ? 'esim. Kotimetsä' : 'esim. Harvennettu alue'}
              required
              autoFocus
            />
          </div>

          {!isProperty && (
            <>
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
            </>
          )}

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
