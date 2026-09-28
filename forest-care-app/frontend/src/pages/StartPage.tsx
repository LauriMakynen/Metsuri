import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TopNav from '../components/TopNav';

// Start page shown after login (and for guests): choose what to do next
export default function StartPage() {
  const { user, logout, isGuest } = useAuth();
  const navigate = useNavigate();

  const goToLogin = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="start-page">
      <TopNav />

      <main className="start-content">
        <header className="start-header">
          <h1>{isGuest ? 'Tervetuloa Metsuriin' : `Tervetuloa${user?.email ? `, ${user.email}` : ''}`}</h1>
          <p>Mitä haluat tehdä tänään?</p>
        </header>

        <div className="start-grid">
          <section className="choice-card">
            <div className="choice-icon">🌲</div>
            <h2>Hoida omaa metsääsi</h2>
            <p>
              Metsänomistajille: hae kiinteistö, merkitse metsänhoitotyöt kartalle, mittaa
              pinta-alat ja seuraa tulevia tarkastuksia. Tarvitsetko tekijää? Julkaise
              merkinnästä työpyyntö.
            </p>

            {isGuest ? (
              <>
                <div className="choice-note">
                  Vierailijana voit kokeilla demoa. Demossa tehdyt merkinnät eivät tallennu.
                </div>
                <div className="choice-actions">
                  <button className="btn btn-primary" onClick={() => navigate('/map')}>
                    Kokeile demoa
                  </button>
                  <button className="btn btn-ghost" onClick={goToLogin}>
                    Kirjaudu omalle palstalle
                  </button>
                </div>
              </>
            ) : (
              <div className="choice-actions">
                <button className="btn btn-primary" onClick={() => navigate('/map')}>
                  Avaa oma metsäpalsta
                </button>
              </div>
            )}
          </section>

          <section className="choice-card">
            <div className="choice-icon">🤝</div>
            <h2>Työn tarjoajille</h2>
            <p>
              Metsäyrittäjille, yrityksille ja yhdistyksille. Selaa kartalta metsäpalstoja,
              jotka tarvitsevat hoitoa ja joille on jätetty työpyyntö.
            </p>
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
