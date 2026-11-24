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
    id: 'account',
    title: 'Käyttäjätili ja kirjautuminen',
    intro: 'Kirjaudu sisään, kun haluat tallentaa tietoja.',
    steps: [
      'Luo tili tai kirjaudu sisään.',
      'Unohtuneen salasanan voi vaihtaa kirjautumissivun palautuslinkillä.',
      'Kirjaudu ulos yläpalkista.',
    ],
  },
  {
    id: 'map',
    title: 'Karttanäkymä',
    intro: 'Kartalla näet palstat, työt ja työpyynnöt.',
    steps: [
      'Valitse karttataso kartan valikosta.',
      'Valitse palsta kartalta tai sivupalkista.',
      'Käytä piirtämis- ja mittaustyökaluja kartan alareunasta.',
    ],
  },
  {
    id: 'properties',
    title: 'Kiinteistöt',
    intro: 'Lisää palstat ja valitse niistä tarkasteltava palsta.',
    steps: [
      'Avaa Omat kiinteistöt.',
      'Lisää palsta kartalta tai kiinteistötunnuksella.',
      'Valitse palsta nähdäksesi sen tiedot.',
    ],
  },
  {
    id: 'markings',
    title: 'Tehdyt työt',
    intro: 'Tallenna tehdyt työt palstan kartalle.',
    steps: [
      'Valitse palsta.',
      'Piirrä työn sijainti kartalle.',
      'Valitse työn tyyppi, lisää tiedot ja tallenna.',
    ],
  },
  {
    id: 'activity',
    title: 'GPS-aktiviteetti',
    intro: 'GPS-aktiviteetti tallentaa kulkemasi reitin kartalle.',
    steps: [
      'Valitse palsta ja paina Aloita aktiviteetti.',
      'Salli sijainnin käyttö.',
      'Lopeta aktiviteetti ja tallenna se.',
    ],
    note: 'Sijainnin tarkkuus riippuu puhelimen GPS-yhteydestä, säästä ja ympäristöstä.',
  },
  {
    id: 'requests',
    title: 'Työpyynnöt',
    intro: 'Julkaise työpyyntö, kun tarvitset tekijän metsätyölle.',
    steps: [
      'Avaa Työpyynnöt ja valitse uusi työpyyntö.',
      'Täytä työn tiedot ja sijainti.',
      'Julkaise pyyntö ja seuraa tarjouksia.',
    ],
  },
  
  {
    id: 'chat',
    title: 'Chatit ja tarjousketjut',
    intro: 'Tarjouskohtaisessa chatissa voit keskustella työn yksityiskohdista ja tarjouksista.',
    steps: [
      'Avaa chat puhekuvakkeesta.',
      'Valitse keskustelu ja kirjoita viesti.',
      'Voit lähettää myös kuvan.',
      'Hyväksy, hylkää tai tee vastatarjous.',
      'Tarjouksen voi myös perua.',
    ],
  },
  {
    id: 'notifications',
    title: 'Ilmoitukset',
    intro: 'Ilmoitukset kertovat uusista viesteistä ja tarjouksista.',
    steps: [
      'Avaa ilmoitukset kellokuvakkeesta.',
      'Valitse ilmoitus siirtyäksesi sen kohteeseen.',
      'Merkitse kaikki ilmoitukset luetuiksi tarvittaessa.',
    ],
  },
  {
    id: 'provider',
    title: 'Työn tarjoajalle',
    intro: 'Työn tarjoaja voi etsiä työpyyntöjä ja tehdä tarjouksia.',
    steps: [
      'Selaa avoimia työpyyntöjä.',
      'Avaa työpyyntö ja tee tarjous.',
      'Keskustele omistajan kanssa tarjouskohtaisessa chatissa.',
    ],
  },
  {
    id: 'forest-value',
    title: 'Metsän arviolaskenta',
    intro: 'Metsäarvio näyttää palstan puustoon perustuvan suuntaa-antavan arvion.',
    steps: [
      'Avaa palstan metsäarvio.',
      'Tarkastele yhteenvetoa ja kuviotietoja.',
    ],
    note: 'Arvio on suuntaa-antava, ei koko kiinteistön markkina-arvo.',
  },
  {
    id: 'demo',
    title: 'Demotila',
    intro: 'Demossa voit kokeilla sovellusta ilman käyttäjätiliä.',
    steps: [
      'Valitse Jatka kirjautumatta.',
      'Kokeile karttaa ja toimintoja.',
      'Kirjaudu sisään, kun haluat tallentaa tietoja.',
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
            Löydät täältä ohjeet kirjautumiseen, kartan, kiinteistöjen, tehtyjen töiden,
            aktiviteettien, työpyyntöjen, tarjousten, chatien ja ilmoitusten käyttöön.
          </p>
          <label className="help-search">
            <span>Hae käyttöohjeesta</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Esimerkiksi GPS, tarjous tai chat"
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
