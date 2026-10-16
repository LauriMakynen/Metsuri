import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ManualStandInput, TreeSpecies } from '../../types';
import { SPECIES_LABEL, SPECIES_ORDER } from '../../utils/forestValueFormat';

interface ManualStandFormProps {
  initial?: ManualStandInput | null;
  onSubmit: (input: ManualStandInput) => Promise<void>;
  onCancel?: () => void;
}

// Owner-entered basics when Metsäkeskus has no forest resource data for the parcel
export default function ManualStandForm({ initial, onSubmit, onCancel }: ManualStandFormProps) {
  const [species, setSpecies] = useState<TreeSpecies>(initial?.species ?? 'spruce');
  const [age, setAge] = useState(initial ? String(initial.ageYears) : '');
  const [volume, setVolume] = useState(initial ? String(initial.volumeM3PerHa) : '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const parse = (value: string) => Number(value.replace(/\s/g, '').replace(',', '.'));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ageYears = parse(age);
    const volumeM3PerHa = parse(volume);
    if (!age || !Number.isFinite(ageYears) || ageYears < 0 || ageYears > 250) {
      return setError('Anna puuston ikä vuosina (0–250).');
    }
    if (!volume || !Number.isFinite(volumeM3PerHa) || volumeM3PerHa < 0 || volumeM3PerHa > 600) {
      return setError('Anna puuston määrä kuutioina hehtaarilla (0–600 m³/ha).');
    }
    setSending(true);
    setError('');
    try {
      await onSubmit({ species, ageYears, volumeM3PerHa });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || 'Laskenta epäonnistui. Yritä uudelleen.');
      setSending(false);
    }
  };

  return (
    <form className="fv-section fv-manual" onSubmit={handleSubmit} noValidate>
      <h3 className="fv-section-title">Syötä puuston perustiedot</h3>
      <p className="fv-muted">
        Arvio lasketaan koko palstalle yhtenä kuviona, joten se on karkea. Tiedot löytyvät esimerkiksi
        metsäsuunnitelmasta tai Metsään.fi-palvelusta.
      </p>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="fv-species">Pääpuulaji</label>
        <select id="fv-species" value={species} onChange={(e) => setSpecies(e.target.value as TreeSpecies)}>
          {SPECIES_ORDER.map((s) => (
            <option key={s} value={s}>
              {SPECIES_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="fv-manual-row">
        <div className="form-group">
          <label htmlFor="fv-age">Puuston ikä (v)</label>
          <input
            id="fv-age"
            type="text"
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="esim. 45"
          />
        </div>
        <div className="form-group">
          <label htmlFor="fv-volume">Puuston määrä (m³/ha)</label>
          <input
            id="fv-volume"
            type="text"
            inputMode="decimal"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="esim. 150"
            aria-describedby="fv-volume-hint"
          />
        </div>
      </div>
      <small id="fv-volume-hint" className="fv-muted">
        Suuntaa antavasti: taimikko 0–30, nuori kasvatusmetsä 50–120, varttunut 120–220 ja uudistuskypsä 200–300 m³/ha.
      </small>

      <div className="fv-manual-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-compact" onClick={onCancel}>
            Peruuta
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-compact" disabled={sending}>
          {sending ? 'Lasketaan…' : 'Laske arvo'}
        </button>
      </div>
    </form>
  );
}
