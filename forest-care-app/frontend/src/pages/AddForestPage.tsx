import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AddForestByCode from '../components/AddForestByCode';
import SpruceForestBackdrop from '../components/SpruceForestBackdrop';
import { markAddForestSkipped } from '../utils/addForestPrompt';
import { formatArea } from '../utils/measurement';
import type { Property } from '../types';

// Step after registration / login for owners without parcels: add forests by property code
export default function AddForestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [added, setAdded] = useState<Property[]>([]);

  const skip = () => {
    if (user) markAddForestSkipped(user.id);
    navigate('/start');
  };

  return (
    <div className="start-page forest-page add-forest-page">
      <SpruceForestBackdrop />
      <main className="start-content forest-content">
        <section className="glass-panel add-forest-card">
          <p className="forest-eyebrow">🌲 Tervetuloa Metsuriin</p>
          <h1>Lisää metsäsi</h1>
          <p className="add-forest-lead">
            Syötä metsäkiinteistösi tunnus, niin näet sen rajat kartalla, puuston arvion ja hoitosuositukset.
            Voit lisätä useamman kiinteistön.
          </p>

          {added.length > 0 && (
            <ul className="add-forest-added" aria-label="Lisätyt metsät">
              {added.map((property) => (
                <li key={property.id}>
                  ✓ <strong>{property.name}</strong>
                  {property.area_ha ? ` · ${formatArea(property.area_ha)}` : ''}
                </li>
              ))}
            </ul>
          )}

          <AddForestByCode onAdded={(property) => setAdded((prev) => [...prev, property])} />

          <div className="add-forest-footer">
            {added.length > 0 ? (
              <button className="btn btn-primary" onClick={() => navigate('/omat-metsat')}>
                Valmis – näytä omat metsät →
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={skip}>
                Ohita nyt – voit lisätä metsän myöhemmin
              </button>
            )}
            <button className="btn-link" onClick={() => navigate('/map')}>
              Etkö tiedä tunnusta? Valitse kiinteistö kartalta →
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
