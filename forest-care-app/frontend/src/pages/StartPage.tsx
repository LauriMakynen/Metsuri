import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TopNav from '../components/TopNav';

// Spruce treeline silhouette used at the bottom edge of the hero
const TREELINE_PATH =
  'M0 120 V90 L30 50 L45 70 L60 20 L75 70 L90 55 L110 85 L135 40 L150 65 L170 10 L190 65 L205 45 L225 90 ' +
  'L250 55 L265 75 L285 25 L305 75 L320 60 L340 95 L365 45 L380 70 L400 15 L420 70 L435 50 L455 90 L480 35 ' +
  'L500 70 L520 5 L540 70 L555 55 L575 90 L600 45 L615 70 L635 20 L655 70 L670 50 L690 95 L715 40 L730 65 ' +
  'L750 10 L770 65 L785 50 L805 90 L830 50 L845 75 L865 25 L885 75 L900 55 L920 95 L945 40 L960 70 L980 15 ' +
  'L1000 70 L1015 50 L1035 90 L1060 45 L1075 70 L1095 20 L1115 70 L1130 55 L1150 90 L1175 40 L1200 75 V120 Z';

const OWNER_FEATURES = [
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

  const goToLogin = () => {
    logout();
    navigate('/login');
  };

  const openOwnForest = isGuest ? goToLogin : () => navigate('/omat-metsat');
  const greeting = isGuest ? 'Tervetuloa Metsuriin' : `Tervetuloa takaisin${user?.email ? `, ${user.email}` : ''}`;

  return (
    <div className="start-page">
      <TopNav />

      <section className="hero">
        <div className="hero-inner">
          <p className="hero-eyebrow">{greeting}</p>
          <h1 className="hero-title">Metsäsi hoito yhdellä kartalla</h1>
          <p className="hero-lead">
            Suunnittele metsänhoitotyöt omalle palstallesi ja löydä niille tekijät, tai selaa
            palstoja, jotka odottavat hoitoa.
          </p>

          <div className="hero-actions">
            <button className="hero-btn hero-btn-primary" onClick={openOwnForest}>
              🌲 {isGuest ? 'Kirjaudu omalle palstalle' : 'Minun metsäni'}
            </button>
            <button className="hero-btn hero-btn-secondary" onClick={() => navigate('/tyontarjoajat')}>
              🤝 Selaa työpyyntöjä
            </button>
          </div>

          {isGuest && (
            <button className="hero-demo-link" onClick={() => navigate('/map')}>
              tai kokeile demoa ilman kirjautumista →
            </button>
          )}

        </div>

        <svg className="hero-treeline" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <path d={TREELINE_PATH} className="treeline-back" transform="translate(-40 -18)" />
          <path d={TREELINE_PATH} className="treeline-front" />
        </svg>
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
    </div>
  );
}
