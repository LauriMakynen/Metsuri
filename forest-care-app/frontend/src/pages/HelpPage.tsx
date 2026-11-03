import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopNav from '../components/TopNav';

type HelpSection = {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  note?: string;
};

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'map',
    title: 'Karttanäkymä',
    intro: 'Kartalla voit tarkastella kiinteistöjä, tehtyjä töitä ja suunniteltuja työpyyntöjä.',
    steps: [
      'Valitse karttataso oikean reunan valikosta: maastokartta tai ortokuva.',
      'Avaa piste- ja viivatyökalut alareunan valikosta, kun haluat merkitä alueen tai mitata kartalla.',
      'Valitse kiinteistö klikkaamalla sen rajaa. Valittu kiinteistö näkyy myös sivupalkissa.',
      'Klikkaa kiinteistön sisällä olevaa aluetta nähdäksesi sen tiedot ja alueelle tehdyt työt.',
    ],
  },
  {
    id: 'properties',
    title: 'Kiinteistöt',
    intro: 'Lisää omat metsäkiinteistösi ja valitse tarkasteltava palsta karttaa varten.',
    steps: [
      'Avaa sivupalkista Omat kiinteistöt.',
      'Valitse Valitse kiinteistö ja klikkaa listasta haluamaasi palstaa.',
      'Voit etsiä kiinteistön tunnuksella avaamalla Hae kiinteistö -osion.',
      'Kun kiinteistö on valittu, sen rajat, tiedot ja siihen liittyvät työt tulevat näkyviin.',
      'Poista valinta painamalla valittua kiinteistöä uudelleen.',
    ],
  },
  {
    id: 'markings',
    title: 'Tehdyt työt',
    intro: 'Kirjaa kartalle metsässä tehdyt työt, jotta niiden sijainti ja tiedot säilyvät yhdessä paikassa.',
    steps: [
      'Valitse ensin kiinteistö.',
      'Avaa piste- ja viivatyökalut kartan alareunasta.',
      'Piirrä työn alue kartalle ja valitse työn tyyppi.',
      'Anna työlle tarvittaessa lisätietoja ja tallenna merkintä.',
      'Avaa Tehdyt työt -osio sivupalkista nähdäksesi kiinteistöön liittyvät merkinnät.',
    ],
  },
  {
    id: 'activity',
    title: 'GPS-aktiviteetti',
    intro: 'GPS-aktiviteetilla voit tallentaa liikkumisesi kartalle esimerkiksi maastokäynnin aikana.',
    steps: [
      'Valitse kiinteistö, jolla haluat liikkua.',
      'Paina Aloita aktiviteetti -painiketta.',
      'Salli selaimelle sijainnin käyttö, jos selain kysyy lupaa.',
      'Liiku maastossa normaalisti. Sijaintisi piirtyy kartalle aktiviteetin aikana.',
      'Lopeta aktiviteetti, tarkista yhteenveto ja tallenna se halutessasi.',
    ],
    note: 'Sijainnin tarkkuus riippuu puhelimen GPS-yhteydestä, säästä ja ympäristöstä.',
  },
  {
    id: 'requests',
    title: 'Työpyynnöt',
    intro: 'Julkaise työpyyntö, kun haluat löytää tekijän metsätyölle.',
    steps: [
      'Valitse kiinteistö ja avaa sivupalkista Työpyynnöt.',
      'Luo uusi työpyyntö ja piirrä kartalle suunniteltavan työn alue.',
      'Valitse työn tyyppi, kirjoita tarvittavat lisätiedot ja määritä hinnoittelutapa.',
      'Julkaise työpyyntö, jolloin työn tarjoajat voivat tarkastella sitä ja tehdä tarjouksen.',
      'Tarkastele saapuneita tarjouksia Työpyynnöt-osiossa.',
    ],
  },
  {
    id: 'provider',
    title: 'Työn tarjoajalle',
    intro: 'Työn tarjoajana voit selata avoimia työpyyntöjä ja jättää niihin tarjouksia.',
    steps: [
      'Valitse aloitussivulta Selaa työpyyntöjä.',
      'Suodata työpyyntöjä työtyypin, sijainnin tai etäisyyden perusteella.',
      'Avaa työpyynnön tiedot kartalta tai listasta.',
      'Anna oma tarjouksesi ja lähetä se työpyynnön yhteydessä.',
      'Näet oman tarjouksesi työpyynnön tiedoissa.',
    ],
  },
  {
    id: 'demo',
    title: 'Demotila',
    intro: 'Demotilassa voit tutustua karttaan ja toimintoihin ilman käyttäjätiliä.',
    steps: [
      'Valitse kirjautumissivulta Jatka kirjautumatta tai avaa demo aloitussivulta.',
      'Demossa näkyy valmiiksi esimerkkikiinteistö ja esimerkkimerkintöjä.',
      'Voit kokeilla kartan valintoja ja GPS-aktiviteettia turvallisesti.',
      'Demotilan muutoksia ei tallenneta palveluun.',
      'Kirjaudu sisään, kun haluat tallentaa omat kiinteistösi ja työsi.',
    ],
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const navigate = useNavigate();

  const filteredSections = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fi-FI');
    if (!normalizedQuery) return HELP_SECTIONS;

    return HELP_SECTIONS.filter((section) =>
      [section.title, section.intro, section.note, ...section.steps]
        .filter((text): text is string => Boolean(text))
        .some((text) => text.toLocaleLowerCase('fi-FI').includes(normalizedQuery)),
    );
  }, [query]);

  return (
    <div className="help-page">
      <TopNav />
      <main className="help-content">
        <button
          type="button"
          className="help-back-link"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/start');
            }
          }}
        >
          ← Takaisin
        </button>
        <header className="help-header">
          <p className="help-eyebrow">Metsurin käyttöohje</p>
          <h1>Kuinka voimme auttaa?</h1>
          <p>
            Löydät täältä ohjeet kartan, kiinteistöjen, tehtyjen töiden ja työpyyntöjen käyttöön.
          </p>
          <label className="help-search">
            <span>Hae käyttöohjeesta</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Esimerkiksi GPS tai työpyyntö"
            />
          </label>
        </header>

        <section className="help-sections" aria-label="Käyttöohjeen aiheet">
          {filteredSections.map((section) => {
            const isOpen = openSection === section.id;
            return (
              <article className={`help-section ${isOpen ? 'open' : ''}`} key={section.id}>
                <button
                  type="button"
                  className="help-section-toggle"
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                  aria-expanded={isOpen}
                  aria-controls={`help-${section.id}`}
                >
                  <span>{section.title}</span>
                  <span className="help-chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="help-section-content" id={`help-${section.id}`}>
                    <p>{section.intro}</p>
                    <ol>
                      {section.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                    {section.note && <p className="help-note">{section.note}</p>}
                  </div>
                )}
              </article>
            );
          })}
          {filteredSections.length === 0 && (
            <p className="help-empty">Ohjeista ei löytynyt hakusanalla “{query}”. Kokeile toista hakusanaa.</p>
          )}
        </section>

      </main>
    </div>
  );
}
