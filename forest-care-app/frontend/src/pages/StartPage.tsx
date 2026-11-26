import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TreePine, X } from 'lucide-react';
import RootsBackdrop from '../components/RootsBackdrop';
import { useAuth } from '../hooks/useAuth';
import TopNav from '../components/TopNav';
import { propertiesService, workRequestsService } from '../services/forestService';
import { formatArea } from '../utils/measurement';
import { parcelAreaCount } from '../utils/parcelAreas';
import type { Property } from '../types';

const OWNER_FEATURES = [
  'Hoida metsää: viimeisimmät toimenpiteet ja GPS-aktiviteetti',
  'Valitse kiinteistö kartalta ja näe sen rajat',
  'Merkitse harvennukset, istutukset ja muut työt',
  'Mittaa etäisyydet ja pinta-alat hehtaareina',
  'Julkaise työpyyntö, kun tarvitset tekijää',
];

const PROVIDER_FEATURES = [
  'Metsäyrittäjille, yrityksille ja yhdistyksille',
  'Avoimet työpyynnöt kartalla ja listana',
  'Suodata työtyypin, maakunnan ja etäisyyden mukaan',
  'Tarjoa hintaa – nimesi ei näy muille',
];

const FORUM_FEATURES = [
  'Kysy neuvoa metsänhoidosta ja puukaupasta',
  'Jaa kokemuksia urakoitsijoista ja hinnoista',
  'Metsänomistajat ja tekijät samassa keskustelussa',
  'Kirjoita nimimerkillä – sähköpostisi ei näy',
];

// Start page shown after login (and for guests): choose what to do next
/** "lauri.makynen@example.com" → "Lauri": the first word before the @ for a friendlier greeting */
function firstName(email: string | undefined): string | null {
  const word = email?.split('@')[0].split(/[._\-+0-9]/).find(Boolean);
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : null;
}

export default function StartPage() {
  const { user, logout, isGuest } = useAuth();
  const navigate = useNavigate();
  // Parcels to choose from after "Hoida omaa metsää"; null while the picker is closed
  const [careChoices, setCareChoices] = useState<Property[] | null>(null);
  const [careLoading, setCareLoading] = useState(false);
  const [careError, setCareError] = useState('');
  const [workRequestSummary, setWorkRequestSummary] = useState<{ requestCount: number; bidCount: number } | null>(null);

  useEffect(() => {
    if (!user) return;

    let active = true;
    workRequestsService
      .getMine()
      .then((requests) => {
        const openRequests = requests.filter((request) => request.status === 'open');
        if (!active) return;
        if (openRequests.length === 0) {
          setWorkRequestSummary(null);
          return;
        }
        setWorkRequestSummary({
          requestCount: openRequests.length,
          bidCount: openRequests.reduce((total, request) => total + request.bid_count, 0),
        });
      })
      .catch(() => {
        if (active) setWorkRequestSummary(null);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const openOwnForest = () => navigate('/omat-metsat');

  const openCare = (property: Property) => navigate(`/map?hoida=${property.id}`);

  // With one parcel go straight to it; with several ask which forest to care for
  const startForestCare = async () => {
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
  const greeting = isGuest ? 'Tervetuloa Metsurin demoon' : `Tervetuloa${firstName(user?.email) ? `, ${firstName(user?.email)}` : ''}`;
  const workRequestSummaryText = workRequestSummary
    ? `${workRequestSummary.requestCount} ${
        workRequestSummary.requestCount === 1 ? 'aktiivinen työpyyntö' : 'aktiivista työpyyntöä'
      } · ${workRequestSummary.bidCount} ${
        workRequestSummary.bidCount === 1 ? 'tarjous' : 'tarjousta'
      }`
    : null;

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
              {careLoading ? 'Haetaan metsiä...' : 'Hoida omaa metsää'}
            </button>
            <button className="hero-btn hero-btn-primary" onClick={openOwnForest}>
              Minun metsäni
            </button>
            <button className="hero-btn hero-btn-secondary" onClick={() => navigate('/tyontarjoajat')}>
              Selaa työpyyntöjä
            </button>
          </div>

          {workRequestSummaryText && (
            <button
              className="hero-request-stat"
              onClick={() => navigate('/map?section=work-requests')}
              aria-label={`${workRequestSummaryText}. Avaa omat työpyynnöt.`}
            >
              <span className="hero-request-stat-dot" aria-hidden="true" />
              <span>{workRequestSummaryText}</span>
              <span className="hero-request-stat-arrow" aria-hidden="true">›</span>
            </button>
          )}

          {careError && <p className="hero-error" role="alert">{careError}</p>}

          {isGuest && (
            <p className="hero-demo-note">
              Katselet demoa esimerkkidatalla. Kokeile vapaasti, mitään ei tallenneta.{' '}
              <button className="hero-demo-link" onClick={() => { logout(); navigate('/register'); }}>
                Luo oma tili →
              </button>
            </p>
          )}

        </div>
      </section>

      {/* Below the forest photo: soil with tree roots, darkening to black */}
      <div className="underground">
      <RootsBackdrop />
      <main className="start-content start-cards">
        <div className="start-grid">
          {/* Photo card: a forest owner felling a spruce; the text sits on the dark lower part */}
          <section className="choice-card choice-card-photo choice-card-owner">
            <h2>Metsänomistajille</h2>
            <ul className="feature-list">
              {OWNER_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="choice-actions">
              <button className="btn btn-care" onClick={startForestCare} disabled={careLoading}>
                Hoida omaa metsää
              </button>
              <button className="btn btn-primary" onClick={openOwnForest}>
                Minun metsäni
              </button>
            </div>
          </section>

          {/* Photo card: a forwarder collecting timber after a felling */}
          <section className="choice-card choice-card-alt choice-card-photo choice-card-provider">
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

          {/* Photo card: two woodsmen talking on a log pile */}
          <section className="choice-card choice-card-photo choice-card-forum">
            <h2>Foorumi</h2>
            <ul className="feature-list">
              {FORUM_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="choice-actions">
              <button className="btn btn-primary" onClick={() => navigate('/foorumi')}>
                Avaa foorumi
              </button>
            </div>
          </section>
        </div>
      </main>
      </div>

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
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <p className="care-picker-lead">Mitä metsää aloitat hoitamaan?</p>
            <ul className="care-picker-list">
              {careChoices.map((property) => (
                <li key={property.id}>
                  <button className="care-picker-item" onClick={() => openCare(property)}>
                    <span className="care-picker-icon" aria-hidden="true"><TreePine size={22} /></span>
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
