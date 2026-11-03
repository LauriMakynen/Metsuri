import { useState } from 'react';
import type { FormEvent } from 'react';
import { cadastreService, propertiesService } from '../services/forestService';
import { formatArea } from '../utils/measurement';
import type { CadastreFeature, Property } from '../types';

interface AddForestByCodeProps {
  onAdded: (property: Property) => void;
}

function errorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status;
}

function serverMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error;
}

// Find a forest property by its kiinteistötunnus and save it to the user's own parcels.
// Several properties can be added one after another.
export default function AddForestByCode({ onAdded }: AddForestByCodeProps) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<CadastreFeature | null>(null);
  const [name, setName] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Syötä kiinteistötunnus, esim. 182-432-8-10');
      return;
    }
    setSearching(true);
    setError('');
    setResult(null);
    try {
      const found = await cadastreService.searchByPropertyCode(code.trim());
      setResult(found);
      setName(found.properties.name || `Kiinteistö ${found.properties.propertyCode}`);
    } catch (err) {
      const status = errorStatus(err);
      if (status === 404) setError('Kiinteistöä ei löytynyt tällä tunnuksella. Tarkista tunnus.');
      else if (status === 400) setError(serverMessage(err) || 'Tunnus on väärässä muodossa, esim. 182-432-8-10');
      else setError(serverMessage(err) || 'Haku epäonnistui. Yritä hetken päästä uudelleen.');
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    setError('');
    try {
      const created = await propertiesService.importFromCadastre({
        name: name.trim() || undefined,
        property_code: result.properties.propertyCode,
        geometry: result.geometry,
        area_ha: result.properties.areaHa,
      });
      onAdded(created);
      setResult(null);
      setCode('');
      setName('');
    } catch (err) {
      setError(
        errorStatus(err) === 409
          ? 'Tämä kiinteistö on jo omissa metsissäsi.'
          : serverMessage(err) || 'Tallennus epäonnistui. Yritä uudelleen.'
      );
    } finally {
      setSaving(false);
    }
  };

  const parcelCount = result?.properties.parcelCount ?? 1;

  return (
    <div className="add-forest">
      <form className="add-forest-search" onSubmit={search}>
        <label htmlFor="add-forest-code">Kiinteistötunnus</label>
        <div className="add-forest-row">
          <input
            id="add-forest-code"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="esim. 182-432-8-10"
            disabled={searching || saving}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary btn-compact" disabled={searching || saving}>
            {searching ? 'Haetaan...' : 'Hae'}
          </button>
        </div>
        <small className="add-forest-hint">
          Tunnus löytyy lainhuutotodistuksesta tai kiinteistöverolipusta.
        </small>
      </form>

      {error && <div className="error-message" role="alert">{error}</div>}

      {result && (
        <div className="add-forest-result">
          <strong>Löytyi: {result.properties.propertyCode}</strong>
          <small>
            {[
              result.properties.areaHa ? formatArea(result.properties.areaHa) : null,
              parcelCount > 1 ? `${parcelCount} aluetta` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
          <label htmlFor="add-forest-name">Nimi omissa metsissä</label>
          <input
            id="add-forest-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            disabled={saving}
          />
          <div className="add-forest-actions">
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => setResult(null)} disabled={saving}>
              Peruuta
            </button>
            <button type="button" className="btn btn-primary btn-compact" onClick={save} disabled={saving}>
              {saving ? 'Tallennetaan...' : '✓ Lisää omiin metsiin'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
