import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TopNav from '../components/TopNav';
import { propertiesService } from '../services/forestService';
import { formatArea } from '../utils/measurement';
import { parcelAreaCount } from '../utils/parcelAreas';
import type { Property } from '../types';

const OWNER_FEATURES = [
  'Hoida metsää: viimeisimmät toimenpiteet ja GPS-aktiviteetti',
  'Hae kiinteistö tunnuksella ja näe rajat kartalla',
  'Merkitse harvennukset, istutukset ja muut työt',
  'Mittaa etäisyydet ja pinta-alat hehtaareina',
  'Julkaise työpyyntö, kun tarvitset tekijää',
];

const PROVIDER_FEATURES = [
  'Metsäyrittäjille, yrityksille ja yhdistyksille',
  'Avoimet työpyynnöt kartalla ja listana',
  'Suodata työtyypin mukaan',
  'Ei vaadi kirjautumista',
];

// Start page shown after login (and for guests): choose what to do next
export default function StartPage() {
  const { user, logout, isGuest } = useAuth();
  const navigate = useNavigate();
  // Parcels to choose from after "Hoida omaa metsää"; null while the picker is closed
  const [careChoices, setCareChoices] = useState<Property[] | null>(null);
  const [careLoading, setCareLoading] = useState(false);
  const [careError, setCareError] = useState('');

  const goToLogin = () => {
    logout();
    navigate('/login');
  };

  const openOwnForest = isGuest ? goToLogin : () => navigate('/omat-metsat');

  const openCare = (property: Property) => navigate(`/map?hoida=${property.id}`);

  // With one parcel go straight to it; with several ask which forest to care for
  const startForestCare = async () => {
    if (isGuest) {
      navigate('/map?hoida');
      return;
    }
    setCareLoading(true);
    setCareError('');
    try {
      const properties = await propertiesService.getAll();
      if (properties.length === 0) navigate('/map');
      else if (properties.length === 1) openCare(properties[0]);
      else setCareChoices(properties);
    } catch {
      setCareError('Metsien lataaminen epäonnistui. Yritä uudelleen.');
    } finally {
      setCareLoading(false);
    }
  };
  const greeting = isGuest ? 'Tervetuloa Metsuriin' : `Tervetuloa takaisin${user?.email ? `, ${user.email}` : ''}`;

  return (
    <div className="start-page home-page">
      <TopNav />

      <section className="hero hero-photo">
        {/* Real forest work photo (taimikonhoito); decorative, the text carries the meaning */}
        <div className="hero-photo-bg" aria-hidden="true" />
        <div className="hero-inner">
          <p className="hero-eyebrow">{greeting}</p>
          <h1 className="hero-title">
            Metsäsi hoito <em>yhdellä kartalla</em>
          </h1>
          <p className="hero-lead">
            Suunnittele metsänhoitotyöt omalle palstallesi ja löydä niille tekijät, tai selaa
            palstoja, jotka odottavat hoitoa.
          </p>

          <div className="hero-actions">
            <button className="hero-btn hero-btn-care" onClick={startForestCare} disabled={careLoading}>
              🪓 {careLoading ? 'Haetaan metsiä...' : 'Hoida omaa metsää'}
            </button>
            <button className="hero-btn hero-btn-primary" onClick={openOwnForest}>
              🌲 {isGuest ? 'Kirjaudu omalle palstalle' : 'Minun metsäni'}
            </button>
            <button className="hero-btn hero-btn-secondary" onClick={() => navigate('/tyontarjoajat')}>
              🤝 Selaa työpyyntöjä
            </button>
          </div>

          {careError && <p className="hero-error" role="alert">{careError}</p>}

          {isGuest && (
            <button className="hero-demo-link" onClick={() => navigate('/map')}>
              tai kokeile demoa ilman kirjautumista →
            </button>
          )}

        </div>
      </section>

      <main className="start-content start-cards">
        <div className="start-grid">
          <section className="choice-card">
            <div className="choice-icon">🌲</div>
            <h2>Metsänomistajille</h2>
            <ul className="feature-list">
              {OWNER_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="choice-actions">
              <button className="btn btn-care" onClick={startForestCare} disabled={careLoading}>
                🪓 Hoida omaa metsää
              </button>
              <button className="btn btn-primary" onClick={openOwnForest}>
                {isGuest ? 'Kirjaudu omalle palstalle' : 'Minun metsäni'}
              </button>
              {isGuest && (
                <button className="btn-link choice-demo-link" onClick={() => navigate('/map')}>
                  Kokeile demoa – merkinnät eivät tallennu
                </button>
              )}
            </div>
          </section>

          <section className="choice-card choice-card-alt">
            <div className="choice-icon">🤝</div>
            <h2>Työn tarjoajille</h2>
            <ul className="feature-list">
              {PROVIDER_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="choice-actions">
              <button className="btn btn-primary" onClick={() => navigate('/tyontarjoajat')}>
                Selaa työpyyntöjä
              </button>
            </div>
          </section>
        </div>
      </main>

      {careChoices && (
        <div className="modal-overlay" onClick={() => setCareChoices(null)}>
          <div
            className="modal-card care-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="care-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="care-picker-title">Valitse metsä</h2>
              <button className="modal-close" onClick={() => setCareChoices(null)} aria-label="Sulje">
                ✕
              </button>
            </div>
            <p className="care-picker-lead">Mitä metsää aloitat hoitamaan?</p>
            <ul className="care-picker-list">
              {careChoices.map((property) => (
                <li key={property.id}>
                  <button className="care-picker-item" onClick={() => openCare(property)}>
                    <span className="care-picker-icon" aria-hidden="true">🌲</span>
                    <span className="care-picker-text">
                      <strong>{property.name}</strong>
                      <small>
                        {[
                          property.property_code,
                          property.area_ha ? formatArea(property.area_ha) : null,
                          parcelAreaCount(property.geometry) > 1 ? `${parcelAreaCount(property.geometry)} aluetta` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Oma palsta'}
                      </small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
